import { z } from "zod";

// Local development reads ./.env; hosts inject real environment variables.
try {
  process.loadEnvFile();
} catch {
  // No .env file: fine in production.
}

const blankToUndefined = (value: unknown) => (typeof value === "string" && value.trim() === "" ? undefined : value);
const optional = z.preprocess(blankToUndefined, z.string().optional());
const origin = z.string().regex(/^https?:\/\/[^/\s]+$/, "must be an origin like https://example.com (no trailing slash)");

const schema = z
  .object({
    NODE_ENV: z.enum(["development", "production", "test"]).default("development"),
    PORT: z.coerce.number().int().positive().default(4000),
    PUBLIC_BASE_URL: z.preprocess(blankToUndefined, origin.default("http://localhost:4000")),
    SITE_ORIGINS: z.preprocess(blankToUndefined, z.string().default("http://localhost:3000")),
    ADMIN_PASSWORD_HASH: z.string().regex(/^scrypt:[0-9a-f]{32}:[0-9a-f]{128}$/, "create it with: npm run hash-password"),
    SESSION_SECRET: z.string().min(32, "use a random string of at least 32 characters"),
    STORAGE_DRIVER: z.enum(["local", "s3", "cloudinary"]).default("local"),
    S3_ENDPOINT: optional,
    S3_REGION: z.preprocess(blankToUndefined, z.string().default("auto")),
    S3_BUCKET: optional,
    S3_ACCESS_KEY_ID: optional,
    S3_SECRET_ACCESS_KEY: optional,
    S3_PUBLIC_URL: optional,
    CLOUDINARY_URL: z.preprocess(blankToUndefined, z.string().regex(/^cloudinary:\/\/[^:]+:[^@]+@[^/?#]+/, "must look like cloudinary://<api_key>:<api_secret>@<cloud_name>").optional()),
    CLOUDINARY_CLOUD_NAME: optional,
    CLOUDINARY_API_KEY: optional,
    CLOUDINARY_API_SECRET: optional,
    CLOUDINARY_FOLDER: z.preprocess(blankToUndefined, z.string().regex(/^[\w-]+(\/[\w-]+)*$/, "letters, numbers, - and _ in /-separated parts").default("portfolio")),
  })
  .superRefine((env, ctx) => {
    for (const site of env.SITE_ORIGINS.split(",")) {
      if (!origin.safeParse(site.trim()).success) {
        ctx.addIssue({ code: "custom", path: ["SITE_ORIGINS"], message: `"${site.trim()}" is not an origin` });
      }
    }
    if (env.STORAGE_DRIVER === "s3") {
      for (const key of ["S3_BUCKET", "S3_ACCESS_KEY_ID", "S3_SECRET_ACCESS_KEY", "S3_PUBLIC_URL"] as const) {
        if (!env[key]) ctx.addIssue({ code: "custom", path: [key], message: "required when STORAGE_DRIVER=s3" });
      }
    }
    if (env.STORAGE_DRIVER === "cloudinary" && !env.CLOUDINARY_URL) {
      for (const key of ["CLOUDINARY_CLOUD_NAME", "CLOUDINARY_API_KEY", "CLOUDINARY_API_SECRET"] as const) {
        if (!env[key]) ctx.addIssue({ code: "custom", path: [key], message: "required when STORAGE_DRIVER=cloudinary (or set CLOUDINARY_URL)" });
      }
    }
  });

const parsed = schema.safeParse(process.env);
if (!parsed.success) {
  console.error("Invalid environment, see backend/.env.example:");
  for (const issue of parsed.error.issues) console.error(`  ${issue.path.join(".")}: ${issue.message}`);
  process.exit(1);
}

export const env = {
  ...parsed.data,
  siteOrigins: parsed.data.SITE_ORIGINS.split(",").map((s) => s.trim()),
  isProduction: parsed.data.NODE_ENV === "production",
};
