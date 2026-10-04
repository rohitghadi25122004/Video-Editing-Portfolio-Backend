import cors from "cors";
import { Router } from "express";
import type { ItemStore } from "../store.js";

/**
 * GET /api/content: the item list the portfolio site loads on page open.
 * `items: null` means nothing was saved yet, and the site keeps the list it
 * was built with. Public, read-only data, so any origin may read it.
 */
export function publicRoutes(store: ItemStore) {
  const router = Router();
  router.use(cors({ origin: "*", methods: ["GET"] }));

  router.get("/content", async (_req, res) => {
    const doc = await store.load();
    // Revalidate every time (cheap 304 via ETag) so admin edits show on the next page load.
    res.set("Cache-Control", "no-cache");
    res.json({ items: doc?.items ?? null, updatedAt: doc?.updatedAt ?? null });
  });

  return router;
}
