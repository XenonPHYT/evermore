import { z } from "zod";
import { username } from "../shared/auth";
import {
  challenge,
  escapeEqual,
  fail,
  input,
  limit,
  now,
  ok,
  owner,
  router,
  rows,
  session,
  signedIn,
  stmt,
  uid,
} from "./core";
import { objectResponse, webp } from "./creations";
export const inbox = router(),
  drop = router(),
  profile = router(),
  people = router(),
  reports = router(),
  notifications = router();
inbox.use("*", signedIn);
inbox.get("/", async (c) =>
  c.json({
    inbox: await stmt(
      c,
      "SELECT slug,enabled FROM inboxes WHERE user_id=?",
      owner(c),
    ).first(),
    messages: await rows(
      c,
      "SELECT id,name,body,favorite,created FROM messages WHERE recipient=? ORDER BY created DESC LIMIT 100",
      owner(c),
    ),
  }),
);
inbox.put("/", async (c) => {
  const d = await input(c, z.object({ enabled: z.boolean() }));
  await stmt(
    c,
    "UPDATE inboxes SET enabled=? WHERE user_id=?",
    +d.enabled,
    owner(c),
  ).run();
  return ok(c);
});
inbox.patch("/:id", async (c) => {
  const d = await input(c, z.object({ favorite: z.boolean() }));
  const r = await stmt(
    c,
    "UPDATE messages SET favorite=? WHERE id=? AND recipient=?",
    +d.favorite,
    c.req.param("id"),
    owner(c),
  ).run();
  if (!r.meta.changes) fail(404, "Message not found.");
  return ok(c);
});
inbox.delete("/:id", async (c) => {
  const r = await stmt(
    c,
    "DELETE FROM messages WHERE id=? AND recipient=?",
    c.req.param("id"),
    owner(c),
  ).run();
  if (!r.meta.changes) fail(404, "Message not found.");
  return ok(c);
});
drop.get("/:slug", async (c) => {
  const a = await stmt(
    c,
    "SELECT enabled FROM inboxes WHERE slug=?",
    c.req.param("slug"),
  ).first();
  if (!a) fail(404, "Inbox not found.");
  return c.json({
    enabled: !!a.enabled,
    siteKey: c.env.TURNSTILE_SITE_KEY || null,
  });
});
drop.post("/:slug", async (c) => {
  const slug = c.req.param("slug");
  await limit(c, "note-sender", 5, 900);
  const d = await input(
    c,
    z.object({
      body: z.string().trim().min(1).max(1500),
      name: z.string().trim().min(1).max(50).optional(),
      mode: z.enum(["anonymous", "named"]),
      website: z.string().max(60).optional(),
      token: z.string().max(2048).optional(),
    }),
  );
  if (d.website || (d.mode === "named" && !d.name))
    fail(400, "Invalid submission.");
  const a = await stmt(
    c,
    "SELECT i.user_id,p.notify_notes FROM inboxes i JOIN profiles p ON p.user_id=i.user_id WHERE slug=? AND enabled=1",
    slug,
  ).first<{ user_id: string; notify_notes: number }>();
  if (!a) fail(404, "Inbox is unavailable.");
  await limit(c, "note-recipient", 35, 900, a.user_id);
  await challenge(c, d.token);
  const id = uid();
  const operations = [
    stmt(
      c,
      "INSERT INTO messages SELECT ?,user_id,?,?,0,? FROM inboxes WHERE slug=? AND enabled=1",
      id,
      d.mode === "named" ? d.name : null,
      d.body,
      now(),
      slug,
    ),
  ];
  if (a.notify_notes)
    operations.push(
      stmt(
        c,
        "INSERT INTO notifications SELECT ?,recipient,'New note',?,0 FROM messages WHERE id=?",
        uid(),
        now(),
        id,
      ),
    );
  const result = await c.env.DB.batch(operations);
  if (!result[0].meta.changes)
    fail(404, "Inbox closed before the note was sent.");
  return c.json({ ok: true }, 201);
});
notifications.use("*", signedIn);
notifications.get("/", async (c) =>
  c.json(
    await rows(
      c,
      "SELECT id,kind,created,seen FROM notifications WHERE user_id=? ORDER BY created DESC LIMIT 100",
      owner(c),
    ),
  ),
);
notifications.post("/read", async (c) => {
  await stmt(
    c,
    "UPDATE notifications SET seen=1 WHERE user_id=? AND seen=0",
    owner(c),
  ).run();
  return ok(c);
});
const preferences = z.object({
  display_name: z.string().trim().min(1).max(50),
  username: username.nullable(),
  bio: z.string().max(500),
  theme: z.enum(["rose", "lavender", "blue", "night"]),
  is_public: z.boolean(),
  show_creations: z.boolean(),
  notify_notes: z.boolean(),
});
profile.use("*", signedIn);
profile.get("/", async (c) =>
  c.json(
    await stmt(
      c,
      "SELECT username,display_name,bio,theme,is_public,show_creations,notify_notes,avatar_key IS NOT NULL AS has_avatar FROM profiles WHERE user_id=?",
      owner(c),
    ).first(),
  ),
);
profile.put("/", async (c) => {
  const d = await input(c, preferences);
  if (d.is_public && !d.username)
    fail(400, "Choose a username before enabling your public profile.");
  try {
    await stmt(
      c,
      "UPDATE profiles SET display_name=?,username=?,bio=?,theme=?,is_public=?,show_creations=?,notify_notes=? WHERE user_id=?",
      d.display_name,
      d.username,
      d.bio,
      d.theme,
      +d.is_public,
      +d.show_creations,
      +d.notify_notes,
      owner(c),
    ).run();
  } catch (e) {
    if (String(e).includes("UNIQUE constraint failed"))
      fail(409, "That username is already taken.");
    throw e;
  }
  return ok(c);
});
profile.put("/avatar", async (c) => {
  const id = owner(c);
  await limit(c, "avatar", 12, 3600, id);
  const bytes = await webp(c);
  const key = `avatar/${id}/${uid()}.webp`;
  await stmt(c, "INSERT INTO storage_gc VALUES(?,?)", key, now()).run();
  await c.env.MEDIA.put(key, bytes);
  await c.env.DB.batch([
    stmt(
      c,
      "INSERT OR IGNORE INTO storage_gc SELECT avatar_key,? FROM profiles WHERE user_id=? AND avatar_key IS NOT NULL",
      now(),
      id,
    ),
    stmt(c, "UPDATE profiles SET avatar_key=? WHERE user_id=?", key, id),
    stmt(
      c,
      "DELETE FROM storage_gc WHERE object_key=? AND EXISTS(SELECT 1 FROM profiles WHERE avatar_key=?)",
      key,
      key,
    ),
  ]);
  return ok(c);
});
profile.get("/avatar", async (c) => {
  const key = await stmt(
    c,
    "SELECT avatar_key FROM profiles WHERE user_id=?",
    owner(c),
  ).first<string>("avatar_key");
  if (!key) fail(404, "No profile picture.");
  return objectResponse(c, key);
});
profile.get("/export", async (c) => {
  const id = owner(c);
  const data = await Promise.all([
    stmt(c, "SELECT username,created FROM users WHERE id=?", id).first(),
    stmt(
      c,
      "SELECT username,display_name,bio,theme,is_public,show_creations,notify_notes FROM profiles WHERE user_id=?",
      id,
    ).first(),
    rows(
      c,
      "SELECT draft,published,share,created,updated FROM creations WHERE owner=?",
      id,
    ),
    rows(
      c,
      "SELECT name,body,favorite,created FROM messages WHERE recipient=?",
      id,
    ),
    rows(c, "SELECT kind,created,seen FROM notifications WHERE user_id=?", id),
  ]);
  return c.json({
    version: 1,
    account: data[0],
    profile: data[1],
    creations: data[2],
    notes: data[3],
    notifications: data[4],
  });
});
people.get("/:username", async (c) => {
  const p = await stmt(
    c,
    "SELECT user_id,username,display_name,bio,theme,show_creations,avatar_key IS NOT NULL AS has_avatar FROM profiles WHERE username=? AND is_public=1",
    c.req.param("username"),
  ).first<{ user_id: string; show_creations: number }>();
  if (!p) fail(404, "Profile is unavailable.");
  const { user_id, show_creations, ...publicFields } = p;
  const creations = show_creations
    ? await rows(
        c,
        "SELECT share,json_extract(published,'$.title') AS title FROM creations WHERE owner=? AND published_listed=1 AND published IS NOT NULL ORDER BY updated DESC LIMIT 30",
        user_id,
      )
    : [];
  return c.json({ profile: publicFields, creations });
});
people.get("/:username/avatar", async (c) => {
  const key = await stmt(
    c,
    "SELECT avatar_key FROM profiles WHERE username=? AND is_public=1",
    c.req.param("username"),
  ).first<string>("avatar_key");
  if (!key) fail(404, "No profile picture.");
  return objectResponse(c, key);
});
reports.post("/", async (c) => {
  await limit(c, "report", 8, 3600);
  const d = await input(
    c,
    z.object({
      category: z.enum(["support", "note", "greeting", "inbox", "profile"]),
      target: z.string().max(128),
      detail: z.string().trim().min(5).max(2000),
    }),
  );
  const a = await session(c);
  if (
    d.category === "note" &&
    (!a ||
      !(await stmt(
        c,
        "SELECT id FROM messages WHERE id=? AND recipient=?",
        d.target,
        a.id,
      ).first()))
  )
    fail(404, "Message not found.");
  await stmt(
    c,
    "INSERT INTO reports(id,category,target,detail,reporter,created) VALUES(?,?,?,?,?,?)",
    uid(),
    d.category,
    d.target,
    d.detail,
    a?.id ?? null,
    now(),
  ).run();
  return c.json({ ok: true }, 201);
});
reports.use("/queue", async (c, next) => {
  const token = c.env.MODERATION_TOKEN;
  if (
    !token ||
    token.length < 32 ||
    !escapeEqual(`Bearer ${token}`, c.req.header("authorization") || "")
  )
    fail(403, "Moderator access required.");
  await next();
});
reports.get("/queue", async (c) =>
  c.json(
    await rows(
      c,
      "SELECT id,category,target,detail,created FROM reports WHERE status='open' ORDER BY created LIMIT 100",
    ),
  ),
);
reports.post("/queue", async (c) => {
  const d = await input(
    c,
    z.object({
      id: z.string().uuid(),
      decision: z.enum(["dismiss", "resolve", "remove"]),
      reason: z.string().trim().min(5).max(300),
    }),
  );
  const r = await stmt(
    c,
    "SELECT category,target FROM reports WHERE id=? AND status='open'",
    d.id,
  ).first<{ category: string; target: string }>();
  if (!r) fail(404, "Open report not found.");
  const ops = [
    stmt(
      c,
      "INSERT INTO moderation_records(id,report_id,decision,created) VALUES(?,?,?,?)",
      uid(),
      d.id,
      `${d.decision}: ${d.reason}`,
      now(),
    ),
    stmt(c, "UPDATE reports SET status='closed' WHERE id=?", d.id),
  ];
  if (d.decision === "remove") {
    if (r.category === "greeting")
      ops.push(
        stmt(
          c,
          "UPDATE creations SET published=NULL,revision=revision+1 WHERE share=?",
          r.target,
        ),
      );
    else if (r.category === "inbox")
      ops.push(stmt(c, "UPDATE inboxes SET enabled=0 WHERE slug=?", r.target));
    else if (r.category === "note")
      ops.push(stmt(c, "DELETE FROM messages WHERE id=?", r.target));
    else if (r.category === "profile")
      ops.push(
        stmt(c, "UPDATE profiles SET is_public=0 WHERE username=?", r.target),
      );
  }
  await c.env.DB.batch(ops);
  return ok(c);
});
