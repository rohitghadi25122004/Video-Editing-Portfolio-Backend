import { itemsDocSchema, type Item, type ItemsDoc } from "./schema.js";
import type { Storage } from "./storage/types.js";

const CACHE_MS = 30_000;

/**
 * The item list on top of a Storage. Reads are cached briefly (the public
 * API is hit on every page view); writes run one at a time and always start
 * from a fresh read, so two admin tabs cannot overwrite each other's edits.
 */
export function createItemStore(storage: Storage) {
  let cache: { doc: ItemsDoc | null; at: number } | null = null;
  let queue: Promise<unknown> = Promise.resolve();

  async function load(fresh = false): Promise<ItemsDoc | null> {
    if (!fresh && cache && Date.now() - cache.at < CACHE_MS) return cache.doc;
    const raw = await storage.readDoc();
    const doc = raw === null ? null : itemsDocSchema.parse(JSON.parse(raw));
    cache = { doc, at: Date.now() };
    return doc;
  }

  function mutate<T>(change: (items: Item[]) => { items: Item[]; result: T }): Promise<T> {
    const run = queue.then(async () => {
      const current = await load(true);
      const { items, result } = change(structuredClone(current?.items ?? []));
      const next = itemsDocSchema.parse({ version: 1, updatedAt: new Date().toISOString(), items });
      await storage.writeDoc(JSON.stringify(next, null, 2));
      cache = { doc: next, at: Date.now() };
      return result;
    });
    queue = run.catch(() => undefined);
    return run;
  }

  return { load, mutate };
}

export type ItemStore = ReturnType<typeof createItemStore>;
