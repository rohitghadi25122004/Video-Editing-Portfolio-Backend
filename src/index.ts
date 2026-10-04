import path from "node:path";
import { fileURLToPath } from "node:url";
import express, { type NextFunction, type Request, type Response } from "express";
import helmet from "helmet";
import { z } from "zod";
import { createAuth } from "./auth.js";
import { env } from "./env.js";
import { adminRoutes } from "./routes/admin.js";
import { publicRoutes } from "./routes/public.js";
import { createStorage, mediaHosts } from "./storage/index.js";
import { createItemStore } from "./store.js";

// backend/ itself: src/index.ts in development, dist/src/index.js once built.
const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, here.includes(`${path.sep}dist${path.sep}`) ? "../.." : "..");

const { storage, local } = createStorage(env, root);
const store = createItemStore(storage);
const auth = createAuth(env.SESSION_SECRET, env.isProduction);

const app = express();
app.disable("x-powered-by");
// Behind the host's proxy: real client IPs for the login rate limit.
app.set("trust proxy", 1);

// The admin page previews covers and videos from the site, the storage and Drive.
const previewHosts = [...env.siteOrigins, ...mediaHosts(env)];
app.use(
  helmet({
    crossOriginResourcePolicy: { policy: "cross-origin" },
    contentSecurityPolicy: {
      directives: {
        "img-src": ["'self'", "data:", "blob:", ...previewHosts],
        "media-src": ["'self'", "blob:", ...previewHosts],
        // Upload targets point at the storage host (bucket or api.cloudinary.com).
        "connect-src": ["'self'", "https:"],
        "frame-src": ["https://drive.google.com"],
        "upgrade-insecure-requests": env.isProduction ? [] : null,
      },
    },
  }),
);

app.get("/healthz", (_req, res) => {
  res.json({ ok: true });
});

app.use("/api", publicRoutes(store));
app.use(
  "/api/admin",
  adminRoutes({ auth, store, storage, passwordHash: env.ADMIN_PASSWORD_HASH, siteOrigin: env.siteOrigins[0]!, local }),
);

app.use("/admin", express.static(path.join(root, "admin"), { index: "index.html" }));
app.get("/", (_req, res) => res.redirect("/admin/"));

if (local) {
  // Uploaded media must be readable cross-origin: the site's WebGL globe draws covers.
  app.use(
    "/uploads",
    (_req, res, next) => {
      res.set("Access-Control-Allow-Origin", "*");
      next();
    },
    express.static(local.uploadsDir, { immutable: true, maxAge: "365d" }),
  );
}

app.use((_req, res) => {
  res.status(404).json({ error: "Not found" });
});

app.use((error: unknown, _req: Request, res: Response, _next: NextFunction) => {
  if (error instanceof z.ZodError) {
    res.status(400).json({ error: "Invalid input", issues: error.issues.map((i) => ({ path: i.path.join("."), message: i.message })) });
    return;
  }
  console.error(error);
  res.status(500).json({ error: "Something went wrong" });
});

app.listen(env.PORT, () => {
  console.log(`Backend on ${env.PUBLIC_BASE_URL} (storage: ${env.STORAGE_DRIVER}). Admin: ${env.PUBLIC_BASE_URL}/admin/`);
});
