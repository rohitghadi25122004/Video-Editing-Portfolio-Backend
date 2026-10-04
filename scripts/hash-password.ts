/**
 * Prints an ADMIN_PASSWORD_HASH value for backend/.env.
 *   npm run hash-password            (asks for the password)
 *   npm run hash-password -- "pass"  (stays in shell history: avoid on shared machines)
 */
import { createInterface } from "node:readline/promises";
import { hashPassword } from "../src/auth.js";

let password = process.argv[2];
if (!password) {
  const rl = createInterface({ input: process.stdin, output: process.stdout });
  password = await rl.question("Admin password: ");
  rl.close();
}
if (!password || password.length < 10) {
  console.error("Use at least 10 characters.");
  process.exit(1);
}
console.log(`\nADMIN_PASSWORD_HASH=${await hashPassword(password)}`);
