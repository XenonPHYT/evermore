import { HTTPException } from "hono/http-exception";
import { auth } from "./auth";
import { creations, sharing, library } from "./creations";
import {
  inbox,
  drop,
  profile,
  people,
  reports,
  notifications,
} from "./community";
import { type Env, fail, local, now, router } from "./core";
const app = router();
app.use("*", async (c, next) => {
  await next();
  const h = c.res.headers;
  h.set("X-Content-Type-Options", "nosniff");
  h.set("Referrer-Policy", "no-referrer");
  h.set("Permissions-Policy", "camera=(), microphone=(), geolocation=()");
  h.set("X-Frame-Options", "DENY");
  h.set("Cross-Origin-Resource-Policy", "same-origin");
  if (!local(c) && !h.has("Content-Security-Policy"))
    h.set(
      "Content-Security-Policy",
      "default-src 'self'; script-src 'self' https://challenges.cloudflare.com; style-src 'self' 'unsafe-inline'; img-src 'self' blob: data:; media-src 'self' blob:; connect-src 'self' https://challenges.cloudflare.com; frame-src https://challenges.cloudflare.com; worker-src 'self'; object-src 'none'; base-uri 'none'; form-action 'self'; frame-ancestors 'none'",
    );
  if (/^\/(api|g|note|people|account|app|moderation)(\/|$)/.test(c.req.path)) {
    h.set("Cache-Control", "private, no-store");
    h.set("X-Robots-Tag", "noindex, nofollow");
  }
});
app.use("/api/*", async (c, next) => {
  if (!["GET", "HEAD"].includes(c.req.method)) {
    const origin = c.req.header("origin");
    if (
      origin !== new URL(c.req.url).origin ||
      c.req.header("sec-fetch-site") === "cross-site" ||
      c.req.header("x-evermore") !== "1"
    )
      fail(403, "Request origin not allowed.");
  }
  await next();
});
app.onError((e, c) =>
  e instanceof HTTPException
    ? c.json({ error: e.message }, e.status)
    : c.json({ error: "Evermore could not complete this request." }, 500),
);
app.get("/api/health", (c) => c.json({ ok: true, version: "1.0.0" }));
app
  .route("/api/auth", auth)
  .route("/api/creations", creations)
  .route("/api/g", sharing)
  .route("/api/templates", library)
  .route("/api/inbox", inbox)
  .route("/api/drop", drop)
  .route("/api/profile", profile)
  .route("/api/people", people)
  .route("/api/reports", reports)
  .route("/api/notifications", notifications);
app.all("/api/*", (c) => c.json({ error: "Endpoint not found." }, 404));
app.get("*", async (c) => {
  const r = await c.env.ASSETS.fetch(c.req.raw);
  const headers = new Headers(r.headers);
  if (/^\/assets\/python\.worker-[\w-]+\.js$/.test(c.req.path))
    headers.set(
      "Content-Security-Policy",
      "default-src 'none'; script-src 'self' 'wasm-unsafe-eval' https://cdn.jsdelivr.net; connect-src https://cdn.jsdelivr.net",
    );
  return new Response(r.body, { status: r.status, headers });
});
export default {
  fetch: app.fetch,
  async scheduled(_event: ScheduledController, env: Env) {
    const t = now();
    await env.DB.batch([
      env.DB.prepare("DELETE FROM sessions WHERE expires<=?").bind(t),
      env.DB.prepare("DELETE FROM rate_limits WHERE expires<=?").bind(t),
      env.DB.prepare(
        "DELETE FROM recovery_codes WHERE used_at IS NOT NULL AND used_at<?",
      ).bind(t - 2592000),
    ]);
    const { results } = await env.DB.prepare(
      "SELECT object_key FROM storage_gc WHERE created<? LIMIT 100",
    )
      .bind(t - 3600)
      .all<{ object_key: string }>();
    for (const { object_key } of results) {
      await env.MEDIA.delete(object_key);
      await env.DB.prepare("DELETE FROM storage_gc WHERE object_key=?")
        .bind(object_key)
        .run();
    }
  },
};
