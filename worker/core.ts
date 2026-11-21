import { Hono, type Context } from "hono";
import { getCookie } from "hono/cookie";
import { HTTPException } from "hono/http-exception";
import type { z } from "zod";
export type Env = {
  DB: D1Database;
  MEDIA: R2Bucket;
  ASSETS: Fetcher;
  ABUSE_SECRET?: string;
  TURNSTILE_SECRET?: string;
  TURNSTILE_SITE_KEY?: string;
  MODERATION_TOKEN?: string;
};
export type Account = {
  id: string;
  username: string;
  password: string;
  token: string;
};
export type App = { Bindings: Env; Variables: { account: Account } };
export type C = Context<App>;
export const router = () => new Hono<App>();
export const now = () => Math.floor(Date.now() / 1000);
export const uid = () => crypto.randomUUID();
const enc = new TextEncoder();
export const hex = (arr: ArrayBuffer | Uint8Array) =>
  Array.from(new Uint8Array(arr), (x) => x.toString(16).padStart(2, "0")).join(
    "",
  );
export const random = () => hex(crypto.getRandomValues(new Uint8Array(32)));
export const hash = async (s: string) =>
  hex(await crypto.subtle.digest("SHA-256", enc.encode(s)));
export function fail(
  status: 400 | 401 | 403 | 404 | 409 | 413 | 415 | 429 | 503,
  message: string,
): never {
  throw new HTTPException(status, { message });
}
export const stmt = (c: C, query: string, ...values: unknown[]) =>
  c.env.DB.prepare(query).bind(...values);
export const rows = async <T = Record<string, unknown>>(
  c: C,
  sql: string,
  ...p: unknown[]
) => (await stmt(c, sql, ...p).all<T>()).results;
export function local(c: C) {
  const u = new URL(c.req.url);
  return (
    u.protocol === "http:" && ["127.0.0.1", "localhost"].includes(u.hostname)
  );
}
export const cookieName = (c: C) =>
  local(c) ? "evermore_dev" : "__Host-evermore";
export async function session(c: C) {
  const raw = getCookie(c, cookieName(c));
  if (!raw || !/^[a-f0-9]{64}$/.test(raw)) return null;
  return stmt(
    c,
    "SELECT u.id,u.username,u.password,s.token FROM sessions s JOIN users u ON u.id=s.user_id WHERE s.token=? AND s.expires>?",
    await hash(raw),
    now(),
  ).first<Account>();
}
export async function signedIn(c: C, next: () => Promise<void>) {
  const a = await session(c);
  if (!a) fail(401, "Sign in to continue.");
  c.set("account", a);
  await next();
}
export const owner = (c: C) => c.get("account").id;
export async function readBytes(c: C, max: number) {
  const r = c.req.raw.body?.getReader();
  if (!r) return new Uint8Array();
  const parts: Uint8Array[] = [];
  let size = 0;
  while (true) {
    const { done, value } = await r.read();
    if (done) break;
    size += value.byteLength;
    if (size > max) {
      await r.cancel();
      fail(413, "Request is too large.");
    }
    parts.push(value);
  }
  const out = new Uint8Array(size);
  let at = 0;
  for (const p of parts) {
    out.set(p, at);
    at += p.length;
  }
  return out;
}
export async function input<T>(c: C, schema: z.ZodType<T>) {
  if (c.req.header("content-type")?.split(";")[0] !== "application/json")
    fail(415, "Expected a JSON request.");
  const bytes = await readBytes(c, 32000);
  let decoded: unknown;
  try {
    decoded = JSON.parse(new TextDecoder().decode(bytes));
  } catch {
    fail(400, "Invalid JSON.");
  }
  const result = schema.safeParse(decoded);
  if (!result.success)
    fail(400, result.error.issues[0]?.message || "Invalid input.");
  return result.data;
}
export async function limit(
  c: C,
  scope: string,
  count: number,
  period = 900,
  key?: string,
) {
  const secret = c.env.ABUSE_SECRET;
  if (!secret && !local(c)) fail(503, "Abuse controls are not configured.");
  const bucket = Math.floor(now() / period);
  const h = await crypto.subtle.importKey(
    "raw",
    enc.encode(secret || "local-development-only"),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const pseudonym = hex(
    await crypto.subtle.sign(
      "HMAC",
      h,
      enc.encode(
        `${scope}:${bucket}:${key || c.req.header("cf-connecting-ip") || "local"}`,
      ),
    ),
  );
  const result = await stmt(
    c,
    "INSERT INTO rate_limits(key,hits,expires) VALUES(?,1,?) ON CONFLICT(key) DO UPDATE SET hits=hits+1 RETURNING hits",
    pseudonym,
    (bucket + 1) * period,
  ).first<number>("hits");
  if ((result ?? 0) > count) fail(429, "Too many requests. Try again later.");
}
export async function challenge(c: C, token?: string) {
  if (!c.env.TURNSTILE_SECRET) {
    if (c.env.TURNSTILE_SITE_KEY)
      fail(503, "Spam protection is not configured.");
    return;
  }
  if (!token) fail(400, "Complete the spam check.");
  const response = await fetch(
    "https://challenges.cloudflare.com/turnstile/v0/siteverify",
    {
      method: "POST",
      body: new URLSearchParams({
        secret: c.env.TURNSTILE_SECRET,
        response: token,
      }),
    },
  );
  const verified = await response.json<{
    success: boolean;
    hostname: string;
  }>();
  if (!verified.success || verified.hostname !== new URL(c.req.url).hostname)
    fail(400, "Spam check failed.");
}
export const ok = (c: C) => c.json({ ok: true });
export const note = (c: C, id: string, kind: string) =>
  stmt(
    c,
    "INSERT INTO notifications(id,user_id,kind,created) VALUES(?,?,?,?)",
    uid(),
    id,
    kind,
    now(),
  );
export function escapeEqual(a: string, b: string) {
  let diff = a.length ^ b.length;
  for (let i = 0; i < a.length; i++)
    diff |= a.charCodeAt(i) ^ (b.charCodeAt(i) || 0);
  return diff === 0;
}
