import { z } from "zod";
import { greeting, isWebP, maxPhoto, templates } from "../shared/model";
import {
  type C,
  fail,
  input,
  limit,
  now,
  ok,
  owner,
  random,
  readBytes,
  router,
  rows,
  signedIn,
  stmt,
  uid,
} from "./core";
export const creations = router(),
  sharing = router();
const save = z.object({ config: greeting, listed: z.boolean() });
async function owned(c: C) {
  const result = await stmt(
    c,
    "SELECT id,draft,listed,share,published,revision FROM creations WHERE id=? AND owner=?",
    c.req.param("id"),
    owner(c),
  ).first<{
    id: string;
    draft: string;
    listed: number;
    share: string | null;
    published: string | null;
    revision: number;
  }>();
  if (!result) fail(404, "Creation not found.");
  return result;
}
creations.use("*", signedIn);
creations.get("/", async (c) =>
  c.json(
    await rows(
      c,
      "SELECT id,template,json_extract(draft,'$.title') AS title,CASE WHEN published IS NOT NULL THEN share END AS share,updated FROM creations WHERE owner=? ORDER BY updated DESC LIMIT 100",
      owner(c),
    ),
  ),
);
creations.post("/", async (c) => {
  await limit(c, "create", 30, 3600, owner(c));
  const d = await input(c, save);
  const id = uid();
  await stmt(
    c,
    "INSERT INTO creations(id,owner,template,draft,listed,created,updated) VALUES(?,?,?,?,?,?,?)",
    id,
    owner(c),
    d.config.kind,
    JSON.stringify(d.config),
    +d.listed,
    now(),
    now(),
  ).run();
  return c.json({ id }, 201);
});
creations.get("/:id", async (c) => {
  const a = await owned(c);
  return c.json({
    id: a.id,
    config: JSON.parse(a.draft),
    listed: !!a.listed,
    share: a.published ? a.share : null,
    revision: a.revision,
    hasPublished: !!a.published,
    publishedPhotos: (
      await rows<{ role: string }>(
        c,
        "SELECT role FROM creation_assets WHERE creation_id=? AND role NOT LIKE 'preview%'",
        a.id,
      )
    ).map((p) => p.role),
  });
});
creations.put("/:id", async (c) => {
  const a = await owned(c);
  const d = await input(
    c,
    save.extend({ revision: z.number().int().nonnegative() }),
  );
  const r = await stmt(
    c,
    "UPDATE creations SET draft=?,template=?,listed=?,updated=?,revision=revision+1 WHERE id=? AND owner=? AND revision=?",
    JSON.stringify(d.config),
    d.config.kind,
    +d.listed,
    now(),
    a.id,
    owner(c),
    d.revision,
  ).run();
  if (!r.meta.changes) fail(409, "A newer draft exists. Reload before saving.");
  return c.json({ id: a.id, revision: d.revision + 1 });
});
export async function webp(c: C) {
  if (c.req.header("content-type") !== "image/webp")
    fail(415, "Only optimized WebP files are accepted.");
  const bytes = await readBytes(c, maxPhoto);
  if (!isWebP(bytes)) fail(415, "Invalid WebP image.");
  return bytes;
}
// Objects are queued before upload, then removed from the queue in the same D1 batch as their references.
creations.post("/:id/publish", async (c) => {
  const a = await owned(c);
  await limit(c, "publish", 40, 3600, owner(c));
  const d = await input(
    c,
    z.object({
      revision: z.number().int().nonnegative(),
      consent: z.literal(true),
    }),
  );
  if (d.revision !== a.revision)
    fail(409, "Save or reload your latest draft before publishing.");
  const old = greeting.parse(JSON.parse(a.draft));
  if (!old.title.trim() || !old.body.trim())
    fail(400, "A title and message are required.");
  if (new Set(old.photos.map((x) => x.id)).size !== old.photos.length)
    fail(400, "Duplicate photo IDs.");
  const all = await rows<{ id: string; object_key: string; role: string }>(
    c,
    "SELECT id,object_key,role FROM creation_assets WHERE creation_id=?",
    a.id,
  );
  const preview = all.find((x) => x.role === `preview-${d.revision}`);
  const keep = new Set<string>(preview ? [preview.id] : []);
  for (const p of old.photos) {
    const asset = all.find((x) => x.role === p.id);
    if (!asset)
      fail(
        409,
        "An optimized photo is missing. Reattach it before publishing.",
      );
    keep.add(asset.id);
  }
  const share = a.share ?? random();
  const r = await c.env.DB.batch([
    stmt(
      c,
      "UPDATE creations SET published=draft,published_listed=listed,published_preview=?,share=?,updated=?,revision=revision+1 WHERE id=? AND owner=? AND revision=? RETURNING share",
      preview?.role ?? null,
      share,
      now(),
      a.id,
      owner(c),
      d.revision,
    ),
    stmt(
      c,
      "INSERT INTO notifications(id,user_id,kind,created) SELECT ?,owner,'Creation published',? FROM creations WHERE id=? AND owner=? AND revision=? AND published=draft AND share=?",
      uid(),
      now(),
      a.id,
      owner(c),
      d.revision + 1,
      share,
    ),
    ...all
      .filter((x) => !keep.has(x.id))
      .flatMap((x) => [
        stmt(
          c,
          "INSERT OR IGNORE INTO storage_gc SELECT object_key,? FROM creation_assets WHERE id=? AND EXISTS(SELECT 1 FROM creations WHERE id=? AND owner=? AND revision=? AND published=draft AND share=?)",
          now(),
          x.id,
          a.id,
          owner(c),
          d.revision + 1,
          share,
        ),
        stmt(
          c,
          "DELETE FROM creation_assets WHERE id=? AND EXISTS(SELECT 1 FROM storage_gc WHERE object_key=?)",
          x.id,
          x.object_key,
        ),
      ]),
  ]);
  if (!r[0].results.length) fail(409, "The draft changed before publishing.");
  return c.json({ share, revision: d.revision + 1 });
});
creations.put("/:id/assets/:role", async (c) => {
  const a = await owned(c);
  if (c.req.header("x-publish-consent") !== "yes")
    fail(400, "Publishing consent is required for a media upload.");
  const cfg = greeting.parse(JSON.parse(a.draft));
  const reqRole = c.req.param("role");
  const role = reqRole === "preview" ? `preview-${a.revision}` : reqRole;
  if (reqRole !== "preview" && !cfg.photos.some((x) => x.id === role))
    fail(400, "Unknown asset role.");
  await limit(c, "asset-upload", 120, 3600, owner(c));
  const bytes = await webp(c);
  const id = uid(),
    key = `creation/${a.id}/${id}.webp`;
  await stmt(c, "INSERT INTO storage_gc VALUES(?,?)", key, now()).run();
  await c.env.MEDIA.put(key, bytes, {
    httpMetadata: { contentType: "image/webp" },
  });
  const r = await c.env.DB.batch([
    stmt(
      c,
      "INSERT INTO creation_assets SELECT ?,id,?,'image/webp',? FROM creations WHERE id=? AND owner=? AND revision=? AND NOT EXISTS(SELECT 1 FROM creation_assets WHERE creation_id=? AND role=?)",
      id,
      key,
      role,
      a.id,
      owner(c),
      a.revision,
      a.id,
      role,
    ),
    stmt(
      c,
      "DELETE FROM storage_gc WHERE object_key=? AND EXISTS(SELECT 1 FROM creation_assets WHERE object_key=?)",
      key,
      key,
    ),
  ]);
  if (!r[0].meta.changes) {
    const existing = await stmt(
      c,
      "SELECT id FROM creation_assets WHERE creation_id=? AND role=?",
      a.id,
      role,
    ).first();
    if (!existing) fail(409, "The draft changed during upload.");
  }
  return ok(c);
});
function canRead(cfg: string | null, role: string) {
  return (
    !!cfg &&
    (role === "preview" ||
      greeting.parse(JSON.parse(cfg)).photos.some((x) => x.id === role))
  );
}
async function media(c: C, id: string, role: string) {
  const key = await stmt(
    c,
    "SELECT object_key FROM creation_assets WHERE creation_id=? AND role=?",
    id,
    role,
  ).first<string>("object_key");
  if (!key) fail(404, "Image not found.");
  return objectResponse(c, key);
}
export async function objectResponse(c: C, key: string) {
  const object = await c.env.MEDIA.get(key);
  if (!object) fail(404, "Image not found.");
  return new Response(object.body, {
    headers: {
      "Content-Type": "image/webp",
      "Cache-Control": "private, no-store",
      "X-Content-Type-Options": "nosniff",
    },
  });
}
creations.get("/:id/assets/:role", async (c) => {
  const a = await owned(c),
    role = c.req.param("role");
  if (!canRead(a.draft, role)) fail(404, "Image not found.");
  return media(c, a.id, role);
});
creations.post("/:id/unpublish", async (c) => {
  const a = await owned(c);
  await stmt(
    c,
    "UPDATE creations SET published=NULL,revision=revision+1,updated=? WHERE id=? AND owner=?",
    now(),
    a.id,
    owner(c),
  ).run();
  return ok(c);
});
creations.delete("/:id", async (c) => {
  const a = await owned(c);
  await c.env.DB.batch([
    stmt(
      c,
      "INSERT OR IGNORE INTO storage_gc SELECT object_key,? FROM creation_assets WHERE creation_id=?",
      now(),
      a.id,
    ),
    stmt(c, "DELETE FROM creations WHERE id=? AND owner=?", a.id, owner(c)),
  ]);
  return ok(c);
});
async function published(c: C) {
  const slug = c.req.param("slug");
  if (!slug || !/^[a-f0-9]{64}$/.test(slug))
    fail(404, "This greeting is unavailable.");
  const item = await stmt(
    c,
    "SELECT id,published,published_preview FROM creations WHERE share=? AND published IS NOT NULL",
    slug,
  ).first<{
    id: string;
    published: string;
    published_preview: string | null;
  }>();
  if (!item) fail(404, "This greeting is unavailable.");
  return item;
}
sharing.get("/:slug", async (c) => {
  const a = await published(c);
  return c.json({ config: greeting.parse(JSON.parse(a.published)) });
});
sharing.get("/:slug/assets/:role", async (c) => {
  const a = await published(c),
    role = c.req.param("role");
  if (!canRead(a.published, role)) fail(404, "Image not found.");
  return media(
    c,
    a.id,
    role === "preview" ? (a.published_preview ?? "preview") : role,
  );
});
export const library = router();
library.get("/", async (c) => {
  const active = await rows<{ id: string }>(
    c,
    "SELECT id FROM templates WHERE enabled=1",
  );
  return c.json(templates.filter((t) => active.some((x) => x.id === t.id)));
});
