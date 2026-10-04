import { z } from "zod";

/*
 * Mirrors PortfolioItem in frontend/src/lib/content.ts. Keep both in step.
 * Visible text never carries em or en dashes (site rule): they become hyphens.
 */
const text = (max: number) =>
  z
    .string()
    .trim()
    .max(max)
    .transform((s) => s.replace(/[–—]/g, "-"));

/** Site-relative path (seeded items: /media/...) or an absolute http(s) URL. */
const mediaUrl = z.string().max(500).regex(/^(\/[\w./-]+|https?:\/\/\S+)$/, "must be /path or an http(s) URL");

export const sourceSchema = z.discriminatedUnion("type", [
  z.object({ type: z.literal("mp4"), src: mediaUrl, loopSrc: mediaUrl.optional() }),
  z.object({
    type: z.literal("drive"),
    embedUrl: z.string().regex(/^https:\/\/drive\.google\.com\/file\/d\/[\w-]+\/preview$/, "must be a Google Drive /preview link"),
  }),
]);

export const itemSchema = z.object({
  id: z.string().regex(/^[\w-]{1,40}$/),
  malloyId: z.string().nullable().optional(),
  format: z.enum(["long-form", "short"]),
  aspect: z.enum(["16:9", "9:16"]),
  label: text(80).pipe(z.string().min(1, "label is required")),
  description: text(300).nullable(),
  categories: z.array(text(40).pipe(z.string().min(1))).max(8),
  language: text(30).nullable(),
  tools: z.array(text(40).pipe(z.string().min(1))).max(8),
  source: sourceSchema,
  cover: mediaUrl,
  coverSize: z.object({ width: z.number().int().positive(), height: z.number().int().positive() }),
  durationSeconds: z.number().nonnegative().nullable(),
  captionsVtt: mediaUrl.nullable(),
  approved: z.boolean(),
});

export type Item = z.infer<typeof itemSchema>;

/** What the admin panel sends; id and aspect are set by the server. */
export const itemInputSchema = itemSchema.omit({ id: true, aspect: true, malloyId: true }).extend({
  captionsVtt: mediaUrl.nullable().default(null),
});
export type ItemInput = z.infer<typeof itemInputSchema>;

export const itemsDocSchema = z.object({
  version: z.literal(1),
  updatedAt: z.string(),
  items: z.array(itemSchema),
});
export type ItemsDoc = z.infer<typeof itemsDocSchema>;

export const UPLOAD_TYPES = {
  "video/mp4": { kind: "video", ext: "mp4" },
  "image/webp": { kind: "cover", ext: "webp" },
  "image/jpeg": { kind: "cover", ext: "jpg" },
  "image/png": { kind: "cover", ext: "png" },
} as const;

export const uploadRequestSchema = z.object({
  contentType: z.enum(Object.keys(UPLOAD_TYPES) as [keyof typeof UPLOAD_TYPES, ...(keyof typeof UPLOAD_TYPES)[]]),
});
