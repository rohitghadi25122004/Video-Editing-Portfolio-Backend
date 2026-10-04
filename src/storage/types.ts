/** Where the item list and uploaded media live. */
export interface Storage {
  /** The stored items document as JSON text, or null if nothing was saved yet. */
  readDoc(): Promise<string | null>;
  writeDoc(json: string): Promise<void>;
  /**
   * A one-time target the admin browser uploads a file to directly, plus the
   * public URL the file will have once uploaded.
   */
  createUpload(key: string, contentType: string): Promise<UploadTarget>;
  /** The storage key behind a public URL, if this storage owns that URL. */
  keyFromUrl(url: string): string | null;
  deleteKey(key: string): Promise<void>;
}

/**
 * PUT: send the file as the raw body with these headers (local, S3).
 * POST: send a multipart form with these fields plus the file as "file" (Cloudinary).
 */
export type UploadTarget =
  | { method: "PUT"; url: string; headers: Record<string, string>; publicUrl: string }
  | { method: "POST"; url: string; fields: Record<string, string>; publicUrl: string };

/** Upload keys look like "videos/<uuid>.mp4" or "covers/<uuid>.webp". */
export const UPLOAD_KEY = /^(videos|covers)\/[0-9a-f-]{36}\.(mp4|webp|jpg|png)$/;
