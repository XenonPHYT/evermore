// @vitest-environment node
import { DatabaseSync } from "node:sqlite";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  formatRecoveryCode,
  normalizeRecoveryCode,
  recoverBody,
  registerBody,
} from "../shared/auth";
const schema = readFileSync("database/schema.sql", "utf8");
const fresh = () => {
  const db = new DatabaseSync(":memory:");
  db.exec("PRAGMA foreign_keys=ON");
  db.exec(schema);
  return db;
};
const names = (db: DatabaseSync, type: string) =>
  (
    db
      .prepare("SELECT name FROM sqlite_master WHERE type=? ORDER BY name")
      .all(type) as { name: string }[]
  ).map((r) => r.name);
describe("database/schema.sql", () => {
  it("initialises an empty database with every required table", () => {
    const tables = names(fresh(), "table");
    for (const t of [
      "users",
      "profiles",
      "sessions",
      "recovery_codes",
      "creations",
      "creation_assets",
      "inboxes",
      "messages",
      "notifications",
      "templates",
      "reports",
      "moderation_records",
      "rate_limits",
      "storage_gc",
    ])
      expect(tables).toContain(t);
  });
  it("can be re-run safely and seeds the five templates once", () => {
    const db = fresh();
    db.exec(schema);
    expect(db.prepare("SELECT count(*) AS n FROM templates").get()).toEqual({
      n: 5,
    });
  });
  it("has no email columns or token tables", () => {
    const db = fresh();
    expect(names(db, "table").join()).not.toMatch(/email|verification/);
    for (const t of names(db, "table"))
      for (const col of db.prepare(`PRAGMA table_info(${t})`).all() as {
        name: string;
      }[])
        expect(col.name).not.toMatch(/email|verified/);
    expect(schema).not.toMatch(/password_recovery_tokens/);
  });
  it("enforces unique usernames, one active recovery code and cascading deletes", () => {
    const db = fresh();
    const add = db.prepare(
      "INSERT INTO users(id,username,password,created) VALUES(?,?,?,1)",
    );
    add.run("1", "alice", "x");
    expect(() => add.run("2", "alice", "x")).toThrow();
    expect(() => add.run("3", "Alice", "x")).toThrow();
    const code = db.prepare(
      "INSERT INTO recovery_codes(id,user_id,code_hash,created,used_at) VALUES(?,?,?,1,?)",
    );
    code.run("a", "1", "h1", null);
    expect(() => code.run("b", "1", "h2", null)).toThrow();
    code.run("c", "1", "h3", 5);
    db.prepare(
      "INSERT INTO sessions(token,user_id,expires,created) VALUES('t','1',9,1)",
    ).run();
    db.prepare("DELETE FROM users WHERE id='1'").run();
    expect(
      db.prepare("SELECT count(*) AS n FROM recovery_codes").get(),
    ).toEqual({ n: 0 });
    expect(db.prepare("SELECT count(*) AS n FROM sessions").get()).toEqual({
      n: 0,
    });
  });
});
describe("auth validation", () => {
  it("normalises usernames and requires no email or phone", () => {
    const r = registerBody.parse({
      username: " Mia_01 ",
      password: "a-long-enough-password",
      displayName: "Mia",
      email: "ignored@example.test",
    });
    expect(r).toEqual({
      username: "mia_01",
      password: "a-long-enough-password",
      displayName: "Mia",
    });
    expect(
      registerBody.safeParse({ username: "ab", password: "x", displayName: "" })
        .success,
    ).toBe(false);
  });
  it("accepts recovery codes in any case or grouping and rejects short ones", () => {
    const raw = "ABCDEFGH23456723ABCDEFGH23456723";
    const grouped = formatRecoveryCode(raw);
    expect(grouped.split("-")).toHaveLength(8);
    expect(normalizeRecoveryCode(grouped.toLowerCase())).toBe(raw);
    const body = { username: "mia", password: "a-long-enough-password" };
    expect(
      recoverBody.parse({ ...body, recoveryCode: grouped.toLowerCase() })
        .recoveryCode,
    ).toBe(raw);
    expect(recoverBody.safeParse({ ...body, recoveryCode: "123456" }).success).toBe(
      false,
    );
  });
});
describe("no email provider remains", () => {
  const roots = ["src", "worker", "shared", "scripts"];
  const files = [
    "package.json",
    "wrangler.jsonc",
    ".env.example",
    "database/schema.sql",
  ];
  const walk = (dir: string): string[] =>
    readdirSync(dir).flatMap((n) => {
      const f = join(dir, n);
      return statSync(f).isDirectory() ? walk(f) : [f];
    });
  it("mentions no Resend, EMAIL_FROM or email endpoints in shipped code or config", () => {
    for (const f of [...roots.flatMap(walk), ...files]) {
      const text = readFileSync(f, "utf8");
      expect(text, f).not.toMatch(/resend|EMAIL_FROM|RESEND_API_KEY/i);
      expect(text, f).not.toMatch(/\/verify\/send|recover\/send|emailEnabled/);
      expect(text, f).not.toMatch(/type="email"|autoComplete="email"/);
    }
  });
  it("keeps the old migrations out of the repository", () => {
    expect(() => statSync("database/migrations")).toThrow();
  });
});
