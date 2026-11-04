/**
 * The storage services the cloud setup offers, and tidying what people paste.
 *
 * Picking a service fills in the address pattern and region, and says where
 * that service shows its keys. The provider's own words (bucket, endpoint,
 * region, access key, secret key) are kept here, as people copy them from the
 * provider's site (spec 16, Words).
 */

export type CloudServiceId = 'aws' | 'r2' | 'b2' | 'wasabi' | 'spaces' | 'minio' | 'other'

export interface CloudService {
    readonly id: CloudServiceId
    readonly label: string
    /** What the endpoint looks like, shown as the field's placeholder. Empty for Amazon, where the region decides it. */
    readonly endpoint: string
    readonly region: string
    /** Where this service shows its keys, in one line. */
    readonly hint: string
}

export const CLOUD_SERVICES: readonly CloudService[] = [
    {
        id: 'r2',
        label: 'Cloudflare R2',
        endpoint: '<account-id>.r2.cloudflarestorage.com',
        region: 'auto',
        hint: 'In the Cloudflare dashboard: R2, Manage API tokens, Create API token. The endpoint is on the same page.',
    },
    {
        id: 'b2',
        label: 'Backblaze B2',
        endpoint: 's3.<region>.backblazeb2.com',
        region: 'us-west-004',
        hint: "In Backblaze: Application Keys, Add a New Application Key. The bucket's page shows its endpoint; the region is the part after s3.",
    },
    {
        id: 'aws',
        label: 'Amazon S3',
        endpoint: '',
        region: 'us-east-1',
        hint: 'In the AWS console: IAM, Users, Security credentials, Create access key. The region is where the bucket was made.',
    },
    {
        id: 'wasabi',
        label: 'Wasabi',
        endpoint: 's3.<region>.wasabisys.com',
        region: 'us-east-1',
        hint: 'In the Wasabi console: Access Keys, Create New Access Key.',
    },
    {
        id: 'spaces',
        label: 'DigitalOcean Spaces',
        endpoint: '<region>.digitaloceanspaces.com',
        region: 'nyc3',
        hint: 'In DigitalOcean: API, Spaces Keys, Generate New Key.',
    },
    {
        id: 'minio',
        label: 'MinIO',
        endpoint: 'minio.example.com:9000',
        region: 'us-east-1',
        hint: 'In the MinIO console: Access Keys, Create access key. The endpoint is the address and port of your MinIO server, such as localhost:9000 on this computer.',
    },
    {
        id: 'other',
        label: 'Other',
        endpoint: 'storage.example.com',
        region: 'us-east-1',
        hint: 'Any storage that speaks the S3 API. Its own site shows the endpoint, region and keys.',
    },
]

export const findCloudService = (id: string): CloudService | undefined => CLOUD_SERVICES.find((service) => service.id === id)

/**
 * The storage address alone, from whatever was pasted: `https://` in front,
 * a bucket name or a path after, and spaces around it are taken off. A bucket
 * found in the path comes back too, so it can fill the bucket field.
 */
export function tidyEndpoint(pasted: string): {endpoint: string; bucket: string | null} {
    const withoutScheme = pasted.trim().replace(/^[a-z][a-z0-9+.-]*:\/\//i, '')
    const [host, ...path] = withoutScheme.split(/[/\\]/)
    const bucket = path.find((part) => part.trim() !== '') ?? null

    return {endpoint: host.trim().toLowerCase(), bucket: bucket ? bucket.trim() : null}
}

/** The folder in the bucket, without slashes at either end. */
export const tidyFolder = (folder: string): string => folder.trim().replace(/^\/+|\/+$/g, '')
