import { createWriteStream } from "node:fs";
import { mkdir, readFile, rename, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { Transform, type Readable } from "node:stream";
import { pipeline } from "node:stream/promises";
import type { Storage, UploadTarget } from "./types.js";

const MAX_UPLOAD_BYTES = 500 * 1024 * 1024;

/**
 * Development storage on the local disk: ./data/items.json and
 * ./data/uploads. Uploads go to this server's own PUT route, which mirrors
 * how the browser uploads straight to the bucket with the s3 driver.
 */
export function createLocalStorage(dataDir: string, publicBaseUrl: string) {
  const docPath = path.join(dataDir, "items.json");
  const uploadsDir = path.join(dataDir, "uploads");
  const uploadsBase = `${publicBaseUrl}/uploads/`;

  const storage: Storage & { uploadsDir: string; receiveUpload(key: string, body: Readable): Promise<void> } = {
    uploadsDir,

    async readDoc() {
      try {
        return await readFile(docPath, "utf8");
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code === "ENOENT") return null;
        throw error;
      }
    },

    async writeDoc(json) {
      await mkdir(dataDir, { recursive: true });
      // Write then rename, so a crash never leaves half a file behind.
      const tmp = `${docPath}.tmp`;
      await writeFile(tmp, json, "utf8");
      await rename(tmp, docPath);
    },

    async createUpload(key, contentType): Promise<UploadTarget> {
      return {
        method: "PUT",
        url: `${publicBaseUrl}/api/admin/local-upload/${key}`,
        headers: { "Content-Type": contentType },
        publicUrl: uploadsBase + key,
      };
    },

    keyFromUrl(url) {
      return url.startsWith(uploadsBase) ? url.slice(uploadsBase.length) : null;
    },

    async deleteKey(key) {
      await rm(path.join(uploadsDir, key), { force: true });
    },

    async receiveUpload(key, body) {
      const target = path.join(uploadsDir, key);
      await mkdir(path.dirname(target), { recursive: true });
      let bytes = 0;
      const limit = new Transform({
        transform(chunk: Buffer, _encoding, callback) {
          bytes += chunk.length;
          callback(bytes > MAX_UPLOAD_BYTES ? new Error("File too large") : null, chunk);
        },
      });
      try {
        await pipeline(body, limit, createWriteStream(target));
      } catch (error) {
        await rm(target, { force: true });
        throw error;
      }
    },
  };
  return storage;
}
