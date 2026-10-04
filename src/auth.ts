import { createHmac, randomBytes, scrypt as scryptCb, timingSafeEqual } from "node:crypto";
import { promisify } from "node:util";
import type { NextFunction, Request, Response } from "express";

const scrypt = promisify(scryptCb) as (password: string, salt: Buffer, keylen: number) => Promise<Buffer>;

export const SESSION_COOKIE = "admin_session";
const SESSION_HOURS = 12;

/** "scrypt:<salt hex>:<hash hex>", the format ADMIN_PASSWORD_HASH expects. */
export async function hashPassword(password: string) {
  const salt = randomBytes(16);
  const hash = await scrypt(password, salt, 64);
  return `scrypt:${salt.toString("hex")}:${hash.toString("hex")}`;
}

export async function verifyPassword(password: string, stored: string) {
  const [, saltHex = "", hashHex = ""] = stored.split(":");
  const expected = Buffer.from(hashHex, "hex");
  const actual = await scrypt(password, Buffer.from(saltHex, "hex"), expected.length);
  return actual.length === expected.length && timingSafeEqual(actual, expected);
}

/**
 * Stateless admin sessions: an expiry signed with SESSION_SECRET, kept in an
 * httpOnly, SameSite=Strict cookie. The admin panel is served from this same
 * origin, so the cookie never has to cross sites.
 */
export function createAuth(secret: string, secure: boolean) {
  const sign = (payload: string) => createHmac("sha256", secret).update(payload).digest("base64url");

  const valid = (token: string | undefined) => {
    if (!token) return false;
    const [payload = "", signature = ""] = token.split(".");
    const expected = Buffer.from(sign(payload));
    const given = Buffer.from(signature);
    if (expected.length !== given.length || !timingSafeEqual(expected, given)) return false;
    try {
      const { exp } = JSON.parse(Buffer.from(payload, "base64url").toString()) as { exp: unknown };
      return typeof exp === "number" && exp > Date.now();
    } catch {
      return false;
    }
  };

  const readCookie = (req: Request) => {
    for (const part of (req.headers.cookie ?? "").split(";")) {
      const [key, ...rest] = part.trim().split("=");
      if (key === SESSION_COOKIE) return decodeURIComponent(rest.join("="));
    }
    return undefined;
  };

  const cookieOptions = { httpOnly: true, sameSite: "strict" as const, secure, path: "/" };

  return {
    signIn(res: Response) {
      const payload = Buffer.from(JSON.stringify({ exp: Date.now() + SESSION_HOURS * 3600_000 })).toString("base64url");
      res.cookie(SESSION_COOKIE, `${payload}.${sign(payload)}`, { ...cookieOptions, maxAge: SESSION_HOURS * 3600_000 });
    },
    signOut(res: Response) {
      res.clearCookie(SESSION_COOKIE, cookieOptions);
    },
    isSignedIn(req: Request) {
      return valid(readCookie(req));
    },
    requireAdmin(req: Request, res: Response, next: NextFunction) {
      if (valid(readCookie(req))) return next();
      res.status(401).json({ error: "Sign in first" });
    },
  };
}

export type Auth = ReturnType<typeof createAuth>;
