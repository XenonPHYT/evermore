import { z } from "zod";
export const usernameRule = /^[a-z0-9_-]{3,30}$/;
export const username = z
  .string()
  .trim()
  .toLowerCase()
  .regex(
    usernameRule,
    "Usernames use 3–30 lowercase letters, numbers, hyphens or underscores.",
  );
export const password = z
  .string()
  .min(12, "Use at least 12 characters.")
  .max(128, "Passwords can have at most 128 characters.");
export const displayName = z.string().trim().min(1).max(50);
export const recoveryAlphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";
export const recoveryBytes = 20;
export const recoveryLength = 32;
export function normalizeRecoveryCode(value: string) {
  return value.replace(/[\s-]/g, "").toUpperCase();
}
export function formatRecoveryCode(raw: string) {
  return raw.match(/.{1,4}/g)?.join("-") ?? raw;
}
export const recoveryCode = z
  .string()
  .max(64)
  .transform(normalizeRecoveryCode)
  .pipe(z.string().regex(/^[A-Z2-7]{32}$/, "Enter the full recovery code."));
export const registerBody = z.object({ username, password, displayName });
export const loginBody = z.object({ username, password: z.string().max(128) });
export const recoverBody = z.object({
  username,
  recoveryCode,
  password,
});
export type RegisterResponse = { ok: true; recoveryCode: string };
export type RecoverResponse = { ok: true; recoveryCode: string };
export type Me = { account: { id: string; username: string } | null };
