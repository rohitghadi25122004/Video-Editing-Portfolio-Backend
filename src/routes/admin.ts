import { randomUUID } from "node:crypto";
import express, { Router, type Request } from "express";
import { rateLimit } from "express-rate-limit";
import { z } from "zod";
import { verifyPassword, type Auth } from "../auth.js";
import { itemInputSchema, UPLOAD_TYPES, uploadRequestSchema, type Item } from "../schema.js";
import type { ItemStore } from "../store.js";
import { UPLOAD_KEY, type Storage } from "../storage/types.js";
import type { createLocalStorage } from "../storage/local.js";

class NotFound extends Error {}

/** Media URLs an item points at (used to clean up files it no longer needs). */
function mediaOf(item: Item) {
  const urls: (string | null | undefined)[] = [item.cover, item.captionsVtt];
  if (item.source.type === "mp4") urls.push(item.source.src, item.source.loopSrc);
  return urls.filter((u): u is string => Boolean(u));
}

export function adminRoutes(options: {
  auth: Auth;
  store: ItemStore;
  storage: Storage;
  passwordHash: string;
  siteOrigin: string;
  local?: ReturnType<typeof createLocalStorage>;
}) {
  const { auth, store, storage, passwordHash, siteOrigin, local } = options;
  const router = Router();
  const json = express.json({ limit: "100kb" });

  /** Delete uploaded files that no remaining item uses. Seeded /media/ paths are never touched. */
  async function removeUnused(urls: string[], items: Item[]) {
    const inUse = new Set(items.flatMap(mediaOf));
    for (const url of urls) {
      const key = storage.keyFromUrl(url);
      if (key && !inUse.has(url)) await storage.deleteKey(key).catch((e) => console.warn("[cleanup]", key, e));
    }
  }

  function toItem(id: string, input: z.infer<typeof itemInputSchema>, previous?: Item): Item {
    return {
      ...input,
      id,
      malloyId: previous?.malloyId ?? null,
      aspect: input.format === "short" ? "9:16" : "16:9",
    };
  }

  /* ---------- session ---------- */

  const loginLimit = rateLimit({ windowMs: 15 * 60_000, limit: 10, standardHeaders: "draft-8", legacyHeaders: false });

  router.post("/login", loginLimit, json, async (req, res) => {
    const { password } = z.object({ password: z.string().min(1).max(200) }).parse(req.body);
    if (!(await verifyPassword(password, passwordHash))) {
      res.status(401).json({ error: "Wrong password" });
      return;
    }
    auth.signIn(res);
    res.json({ ok: true });
  });

  router.post("/logout", (_req, res) => {
    auth.signOut(res);
    res.json({ ok: true });
  });

  router.get("/session", (req, res) => {
    res.json({ signedIn: auth.isSignedIn(req), siteOrigin });
  });

  router.use(auth.requireAdmin);

  /* ---------- items ---------- */

  router.get("/items", async (_req, res) => {
    const doc = await store.load(true);
    res.json({ items: doc?.items ?? [], updatedAt: doc?.updatedAt ?? null });
  });

  router.post("/items", json, async (req, res) => {
    const input = itemInputSchema.parse(req.body);
    const item = await store.mutate((items) => {
      const created = toItem(randomUUID().slice(0, 8), input);
      const rest = input.approved ? items.map((i) => ({ ...i, approved: false })) : items;
      return { items: [...rest, created], result: created };
    });
    res.status(201).json({ item });
  });

  router.put("/items/:id", json, async (req: Request<{ id: string }>, res) => {
    const input = itemInputSchema.parse(req.body);
    const { item, dropped, items } = await store.mutate((items) => {
      const index = items.findIndex((i) => i.id === req.params.id);
      const previous = items[index];
      if (!previous) throw new NotFound();
      const updated = toItem(previous.id, input, previous);
      const next = items.map((i, n) => (n === index ? updated : input.approved ? { ...i, approved: false } : i));
      return { items: next, result: { item: updated, dropped: mediaOf(previous), items: next } };
    });
    await removeUnused(dropped, items);
    res.json({ item });
  });

  router.delete("/items/:id", async (req: Request<{ id: string }>, res) => {
    const { dropped, items } = await store.mutate((items) => {
      const removed = items.find((i) => i.id === req.params.id);
      if (!removed) throw new NotFound();
      const next = items.filter((i) => i !== removed);
      return { items: next, result: { dropped: mediaOf(removed), items: next } };
    });
    await removeUnused(dropped, items);
    res.json({ ok: true });
  });

  /** Body: { ids: [...] } in the new order; must name every item exactly once. */
  router.put("/order", json, async (req, res) => {
    const { ids } = z.object({ ids: z.array(z.string()).max(500) }).parse(req.body);
    await store.mutate((items) => {
      const byId = new Map(items.map((i) => [i.id, i]));
      if (ids.length !== items.length || new Set(ids).size !== ids.length || ids.some((id) => !byId.has(id))) {
        throw new z.ZodError([{ code: "custom", path: ["ids"], message: "must list every item once", input: ids }]);
      }
      return { items: ids.map((id) => byId.get(id)!), result: null };
    });
    res.json({ ok: true });
  });

  /* ---------- uploads ---------- */

  /** A target the browser uploads one file to directly. */
  router.post("/uploads", json, async (req, res) => {
    const { contentType } = uploadRequestSchema.parse(req.body);
    const { kind, ext } = UPLOAD_TYPES[contentType];
    const key = `${kind}s/${randomUUID()}.${ext}`;
    res.json(await storage.createUpload(key, contentType));
  });

  if (local) {
    router.put(/^\/local-upload\/(.+)$/, async (req, res) => {
      const key = String(req.params[0] ?? "");
      if (!UPLOAD_KEY.test(key)) {
        res.status(400).json({ error: "Bad upload key" });
        return;
      }
      await local.receiveUpload(key, req);
      res.status(201).json({ ok: true });
    });
  }

  router.use((error: unknown, _req: Request, res: express.Response, next: express.NextFunction) => {
    if (error instanceof NotFound) {
      res.status(404).json({ error: "No such item" });
      return;
    }
    next(error);
  });

  return router;
}
