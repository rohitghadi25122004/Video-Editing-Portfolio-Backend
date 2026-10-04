/**
 * Copies the site's built-in item list into storage, so the admin panel
 * starts with the current work instead of an empty list.
 *   npm run seed                                    (reads ../frontend/content/vasant.json)
 *   npm run seed -- path/to/vasant.json --force     (overwrite existing items)
 * Seeded covers and videos keep their /media/... paths: they are served by
 * the site itself, so nothing is uploaded and nothing is ever deleted there.
 */
import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { env } from "../src/env.js";
import { itemsDocSchema } from "../src/schema.js";
import { createStorage } from "../src/storage/index.js";

const backendDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const args = process.argv.slice(2);
const force = args.includes("--force");
const file = path.resolve(args.find((a) => !a.startsWith("--")) ?? path.join(backendDir, "../frontend/content/vasant.json"));

const { storage } = createStorage(env, backendDir);

if ((await storage.readDoc()) !== null && !force) {
  console.error("Storage already has items. Re-run with --force to overwrite them.");
  process.exit(1);
}

const { items } = JSON.parse(await readFile(file, "utf8")) as { items: unknown };
const doc = itemsDocSchema.parse({ version: 1, updatedAt: new Date().toISOString(), items });
await storage.writeDoc(JSON.stringify(doc, null, 2));
console.log(`Seeded ${doc.items.length} items from ${file} into ${env.STORAGE_DRIVER} storage.`);
