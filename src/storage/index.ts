import path from "node:path";
import type { env as Env } from "../env.js";
import { createCloudinaryStorage, parseCloudinaryUrl } from "./cloudinary.js";
import { createLocalStorage } from "./local.js";
import { createS3Storage } from "./s3.js";
import type { Storage } from "./types.js";

/** The storage STORAGE_DRIVER picks. `local` is also returned for its upload route. */
export function createStorage(env: typeof Env, backendDir: string): { storage: Storage; local?: ReturnType<typeof createLocalStorage> } {
  switch (env.STORAGE_DRIVER) {
    case "local": {
      const local = createLocalStorage(path.join(backendDir, "data"), env.PUBLIC_BASE_URL);
      return { storage: local, local };
    }
    case "s3":
      return {
        storage: createS3Storage({
          endpoint: env.S3_ENDPOINT,
          region: env.S3_REGION,
          bucket: env.S3_BUCKET!,
          accessKeyId: env.S3_ACCESS_KEY_ID!,
          secretAccessKey: env.S3_SECRET_ACCESS_KEY!,
          publicUrl: env.S3_PUBLIC_URL!,
        }),
      };
    case "cloudinary":
      return { storage: createCloudinaryStorage({ ...cloudinaryCredentials(env), folder: env.CLOUDINARY_FOLDER }) };
  }
}

export function cloudinaryCredentials(env: typeof Env) {
  const fromUrl = env.CLOUDINARY_URL ? parseCloudinaryUrl(env.CLOUDINARY_URL) : null;
  return {
    cloudName: env.CLOUDINARY_CLOUD_NAME ?? fromUrl?.cloudName ?? "",
    apiKey: env.CLOUDINARY_API_KEY ?? fromUrl?.apiKey ?? "",
    apiSecret: env.CLOUDINARY_API_SECRET ?? fromUrl?.apiSecret ?? "",
  };
}

/** Hosts the admin page loads media previews from, for its Content Security Policy. */
export function mediaHosts(env: typeof Env) {
  if (env.STORAGE_DRIVER === "s3" && env.S3_PUBLIC_URL) return [new URL(env.S3_PUBLIC_URL).origin];
  if (env.STORAGE_DRIVER === "cloudinary") return ["https://res.cloudinary.com"];
  return [];
}
