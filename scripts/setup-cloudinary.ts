/**
 * Switches the backend to Cloudinary in one step:
 *   npm run setup-cloudinary
 * Asks for the "API environment variable" from Cloudinary (Settings > API Keys),
 * checks it against Cloudinary, writes STORAGE_DRIVER and CLOUDINARY_URL into
 * .env, then copies the site's built-in video list into Cloudinary if it has none.
 * The key is typed here, never passed on the command line or printed.
 */
import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { createInterface } from "node:readline/promises";
import { fileURLToPath } from "node:url";
import { itemsDocSchema } from "../src/schema.js";
import { createCloudinaryStorage, parseCloudinaryUrl } from "../src/storage/cloudinary.js";

const backendDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const envPath = path.join(backendDir, ".env");

async function main(): Promise<number> {
  const rl = createInterface({ input: process.stdin, output: process.stdout });
  console.log("Cloudinary console > Settings > API Keys > copy the API environment variable.");
  const value = (await rl.question("Paste it here (cloudinary://...): ")).trim().replace(/^CLOUDINARY_URL=/, "");
  rl.close();

  const creds = parseCloudinaryUrl(value);
  if (!creds || creds.apiKey.includes("<") || creds.apiSecret.includes("*")) {
    console.error("\nThat does not look like cloudinary://<api_key>:<api_secret>@<cloud_name>. Copy it again, with the secret revealed.");
    return 1;
  }

  // A cheap authenticated call proves the key and secret before anything is saved.
  const ping = await fetch(`https://api.cloudinary.com/v1_1/${creds.cloudName}/ping`, {
    headers: { Authorization: `Basic ${Buffer.from(`${creds.apiKey}:${creds.apiSecret}`).toString("base64")}` },
  });
  if (!ping.ok) {
    console.error(`\nCloudinary rejected these credentials (${ping.status}). Nothing was changed.`);
    return 1;
  }
  console.log(`\nConnected to Cloudinary cloud "${creds.cloudName}".`);

  let env = await readFile(envPath, "utf8");
  const set = (key: string, val: string) => {
    const line = `${key}=${val}`;
    env = new RegExp(`^${key}=.*$`, "m").test(env) ? env.replace(new RegExp(`^${key}=.*$`, "m"), line) : `${env.trimEnd()}\n${line}\n`;
  };
  set("STORAGE_DRIVER", "cloudinary");
  set("CLOUDINARY_URL", value);
  const folder = env.match(/^CLOUDINARY_FOLDER=(.+)$/m)?.[1]?.trim() || "portfolio";
  await writeFile(envPath, env);
  console.log("Saved STORAGE_DRIVER=cloudinary and CLOUDINARY_URL in backend/.env.");

  const storage = createCloudinaryStorage({ ...creds, folder });
  if ((await storage.readDoc()) === null) {
    const source = path.join(backendDir, "../frontend/content/vasant.json");
    const { items } = JSON.parse(await readFile(source, "utf8")) as { items: unknown };
    const doc = itemsDocSchema.parse({ version: 1, updatedAt: new Date().toISOString(), items });
    await storage.writeDoc(JSON.stringify(doc, null, 2));
    console.log(`Copied ${doc.items.length} videos from the site into Cloudinary (${folder}/content/items.json).`);
  } else {
    console.log("Cloudinary already has a video list: left as it is.");
  }
  console.log("\nDone. Restart the backend so it uses Cloudinary.");
  return 0;
}

// exitCode, not process.exit(): lets pending sockets close cleanly on Windows.
process.exitCode = await main();
