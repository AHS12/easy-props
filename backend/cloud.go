package backend

// The cloud: storage the person already has, spoken to over the S3 API. There
// is no easy-props server.
//
// Everything above this file talks to objectStore, a small interface of our
// own, as Heka does with its ObjectStore. Only s3Store knows the library
// underneath, the AWS SDK for Go v2 (spec 16, decision 1), so changing it is a
// change to this file alone. There is no delete: nothing in a backup ever
// removes anything from the bucket, so keys without delete permission work.

import (
	"bytes"
	"context"
	"errors"
	"fmt"
	"io"
	"net"
	"net/http"
	"strings"
	"time"

	"github.com/aws/aws-sdk-go-v2/aws"
	"github.com/aws/aws-sdk-go-v2/credentials"
	"github.com/aws/aws-sdk-go-v2/service/s3"
	"github.com/aws/smithy-go"
	smithyhttp "github.com/aws/smithy-go/transport/http"
)

// CloudTarget is where cloud backups go, as the setup form describes it. None
// of it is secret; the keys are kept apart, in the system's keychain.
type CloudTarget struct {
	// Service is the setup form's choice, such as "aws" or "r2". Only "aws"
	// changes anything here: it has no endpoint, as the region decides it.
	Service string `json:"service"`
	// Endpoint is the storage's address alone, such as
	// "abc.r2.cloudflarestorage.com": no scheme, bucket or path.
	Endpoint string `json:"endpoint"`
	Region   string `json:"region"`
	Bucket   string `json:"bucket"`
	// Folder is where in the bucket the backup lives, such as "easy-props".
	Folder string `json:"folder"`
	// PathStyle puts the bucket in the path rather than the address, which
	// local servers and some services need.
	PathStyle bool `json:"pathStyle"`
}

// objectInfo is one object in a listing.
type objectInfo struct {
	Key  string
	Size int64
}

// objectStore is everything a backup needs from storage.
type objectStore interface {
	put(ctx context.Context, key string, body []byte, meta map[string]string) error
	// get returns errNoSuchObject when key isn't there.
	get(ctx context.Context, key string) ([]byte, error)
	// head returns an object's metadata, or errNoSuchObject.
	head(ctx context.Context, key string) (map[string]string, error)
	list(ctx context.Context, prefix string) ([]objectInfo, error)
	// ping checks the bucket is there and these keys can reach it.
	ping(ctx context.Context) error
}

// The ways storage goes wrong that a person can do something about. The
// interface words each one; see backup-store.ts.
var (
	errNoSuchObject     = errors.New("easy-props: no such object")
	errCloudWrongKeys   = errors.New("easy-props: cloud: the storage didn't accept these keys")
	errCloudNoBucket    = errors.New("easy-props: cloud: there is no such bucket")
	errCloudNoWrite     = errors.New("easy-props: cloud: these keys can't write here")
	errCloudUnreachable = errors.New("easy-props: cloud: couldn't reach the storage")
	errCloudRedirected  = errors.New("easy-props: cloud: the address leads somewhere else")
	errCloudNoKeys      = errors.New("easy-props: cloud: no keys are saved for cloud backup")
	errCloudBadAddress  = errors.New("easy-props: cloud: that isn't a storage address")
)

// requestTimeout bounds one request, so a dead connection can't hang a backup.
const requestTimeout = 60 * time.Second

// newS3Store makes the client from the target and keys alone. It doesn't use
// the SDK's own config loading, so keys in ~/.aws, environment variables or an
// Amazon role on this computer are never picked up by accident.
func newS3Store(target CloudTarget, keys cloudKeys) (objectStore, error) {
	if target.Bucket == "" || strings.ContainsAny(target.Bucket, "/\\ ") {
		return nil, fmt.Errorf("%w: the bucket name %q", errCloudBadAddress, target.Bucket)
	}

	region := target.Region
	if region == "" {
		region = "us-east-1"
	}

	options := s3.Options{
		Region:       region,
		Credentials:  credentials.NewStaticCredentialsProvider(keys.AccessKey, keys.SecretKey, ""),
		UsePathStyle: target.PathStyle,
		HTTPClient:   &http.Client{Timeout: requestTimeout},
		// Since service/s3 v1.73 the SDK sends checksum headers by default,
		// which R2, Backblaze B2 and others refuse. Set, never left to the
		// default, so an SDK update can't turn them back on (spec 16).
		RequestChecksumCalculation: aws.RequestChecksumCalculationWhenRequired,
		ResponseChecksumValidation: aws.ResponseChecksumValidationWhenRequired,
	}

	if target.Service != "aws" {
		endpoint, err := endpointURL(target.Endpoint)
		if err != nil {
			return nil, err
		}

		options.BaseEndpoint = aws.String(endpoint)
	}

	return &s3Store{client: s3.New(options), bucket: target.Bucket}, nil
}

// endpointURL turns the address into a URL. It's HTTPS, except on this
// computer, where a local test server has no certificate.
func endpointURL(address string) (string, error) {
	host := strings.TrimSpace(address)
	if host == "" || strings.Contains(host, "://") || strings.ContainsAny(host, "/\\ ") {
		return "", fmt.Errorf("%w: %q", errCloudBadAddress, address)
	}

	name := host
	if split, _, err := net.SplitHostPort(host); err == nil {
		name = split
	}

	if name == "localhost" || name == "127.0.0.1" || name == "::1" || name == "[::1]" {
		return "http://" + host, nil
	}

	return "https://" + host, nil
}

// s3Store is objectStore on the AWS SDK for Go v2.
type s3Store struct {
	client *s3.Client
	bucket string
}

func (s *s3Store) put(ctx context.Context, key string, body []byte, meta map[string]string) error {
	_, err := s.client.PutObject(ctx, &s3.PutObjectInput{
		Bucket:        aws.String(s.bucket),
		Key:           aws.String(key),
		Body:          bytes.NewReader(body),
		ContentLength: aws.Int64(int64(len(body))),
		Metadata:      meta,
	})

	return cloudError(err, true)
}

func (s *s3Store) get(ctx context.Context, key string) ([]byte, error) {
	output, err := s.client.GetObject(ctx, &s3.GetObjectInput{Bucket: aws.String(s.bucket), Key: aws.String(key)})
	if err != nil {
		return nil, cloudError(err, false)
	}
	defer output.Body.Close()

	return io.ReadAll(io.LimitReader(output.Body, largestBackupFile+1))
}

func (s *s3Store) head(ctx context.Context, key string) (map[string]string, error) {
	output, err := s.client.HeadObject(ctx, &s3.HeadObjectInput{Bucket: aws.String(s.bucket), Key: aws.String(key)})
	if err != nil {
		return nil, cloudError(err, false)
	}

	return output.Metadata, nil
}

func (s *s3Store) list(ctx context.Context, prefix string) ([]objectInfo, error) {
	objects := []objectInfo{}
	pages := s3.NewListObjectsV2Paginator(s.client, &s3.ListObjectsV2Input{Bucket: aws.String(s.bucket), Prefix: aws.String(prefix)})

	for pages.HasMorePages() {
		page, err := pages.NextPage(ctx)
		if err != nil {
			return nil, cloudError(err, false)
		}

		for _, object := range page.Contents {
			objects = append(objects, objectInfo{Key: aws.ToString(object.Key), Size: aws.ToInt64(object.Size)})
		}
	}

	return objects, nil
}

func (s *s3Store) ping(ctx context.Context) error {
	_, err := s.client.HeadBucket(ctx, &s3.HeadBucketInput{Bucket: aws.String(s.bucket)})

	return cloudError(err, false)
}

// cloudError turns what the storage said into one of the errors above, keeping
// the original after it for the log. writing says whether a refusal means the
// keys can't write, rather than that they're wrong.
func cloudError(err error, writing bool) error {
	if err == nil {
		return nil
	}

	var apiError smithy.APIError
	if errors.As(err, &apiError) {
		switch apiError.ErrorCode() {
		case "NoSuchKey", "NotFound":
			return errNoSuchObject
		case "NoSuchBucket":
			return fmt.Errorf("%w: %v", errCloudNoBucket, err)
		case "InvalidAccessKeyId", "SignatureDoesNotMatch", "InvalidToken", "AuthorizationHeaderMalformed":
			return fmt.Errorf("%w: %v", errCloudWrongKeys, err)
		case "AccessDenied", "Forbidden":
			if writing {
				return fmt.Errorf("%w: %v", errCloudNoWrite, err)
			}

			return fmt.Errorf("%w: %v", errCloudWrongKeys, err)
		case "PermanentRedirect", "MovedPermanently", "Redirect":
			return fmt.Errorf("%w: %v", errCloudRedirected, err)
		}
	}

	// A HEAD answer has no body to name the problem, only its status.
	var response *smithyhttp.ResponseError
	if errors.As(err, &response) {
		switch status := response.HTTPStatusCode(); {
		case status == http.StatusNotFound:
			return errNoSuchObject
		case status == http.StatusMovedPermanently || status == http.StatusTemporaryRedirect || status == http.StatusPermanentRedirect:
			return fmt.Errorf("%w: %v", errCloudRedirected, err)
		case status == http.StatusForbidden && writing:
			return fmt.Errorf("%w: %v", errCloudNoWrite, err)
		case status == http.StatusForbidden || status == http.StatusUnauthorized:
			return fmt.Errorf("%w: %v", errCloudWrongKeys, err)
		}
	}

	var netError net.Error
	if errors.As(err, &netError) || strings.Contains(err.Error(), "no such host") || strings.Contains(err.Error(), "connection refused") {
		return fmt.Errorf("%w: %v", errCloudUnreachable, err)
	}

	return err
}
