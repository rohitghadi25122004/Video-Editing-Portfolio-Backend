import { DeleteObjectCommand, GetObjectCommand, NoSuchKey, PutObjectCommand, S3Client } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import type { Storage } from "./types.js";

const DOC_KEY = "content/items.json";

/**
 * Any S3-compatible bucket (Cloudflare R2, AWS S3, Backblaze B2...). The
 * item list is a private JSON object only this server reads; media sits
 * under videos/ and covers/ and is served from S3_PUBLIC_URL. The admin
 * browser uploads with presigned PUT URLs, so large videos never pass
 * through this server.
 */
export function createS3Storage(options: {
  endpoint?: string;
  region: string;
  bucket: string;
  accessKeyId: string;
  secretAccessKey: string;
  publicUrl: string;
}): Storage {
  const client = new S3Client({
    region: options.region,
    endpoint: options.endpoint,
    credentials: { accessKeyId: options.accessKeyId, secretAccessKey: options.secretAccessKey },
    // Presigned URLs must not demand checksum headers the browser cannot send.
    requestChecksumCalculation: "WHEN_REQUIRED",
    responseChecksumValidation: "WHEN_REQUIRED",
  });
  const bucket = options.bucket;
  const publicBase = `${options.publicUrl.replace(/\/$/, "")}/`;

  return {
    async readDoc() {
      try {
        const out = await client.send(new GetObjectCommand({ Bucket: bucket, Key: DOC_KEY }));
        return (await out.Body?.transformToString("utf-8")) ?? null;
      } catch (error) {
        if (error instanceof NoSuchKey) return null;
        throw error;
      }
    },

    async writeDoc(json) {
      await client.send(
        new PutObjectCommand({ Bucket: bucket, Key: DOC_KEY, Body: json, ContentType: "application/json", CacheControl: "no-store" }),
      );
    },

    async createUpload(key, contentType) {
      const url = await getSignedUrl(client, new PutObjectCommand({ Bucket: bucket, Key: key, ContentType: contentType }), {
        expiresIn: 15 * 60,
      });
      return { method: "PUT", url, headers: { "Content-Type": contentType }, publicUrl: publicBase + key };
    },

    keyFromUrl(url) {
      return url.startsWith(publicBase) ? url.slice(publicBase.length) : null;
    },

    async deleteKey(key) {
      await client.send(new DeleteObjectCommand({ Bucket: bucket, Key: key }));
    },
  };
}
