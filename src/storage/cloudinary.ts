import { createHash } from "node:crypto";
import type { Storage } from "./types.js";

export type CloudinaryOptions = {
  cloudName: string;
  apiKey: string;
  apiSecret: string;
  /** Everything this site stores lives under this folder, e.g. "portfolio". */
  folder: string;
};

/** Cover delivery: modern format (AVIF/WebP), auto quality, never wider than 1600px. */
const COVER_TRANSFORM = "f_auto,q_auto,c_limit,w_1600";

/**
 * Parses CLOUDINARY_URL (cloudinary://<api_key>:<api_secret>@<cloud_name>),
 * the single value Cloudinary's dashboard offers to copy.
 */
export function parseCloudinaryUrl(value: string) {
  const match = value.match(/^cloudinary:\/\/([^:]+):([^@]+)@([^/?#]+)/);
  return match ? { apiKey: match[1]!, apiSecret: match[2]!, cloudName: match[3]! } : null;
}

/** Cloudinary request signature: sorted key=value pairs joined by "&", then the secret, SHA-1. */
export function cloudinarySignature(params: Record<string, string>, apiSecret: string) {
  const payload = Object.keys(params)
    .sort()
    .map((key) => `${key}=${params[key]}`)
    .join("&");
  return createHash("sha1").update(payload + apiSecret).digest("hex");
}

/**
 * Cloudinary as storage, without the SDK:
 * - media: the admin browser uploads straight to Cloudinary with a signed
 *   form (videos as video/, covers as image/), so files never pass through
 *   this server. Covers are delivered optimised; videos as the uploaded MP4.
 * - the item list: a raw JSON asset, overwritten on every save. Reads look up
 *   its current version first, so the CDN never serves a stale list.
 */
export function createCloudinaryStorage(options: CloudinaryOptions): Storage {
  const { cloudName, apiKey, apiSecret } = options;
  const folder = options.folder.replace(/^\/+|\/+$/g, "");
  const api = `https://api.cloudinary.com/v1_1/${cloudName}`;
  const delivery = `https://res.cloudinary.com/${cloudName}`;
  const docId = `${folder}/content/items.json`;
  const basicAuth = `Basic ${Buffer.from(`${apiKey}:${apiSecret}`).toString("base64")}`;

  /**
   * Media Library folder for an upload. Accounts on dynamic folders (all new
   * ones) file assets by asset_folder, not by the public_id path; accounts on
   * fixed folders ignore it and use the path.
   */
  const assetFolder = (publicId: string) => publicId.slice(0, publicId.lastIndexOf("/"));

  const signed = (params: Record<string, string>) => {
    const all = { ...params, timestamp: String(Math.floor(Date.now() / 1000)) };
    return { ...all, api_key: apiKey, signature: cloudinarySignature(all, apiSecret) };
  };

  async function call(url: string, init: RequestInit) {
    const res = await fetch(url, init);
    const data = (await res.json().catch(() => ({}))) as { error?: { message?: string } } & Record<string, unknown>;
    if (!res.ok) throw new Error(`Cloudinary ${res.status}: ${data.error?.message ?? res.statusText}`);
    return data;
  }

  function form(fields: Record<string, string>, file?: Blob, filename?: string) {
    const body = new FormData();
    for (const [key, value] of Object.entries(fields)) body.append(key, value);
    if (file) body.append("file", file, filename);
    return body;
  }

  return {
    async readDoc() {
      const res = await fetch(`${api}/resources/raw/upload/${docId}`, { headers: { Authorization: basicAuth } });
      if (res.status === 404) return null;
      if (!res.ok) throw new Error(`Cloudinary ${res.status}: could not look up the item list`);
      const { secure_url } = (await res.json()) as { secure_url: string };
      // secure_url carries the version (v123...), so the CDN copy is always current.
      const doc = await fetch(secure_url);
      if (!doc.ok) throw new Error(`Cloudinary ${doc.status}: could not read the item list`);
      return doc.text();
    },

    async writeDoc(json) {
      const fields = signed({ public_id: docId, asset_folder: assetFolder(docId), overwrite: "true", invalidate: "true" });
      await call(`${api}/raw/upload`, {
        method: "POST",
        body: form(fields, new Blob([json], { type: "application/json" }), "items.json"),
      });
    },

    async createUpload(key, contentType) {
      // key: "videos/<uuid>.mp4" or "covers/<uuid>.webp"
      const resource = contentType.startsWith("video/") ? "video" : "image";
      const ext = key.slice(key.lastIndexOf(".") + 1);
      const publicId = `${folder}/${key.slice(0, key.lastIndexOf("."))}`;
      const publicUrl =
        resource === "video"
          ? `${delivery}/video/upload/${publicId}.${ext}`
          : `${delivery}/image/upload/${COVER_TRANSFORM}/${publicId}.${ext}`;
      const fields = signed({ public_id: publicId, asset_folder: assetFolder(publicId) });
      return { method: "POST", url: `${api}/${resource}/upload`, fields, publicUrl };
    },

    keyFromUrl(url) {
      const match = url.match(new RegExp(`^${delivery.replace(/\./g, "\\.")}/(image|video)/upload/`));
      const start = url.indexOf(`/${folder}/`);
      if (!match || start < 0) return null;
      const publicId = url.slice(start + 1).replace(/\.\w+$/, "");
      return `${match[1]}:${publicId}`;
    },

    async deleteKey(key) {
      const [resource, publicId] = [key.slice(0, key.indexOf(":")), key.slice(key.indexOf(":") + 1)];
      await call(`${api}/${resource}/destroy`, {
        method: "POST",
        body: form(signed({ public_id: publicId, invalidate: "true" })),
      });
    },
  };
}
