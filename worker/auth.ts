import { scrypt } from "node:crypto";
import { z } from "zod";
import { setCookie } from "hono/cookie";
import {
  formatRecoveryCode,
  loginBody,
  password,
  recoverBody,
  recoveryAlphabet,
  recoveryBytes,
  registerBody,
} from "../shared/auth";
import {
  type C,
  cookieName,
  escapeEqual,
  fail,
  hash,
  hex,
  input,
  limit,
  local,
  note,
  now,
  ok,
  owner,
  random,
  router,
  rows,
  session,
  signedIn,
  stmt,
  uid,
} from "./core";
export const auth = router();
function derive(pass: string, salt: string): Promise<string> {
  return new Promise((resolve, reject) =>
    scrypt(
      pass,
      salt,
      32,
      { N: 32768, r: 8, p: 3, maxmem: 48 * 1024 * 1024 },
      (err, key) => (err ? reject(err) : resolve(key.toString("hex"))),
    ),
  );
}
async function digest(pass: string) {
  const s = hex(crypto.getRandomValues(new Uint8Array(16)));
  return `${s}:${await derive(pass, s)}`;
}
async function matches(pass: string, d: string) {
  const [s, h] = d.split(":");
  return escapeEqual(await derive(pass, s), h);
}
const DUMMY_PASSWORD = `${"0".repeat(32)}:${"0".repeat(64)}`;
function cookie(c: C, raw: string, maxAge: number) {
  setCookie(c, cookieName(c), raw, {
    path: "/",
    secure: !local(c),
    httpOnly: true,
    sameSite: "Lax",
    maxAge,
  });
}
async function login(c: C, id: string) {
  const raw = random(),
    time = now();
  await stmt(
    c,
    "INSERT INTO sessions(token,user_id,expires,created) VALUES(?,?,?,?)",
    await hash(raw),
    id,
    time + 604800,
    time,
  ).run();
  cookie(c, raw, 604800);
}
/** 160 random bits as 32 base32 characters (shown in groups of four). */
function newRecoveryCode() {
  const bytes = crypto.getRandomValues(new Uint8Array(recoveryBytes));
  let bits = 0,
    value = 0,
    out = "";
  for (const b of bytes) {
    value = (value << 8) | b;
    bits += 8;
    while (bits >= 5) {
      out += recoveryAlphabet[(value >>> (bits - 5)) & 31];
      bits -= 5;
    }
  }
  return out;
}
/** Only this hash is stored; the code itself has enough entropy for SHA-256. */
const recoveryHash = (raw: string) => hash(`evermore-recovery-v1:${raw}`);
auth.post("/register", async (c) => {
  await limit(c, "register", 8);
  const data = await input(c, registerBody);
  const id = uid();
  const raw = newRecoveryCode();
  const pass = await digest(data.password);
  const result = await c.env.DB.batch([
    stmt(
      c,
      "INSERT INTO users(id,username,password,created) VALUES(?,?,?,?) ON CONFLICT(username) DO NOTHING",
      id,
      data.username,
      pass,
      now(),
    ),
    stmt(
      c,
      "INSERT INTO profiles(user_id,display_name) SELECT id,? FROM users WHERE id=?",
      data.displayName,
      id,
    ),
    stmt(
      c,
      "INSERT INTO inboxes(user_id,slug) SELECT id,? FROM users WHERE id=?",
      random(),
      id,
    ),
    stmt(
      c,
      "INSERT INTO recovery_codes(id,user_id,code_hash,created) SELECT ?,id,?,? FROM users WHERE id=?",
      uid(),
      await recoveryHash(raw),
      now(),
      id,
    ),
  ]);
  if (!result[0].meta.changes) fail(409, "That username is already taken.");
  await login(c, id);
  return c.json({ ok: true, recoveryCode: formatRecoveryCode(raw) }, 201);
});
auth.post("/login", async (c) => {
  await limit(c, "login", 20);
  const data = await input(c, loginBody);
  await limit(c, "login-username", 12, 900, data.username);
  const a = await stmt(
    c,
    "SELECT id,password FROM users WHERE username=?",
    data.username,
  ).first<{ id: string; password: string }>();
  const valid = await matches(data.password, a?.password ?? DUMMY_PASSWORD);
  if (!a || !valid) fail(401, "Username or password did not match.");
  await login(c, a.id);
  return ok(c);
});
auth.post("/logout", async (c) => {
  const a = await session(c);
  if (a) await stmt(c, "DELETE FROM sessions WHERE token=?", a.token).run();
  cookie(c, "", 0);
  return ok(c);
});
auth.get("/me", async (c) => {
  const a = await session(c);
  return c.json({ account: a ? { id: a.id, username: a.username } : null });
});
/**
 * Recovery by username + single-use code. Whatever the failure, the response
 * is the same, so it does not reveal whether a username exists.
 */
auth.post("/recover", async (c) => {
  await limit(c, "recover", 10);
  const data = await input(c, recoverBody);
  await limit(c, "recover-username", 5, 3600, data.username);
  const submitted = await recoveryHash(data.recoveryCode);
  const found = await stmt(
    c,
    "SELECT u.id AS user_id,r.id AS code_id,r.code_hash FROM users u JOIN recovery_codes r ON r.user_id=u.id WHERE u.username=? AND r.used_at IS NULL",
    data.username,
  ).first<{ user_id: string; code_id: string; code_hash: string }>();
  const valid = escapeEqual(submitted, found?.code_hash ?? "0".repeat(64));
  if (!found || !valid)
    fail(400, "The username or recovery code is not valid.");
  const pass = await digest(data.password);
  const fresh = newRecoveryCode();
  const claim = uid(),
    t = now();
  const mine =
    "EXISTS(SELECT 1 FROM recovery_codes WHERE id=? AND replaced_by=?)";
  const out = await c.env.DB.batch([
    // The claim runs first: only one request can mark the code used.
    stmt(
      c,
      "UPDATE recovery_codes SET used_at=?,replaced_by=? WHERE id=? AND used_at IS NULL",
      t,
      claim,
      found.code_id,
    ),
    stmt(
      c,
      `UPDATE users SET password=? WHERE id=? AND ${mine}`,
      pass,
      found.user_id,
      found.code_id,
      claim,
    ),
    stmt(
      c,
      `DELETE FROM sessions WHERE user_id=? AND ${mine}`,
      found.user_id,
      found.code_id,
      claim,
    ),
    stmt(
      c,
      `INSERT INTO recovery_codes(id,user_id,code_hash,created) SELECT ?,?,?,? WHERE ${mine}`,
      uid(),
      found.user_id,
      await recoveryHash(fresh),
      t,
      found.code_id,
      claim,
    ),
    stmt(
      c,
      `INSERT INTO notifications(id,user_id,kind,created) SELECT ?,?,'Password recovered',? WHERE ${mine}`,
      uid(),
      found.user_id,
      t,
      found.code_id,
      claim,
    ),
  ]);
  if (!out[0].meta.changes)
    fail(400, "The username or recovery code is not valid.");
  return c.json({ ok: true, recoveryCode: formatRecoveryCode(fresh) });
});
auth.post("/recovery-code", signedIn, async (c) => {
  await limit(c, "recovery-regenerate", 5, 900, owner(c));
  const data = await input(c, z.object({ password }));
  const a = c.get("account");
  if (!(await matches(data.password, a.password)))
    fail(403, "Incorrect password.");
  const fresh = newRecoveryCode();
  const t = now();
  await c.env.DB.batch([
    stmt(
      c,
      "UPDATE recovery_codes SET used_at=?,replaced_by='regenerated' WHERE user_id=? AND used_at IS NULL",
      t,
      a.id,
    ),
    stmt(
      c,
      "INSERT INTO recovery_codes(id,user_id,code_hash,created) VALUES(?,?,?,?)",
      uid(),
      a.id,
      await recoveryHash(fresh),
      t,
    ),
    note(c, a.id, "Recovery code replaced"),
  ]);
  return c.json({ ok: true, recoveryCode: formatRecoveryCode(fresh) });
});
auth.get("/sessions", signedIn, async (c) =>
  c.json(
    await rows(
      c,
      "SELECT created,expires,token=? AS current FROM sessions WHERE user_id=? AND expires>?",
      c.get("account").token,
      owner(c),
      now(),
    ),
  ),
);
auth.delete("/sessions/others", signedIn, async (c) => {
  await stmt(
    c,
    "DELETE FROM sessions WHERE user_id=? AND token<>?",
    owner(c),
    c.get("account").token,
  ).run();
  return ok(c);
});
auth.post("/password", signedIn, async (c) => {
  await limit(c, "password", 8, 900, owner(c));
  const data = await input(c, z.object({ current: password, password }));
  const a = c.get("account");
  if (!(await matches(data.current, a.password)))
    fail(403, "Incorrect password.");
  await c.env.DB.batch([
    stmt(
      c,
      "UPDATE users SET password=? WHERE id=?",
      await digest(data.password),
      a.id,
    ),
    stmt(c, "DELETE FROM sessions WHERE user_id=? AND token<>?", a.id, a.token),
    note(c, a.id, "Password changed"),
  ]);
  return ok(c);
});
auth.delete("/account", signedIn, async (c) => {
  const data = await input(c, z.object({ password }));
  const a = c.get("account");
  await limit(c, "delete-account", 6, 900, a.id);
  if (!(await matches(data.password, a.password)))
    fail(403, "Incorrect password.");
  await c.env.DB.batch([
    stmt(
      c,
      "INSERT OR IGNORE INTO storage_gc SELECT ca.object_key,? FROM creation_assets ca JOIN creations cr ON cr.id=ca.creation_id WHERE cr.owner=?",
      now(),
      a.id,
    ),
    stmt(
      c,
      "INSERT OR IGNORE INTO storage_gc SELECT avatar_key,? FROM profiles WHERE user_id=? AND avatar_key IS NOT NULL",
      now(),
      a.id,
    ),
    stmt(c, "DELETE FROM users WHERE id=?", a.id),
  ]);
  cookie(c, "", 0);
  return ok(c);
});
