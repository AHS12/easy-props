package backend

import (
	"context"
	"encoding/json"
	"encoding/xml"
	"errors"
	"io"
	"net/http"
	"net/http/httptest"
	"os"
	"path/filepath"
	"slices"
	"sort"
	"strings"
	"sync"
	"testing"
	"time"
)

// memorySecrets keeps keys in memory, so no test touches the real keychain.
type memorySecrets struct {
	keys  cloudKeys
	saved bool
}

func (m *memorySecrets) load() (cloudKeys, error) {
	if !m.saved {
		return cloudKeys{}, errCloudNoKeys
	}

	return m.keys, nil
}

func (m *memorySecrets) save(keys cloudKeys) error {
	m.keys, m.saved = keys, true
	return nil
}

func (m *memorySecrets) forget() error {
	m.keys, m.saved = cloudKeys{}, false
	return nil
}

type storedObject struct {
	body []byte
	meta map[string]string
}

// fakeBucket is objectStore in memory, recording every put.
type fakeBucket struct {
	mu      sync.Mutex
	objects map[string]storedObject
	puts    []string
}

func newFakeBucket() *fakeBucket {
	return &fakeBucket{objects: map[string]storedObject{}}
}

func (b *fakeBucket) put(_ context.Context, key string, body []byte, meta map[string]string) error {
	b.mu.Lock()
	defer b.mu.Unlock()

	b.objects[key] = storedObject{body: append([]byte(nil), body...), meta: meta}
	b.puts = append(b.puts, key)

	return nil
}

func (b *fakeBucket) get(_ context.Context, key string) ([]byte, error) {
	b.mu.Lock()
	defer b.mu.Unlock()

	object, found := b.objects[key]
	if !found {
		return nil, errNoSuchObject
	}

	return object.body, nil
}

func (b *fakeBucket) head(_ context.Context, key string) (map[string]string, error) {
	b.mu.Lock()
	defer b.mu.Unlock()

	object, found := b.objects[key]
	if !found {
		return nil, errNoSuchObject
	}

	return object.meta, nil
}

func (b *fakeBucket) list(_ context.Context, prefix string) ([]objectInfo, error) {
	b.mu.Lock()
	defer b.mu.Unlock()

	found := []objectInfo{}
	for key, object := range b.objects {
		if strings.HasPrefix(key, prefix) {
			found = append(found, objectInfo{Key: key, Size: int64(len(object.body))})
		}
	}

	sort.Slice(found, func(i, j int) bool { return found[i].Key < found[j].Key })

	return found, nil
}

func (b *fakeBucket) ping(context.Context) error { return nil }

// takePuts returns the keys put since the last call.
func (b *fakeBucket) takePuts() []string {
	b.mu.Lock()
	defer b.mu.Unlock()

	puts := b.puts
	b.puts = nil
	slices.Sort(puts)

	return puts
}

var testTarget = CloudTarget{Service: "r2", Endpoint: "abc.r2.cloudflarestorage.com", Region: "auto", Bucket: "props", Folder: "easy-props"}

// newCloudApp is a computer with its own saved props, settings and keys,
// backing up to bucket.
func newCloudApp(t *testing.T, bucket *fakeBucket) *App {
	t.Helper()

	app := newBackupApp(t)
	app.secrets = &memorySecrets{keys: cloudKeys{AccessKey: "id", SecretKey: "secret"}, saved: true}
	app.cloudStoreFor = func(CloudTarget, cloudKeys) (objectStore, error) { return bucket, nil }

	return app
}

func backUp(t *testing.T, app *App) CloudSummary {
	t.Helper()

	summary, err := app.BackUpToCloud(testTarget, []byte(`[]`), "0.4.0")
	if err != nil {
		t.Fatal(err)
	}

	return summary
}

func TestTheFirstCloudBackupUploadsEverything(t *testing.T) {
	bucket := newFakeBucket()
	app := newCloudApp(t, bucket)
	savedAtTime(t, app, "oak", time.Now())

	summary := backUp(t, app)

	want := []string{"easy-props/backup.json", "easy-props/palettes.json", "easy-props/props/oak.json", "easy-props/props/oak.png"}
	if got := bucket.takePuts(); !slices.Equal(got, want) {
		t.Fatalf("puts = %v, want %v", got, want)
	}

	if summary.Props != 1 || summary.Uploaded != 2 {
		t.Fatalf("summary = %+v", summary)
	}

	meta := bucket.objects["easy-props/props/oak.json"].meta
	if len(meta[metaSHA256]) != 64 || meta[metaSavedAt] == "" {
		t.Fatalf("metadata = %v", meta)
	}
}

func TestASecondCloudBackupWithNothingChangedUploadsNothing(t *testing.T) {
	bucket := newFakeBucket()
	app := newCloudApp(t, bucket)
	savedAtTime(t, app, "oak", time.Now())

	backUp(t, app)
	bucket.takePuts()

	if summary := backUp(t, app); summary.Uploaded != 0 {
		t.Fatalf("summary = %+v", summary)
	}

	if puts := bucket.takePuts(); len(puts) != 0 {
		t.Fatalf("puts = %v, want none", puts)
	}
}

func TestChangingOnePropUploadsOnlyItAndTheList(t *testing.T) {
	bucket := newFakeBucket()
	app := newCloudApp(t, bucket)
	savedAtTime(t, app, "oak", time.Now().Add(-time.Hour))
	savedAtTime(t, app, "pine", time.Now().Add(-time.Hour))

	backUp(t, app)
	bucket.takePuts()

	if err := app.WriteProp("oak", []byte(`{"name":"oak, taller"}`), nil); err != nil {
		t.Fatal(err)
	}

	backUp(t, app)

	want := []string{"easy-props/backup.json", "easy-props/props/oak.json"}
	if got := bucket.takePuts(); !slices.Equal(got, want) {
		t.Fatalf("puts = %v, want %v", got, want)
	}
}

func TestAPropRemovedHereIsMarkedAndItsFilesStay(t *testing.T) {
	bucket := newFakeBucket()
	app := newCloudApp(t, bucket)
	savedAtTime(t, app, "oak", time.Now())

	backUp(t, app)

	if err := app.RemoveProp("oak"); err != nil {
		t.Fatal(err)
	}

	if summary := backUp(t, app); summary.Removed != 1 {
		t.Fatalf("summary = %+v", summary)
	}

	if _, found := bucket.objects["easy-props/removed/oak.json"]; !found {
		t.Fatal("no removed mark")
	}

	if _, found := bucket.objects["easy-props/props/oak.json"]; !found {
		t.Fatal("the removed prop's file was taken out of the bucket")
	}
}

func TestAPropOnlyAnotherComputerHasIsNeverMarkedRemoved(t *testing.T) {
	bucket := newFakeBucket()
	first := newCloudApp(t, bucket)
	savedAtTime(t, first, "oak", time.Now())
	backUp(t, first)

	second := newCloudApp(t, bucket)
	savedAtTime(t, second, "pine", time.Now())

	if summary := backUp(t, second); summary.Removed != 0 {
		t.Fatalf("summary = %+v", summary)
	}

	if _, found := bucket.objects["easy-props/removed/oak.json"]; found {
		t.Fatal("the other computer's prop was marked removed")
	}
}

func TestANewerPropFromAnotherComputerIsNotOverwritten(t *testing.T) {
	bucket := newFakeBucket()

	laptop := newCloudApp(t, bucket)
	savedAtTime(t, laptop, "oak", time.Date(2026, time.November, 1, 9, 0, 0, 0, time.UTC))

	desktop := newCloudApp(t, bucket)
	if err := desktop.WriteProp("oak", []byte(`{"name":"oak from the desktop"}`), nil); err != nil {
		t.Fatal(err)
	}

	newer := time.Date(2026, time.November, 3, 9, 0, 0, 0, time.UTC)
	if err := os.Chtimes(filepath.Join(desktop.libraryRoot, "oak.json"), newer, newer); err != nil {
		t.Fatal(err)
	}

	backUp(t, desktop)

	if summary := backUp(t, laptop); summary.ChangedElsewhere != 1 {
		t.Fatalf("summary = %+v", summary)
	}

	if got := string(bucket.objects["easy-props/props/oak.json"].body); got != `{"name":"oak from the desktop"}` {
		t.Fatalf("the bucket holds %q", got)
	}
}

func TestTheListIsRebuiltFromTheObjectsWhenItIsMissing(t *testing.T) {
	bucket := newFakeBucket()
	app := newCloudApp(t, bucket)
	savedAtTime(t, app, "oak", time.Date(2026, time.March, 3, 9, 30, 0, 0, time.UTC))

	backUp(t, app)
	delete(bucket.objects, "easy-props/backup.json")

	manifest, err := readCloudManifest(context.Background(), bucket, testTarget)
	if err != nil {
		t.Fatal(err)
	}

	entries := manifestByPath(manifest)
	if entries["oak.json"].SavedAt != "2026-03-03T09:30:00Z" || len(entries["oak.json"].SHA256) != 64 || entries["oak.png"].Path == "" {
		t.Fatalf("rebuilt = %+v", manifest.Files)
	}
}

func TestTwoComputersEntriesAreMergedNotReplaced(t *testing.T) {
	bucket := newFakeBucket()

	first := newCloudApp(t, bucket)
	savedAtTime(t, first, "oak", time.Now())
	backUp(t, first)

	second := newCloudApp(t, bucket)
	savedAtTime(t, second, "pine", time.Now())
	backUp(t, second)

	var manifest backupManifest
	if err := json.Unmarshal(bucket.objects["easy-props/backup.json"].body, &manifest); err != nil {
		t.Fatal(err)
	}

	entries := manifestByPath(manifest)
	if entries["oak.json"].Path == "" || entries["pine.json"].Path == "" {
		t.Fatalf("list = %+v", manifest.Files)
	}
}

func TestRestoringFromTheCloudBringsBackPropsAndRemovedOnes(t *testing.T) {
	bucket := newFakeBucket()
	old := newCloudApp(t, bucket)
	saved := time.Date(2026, time.March, 3, 9, 30, 0, 0, time.UTC)
	savedAtTime(t, old, "oak", saved)
	savedAtTime(t, old, "gone", saved)
	backUp(t, old)

	if err := old.RemoveProp("gone"); err != nil {
		t.Fatal(err)
	}

	backUp(t, old)

	// A new computer, with the same keys.
	fresh := newCloudApp(t, bucket)

	held, err := fresh.OpenCloudBackup(testTarget)
	if err != nil {
		t.Fatal(err)
	}

	statuses := map[string]string{}
	for _, prop := range held.Props {
		statuses[prop.ID] = prop.Status
	}

	if statuses["oak"] != "new" || statuses["gone"] != "removed" || held.Palettes != "[]" {
		t.Fatalf("statuses = %v, palettes = %q", statuses, held.Palettes)
	}

	if restored, err := fresh.RestoreFromHolding([]RestoreChoice{{ID: "oak"}}); err != nil || restored != 1 {
		t.Fatalf("restored %d, %v", restored, err)
	}

	props, _ := fresh.ListProps()
	if len(props) != 1 || props[0].SavedAt != saved.Format(time.RFC3339) || !props[0].HasPicture {
		t.Fatalf("props = %+v", props)
	}
}

func TestCheckingTheConnectionLeavesOnlyTheProbe(t *testing.T) {
	bucket := newFakeBucket()
	app := newCloudApp(t, bucket)

	if err := app.CheckCloudBackup(testTarget); err != nil {
		t.Fatal(err)
	}

	if got := bucket.takePuts(); !slices.Equal(got, []string{"easy-props/.easy-props-check"}) {
		t.Fatalf("puts = %v", got)
	}
}

func TestTheSecretKeyIsKeptApartAndNeverHandedBack(t *testing.T) {
	secrets := &memorySecrets{}
	app := newBackupApp(t)
	app.secrets = secrets

	if app.CloudKeys().Saved {
		t.Fatal("keys were said to be saved before any were")
	}

	if err := app.SetCloudKeys("id", "very secret"); err != nil {
		t.Fatal(err)
	}

	// Changing only the access key keeps the secret.
	if err := app.SetCloudKeys("id2", ""); err != nil || secrets.keys.SecretKey != "very secret" {
		t.Fatalf("keys = %+v, %v", secrets.keys, err)
	}

	info, _ := json.Marshal(app.CloudKeys())
	if strings.Contains(string(info), "very secret") {
		t.Fatalf("the secret was handed back: %s", info)
	}

	settings, _ := app.ReadSettings()
	if strings.Contains(string(settings), "very secret") {
		t.Fatal("the secret reached the settings file")
	}

	if err := app.ForgetCloudKeys(); err != nil || app.CloudKeys().Saved {
		t.Fatalf("keys after forgetting = %+v, %v", app.CloudKeys(), err)
	}
}

func TestWithoutKeysNothingReachesTheStorage(t *testing.T) {
	app := newBackupApp(t)
	app.secrets = &memorySecrets{}

	if _, err := app.BackUpToCloud(testTarget, nil, "0.4.0"); !errors.Is(err, errCloudNoKeys) {
		t.Fatalf("BackUpToCloud = %v, want errCloudNoKeys", err)
	}
}

func TestOnlyHTTPSIsUsedExceptOnThisComputer(t *testing.T) {
	cases := map[string]string{
		"abc.r2.cloudflarestorage.com":      "https://abc.r2.cloudflarestorage.com",
		"s3.eu-central-003.backblazeb2.com": "https://s3.eu-central-003.backblazeb2.com",
		"localhost:3900":                    "http://localhost:3900",
		"127.0.0.1:9000":                    "http://127.0.0.1:9000",
	}

	for address, want := range cases {
		if got, err := endpointURL(address); err != nil || got != want {
			t.Fatalf("endpointURL(%q) = %q, %v, want %q", address, got, err, want)
		}
	}

	for _, address := range []string{"", "http://abc.example.com", "abc.example.com/bucket", "a b"} {
		if _, err := endpointURL(address); !errors.Is(err, errCloudBadAddress) {
			t.Fatalf("endpointURL(%q) = %v, want errCloudBadAddress", address, err)
		}
	}
}

// fakeS3 is a small S3 server for the four requests the client makes, recording
// each request's headers. It's enough to check what the real client sends.
type fakeS3 struct {
	mu       sync.Mutex
	objects  map[string]storedObject
	requests []*http.Request
	answer   func(w http.ResponseWriter, r *http.Request) bool
}

func (f *fakeS3) ServeHTTP(w http.ResponseWriter, r *http.Request) {
	f.mu.Lock()
	defer f.mu.Unlock()

	f.requests = append(f.requests, r)

	if f.answer != nil && f.answer(w, r) {
		return
	}

	// Path style: /bucket/key.
	bucket, key, _ := strings.Cut(strings.TrimPrefix(r.URL.Path, "/"), "/")
	if bucket != "props" {
		w.WriteHeader(http.StatusNotFound)
		_, _ = io.WriteString(w, `<Error><Code>NoSuchBucket</Code></Error>`)
		return
	}

	switch {
	case r.Method == http.MethodPut:
		body, _ := io.ReadAll(r.Body)
		meta := map[string]string{}
		for name := range r.Header {
			if lower := strings.ToLower(name); strings.HasPrefix(lower, "x-amz-meta-") {
				meta[strings.TrimPrefix(lower, "x-amz-meta-")] = r.Header.Get(name)
			}
		}
		f.objects[key] = storedObject{body: body, meta: meta}
		w.WriteHeader(http.StatusOK)
	case r.Method == http.MethodGet && r.URL.Query().Get("list-type") == "2":
		type content struct {
			Key  string `xml:"Key"`
			Size int64  `xml:"Size"`
		}
		result := struct {
			XMLName  xml.Name  `xml:"ListBucketResult"`
			Contents []content `xml:"Contents"`
		}{}
		for stored, object := range f.objects {
			if strings.HasPrefix(stored, r.URL.Query().Get("prefix")) {
				result.Contents = append(result.Contents, content{Key: stored, Size: int64(len(object.body))})
			}
		}
		_ = xml.NewEncoder(w).Encode(result)
	case key == "" && r.Method == http.MethodHead:
		w.WriteHeader(http.StatusOK)
	default:
		object, found := f.objects[key]
		if !found {
			w.WriteHeader(http.StatusNotFound)
			if r.Method == http.MethodGet {
				_, _ = io.WriteString(w, `<Error><Code>NoSuchKey</Code></Error>`)
			}
			return
		}
		for name, value := range object.meta {
			w.Header().Set("x-amz-meta-"+name, value)
		}
		if r.Method == http.MethodGet {
			_, _ = w.Write(object.body)
		}
	}
}

func newFakeS3(t *testing.T) (*fakeS3, CloudTarget) {
	t.Helper()

	server := &fakeS3{objects: map[string]storedObject{}}
	listener := httptest.NewServer(server)
	t.Cleanup(listener.Close)

	target := CloudTarget{
		Service:   "other",
		Endpoint:  strings.TrimPrefix(listener.URL, "http://"),
		Region:    "auto",
		Bucket:    "props",
		Folder:    "easy-props",
		PathStyle: true,
	}

	return server, target
}

func TestTheS3ClientSendsNoChecksumHeaders(t *testing.T) {
	server, target := newFakeS3(t)

	store, err := newS3Store(target, cloudKeys{AccessKey: "id", SecretKey: "secret"})
	if err != nil {
		t.Fatal(err)
	}

	ctx := context.Background()
	if err := store.put(ctx, "easy-props/props/oak.json", []byte(`{"name":"oak"}`), map[string]string{metaSHA256: "abc"}); err != nil {
		t.Fatal(err)
	}

	if _, err := store.get(ctx, "easy-props/props/oak.json"); err != nil {
		t.Fatal(err)
	}

	for _, request := range server.requests {
		for name := range request.Header {
			lower := strings.ToLower(name)
			if strings.HasPrefix(lower, "x-amz-checksum") || strings.HasPrefix(lower, "x-amz-sdk-checksum") || lower == "x-amz-trailer" {
				t.Fatalf("%s %s sent %s, which R2 and B2 refuse", request.Method, request.URL.Path, name)
			}
		}
	}

	if path := server.requests[0].URL.Path; path != "/props/easy-props/props/oak.json" {
		t.Fatalf("path = %q, want the bucket in the path", path)
	}
}

func TestTheS3ClientRoundTripsThroughTheServer(t *testing.T) {
	_, target := newFakeS3(t)

	store, err := newS3Store(target, cloudKeys{AccessKey: "id", SecretKey: "secret"})
	if err != nil {
		t.Fatal(err)
	}

	ctx := context.Background()
	if err := store.ping(ctx); err != nil {
		t.Fatalf("ping = %v", err)
	}

	if err := store.put(ctx, "easy-props/props/oak.json", []byte("oak"), map[string]string{metaSHA256: "abc", metaSavedAt: "2026-11-04T10:00:00Z"}); err != nil {
		t.Fatal(err)
	}

	meta, err := store.head(ctx, "easy-props/props/oak.json")
	if err != nil || meta[metaSHA256] != "abc" || meta[metaSavedAt] != "2026-11-04T10:00:00Z" {
		t.Fatalf("head = %v, %v", meta, err)
	}

	listed, err := store.list(ctx, "easy-props/props/")
	if err != nil || len(listed) != 1 || listed[0].Key != "easy-props/props/oak.json" {
		t.Fatalf("list = %+v, %v", listed, err)
	}

	if _, err := store.get(ctx, "easy-props/missing.json"); !errors.Is(err, errNoSuchObject) {
		t.Fatalf("get missing = %v, want errNoSuchObject", err)
	}

	if _, err := store.head(ctx, "easy-props/missing.json"); !errors.Is(err, errNoSuchObject) {
		t.Fatalf("head missing = %v, want errNoSuchObject", err)
	}
}

func TestTheStoragesRefusalsBecomePlainErrors(t *testing.T) {
	cases := []struct {
		status int
		body   string
		method string
		want   error
	}{
		{http.StatusForbidden, `<Error><Code>InvalidAccessKeyId</Code></Error>`, http.MethodGet, errCloudWrongKeys},
		{http.StatusForbidden, `<Error><Code>SignatureDoesNotMatch</Code></Error>`, http.MethodGet, errCloudWrongKeys},
		{http.StatusForbidden, `<Error><Code>AccessDenied</Code></Error>`, http.MethodPut, errCloudNoWrite},
		{http.StatusNotFound, `<Error><Code>NoSuchBucket</Code></Error>`, http.MethodGet, errCloudNoBucket},
		{http.StatusMovedPermanently, `<html>Moved</html>`, http.MethodGet, errCloudRedirected},
	}

	for _, test := range cases {
		server, target := newFakeS3(t)
		server.answer = func(w http.ResponseWriter, _ *http.Request) bool {
			w.WriteHeader(test.status)
			_, _ = io.WriteString(w, test.body)
			return true
		}

		store, err := newS3Store(target, cloudKeys{AccessKey: "id", SecretKey: "secret"})
		if err != nil {
			t.Fatal(err)
		}

		if test.method == http.MethodPut {
			err = store.put(context.Background(), "easy-props/x", []byte("x"), nil)
		} else {
			_, err = store.get(context.Background(), "easy-props/x")
		}

		if !errors.Is(err, test.want) {
			t.Fatalf("%d %s: %v, want %v", test.status, test.body, err, test.want)
		}
	}
}

func TestAnUnreachableStorageSaysSo(t *testing.T) {
	store, err := newS3Store(CloudTarget{Service: "other", Endpoint: "127.0.0.1:1", Bucket: "props", PathStyle: true}, cloudKeys{AccessKey: "id", SecretKey: "secret"})
	if err != nil {
		t.Fatal(err)
	}

	if err := store.ping(context.Background()); !errors.Is(err, errCloudUnreachable) {
		t.Fatalf("ping = %v, want errCloudUnreachable", err)
	}
}

func TestAPropSaysWhetherItIsBackedUp(t *testing.T) {
	bucket := newFakeBucket()
	app := newCloudApp(t, bucket)
	savedAtTime(t, app, "oak", time.Now())

	status := func() string {
		t.Helper()

		got, err := app.CloudPropStatus(testTarget, "oak")
		if err != nil {
			t.Fatal(err)
		}

		return got
	}

	if got := status(); got != "not-yet" {
		t.Fatalf("before any backup: %q", got)
	}

	backUp(t, app)

	if got := status(); got != "backed-up" {
		t.Fatalf("after a backup: %q", got)
	}

	if err := app.WriteProp("oak", []byte(`{"name":"oak, changed"}`), nil); err != nil {
		t.Fatal(err)
	}

	if got := status(); got != "changed" {
		t.Fatalf("after saving again: %q", got)
	}

	// Another bucket knows nothing of it.
	other := testTarget
	other.Bucket = "elsewhere"

	if got, _ := app.CloudPropStatus(other, "oak"); got != "not-yet" {
		t.Fatalf("for another bucket: %q", got)
	}
}
