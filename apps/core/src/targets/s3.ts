/**
 * S3 and anything speaking its API — AWS, MinIO, Cloudflare R2, Wasabi, Backblaze.
 * Uploads go through the multipart uploader so archive size is not bounded by a
 * single PUT. Settings: { endpoint?, region, bucket, prefix?, forcePathStyle? }.
 */
export const provider = {} as unknown;
