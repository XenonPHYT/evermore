import {
  expect,
  test,
  type APIRequest,
  type APIRequestContext,
} from "@playwright/test";
import { randomUUID } from "node:crypto";
import { newGreeting } from "../shared/model";
const origin = "http://127.0.0.1:8794";
const hdr = { Origin: origin, "X-Evermore": "1" };
const password = "evermore-local-test-password";
async function user(ctx: APIRequestContext) {
  const username = `u${randomUUID().replaceAll("-", "").slice(0, 20)}`;
  const response = await ctx.post("/api/auth/register", {
    headers: hdr,
    data: { username, password, displayName: "Test User" },
  });
  expect(response.status()).toBe(201);
  return { username, recoveryCode: (await response.json()).recoveryCode };
}
test("session, draft ownership, stable publication, private R2 asset and independent revocation", async ({
  playwright,
}) => {
  const a = await playwright.request.newContext({ baseURL: origin }),
    b = await playwright.request.newContext({ baseURL: origin }),
    guest = await playwright.request.newContext({ baseURL: origin });
  try {
    const { username } = await user(a);
    await user(b);
    expect((await guest.get("/api/creations")).status()).toBe(401);
    expect((await a.post("/api/creations", { data: {} })).status()).toBe(403);
    expect(
      (await a.post("/api/auth/logout", { headers: hdr })).ok(),
    ).toBeTruthy();
    expect(
      (await a.get("/api/auth/me").then((r) => r.json())).account,
    ).toBeNull();
    expect(
      (
        await a.post("/api/auth/login", {
          headers: hdr,
          data: { username, password },
        })
      ).ok(),
    ).toBeTruthy();
    const photo = randomUUID(),
      config = {
        ...newGreeting("memory"),
        photos: [{ id: photo, caption: "A memory" }],
      };
    const d = await a.post("/api/creations", {
      headers: hdr,
      data: { config, listed: false },
    });
    expect(d.status()).toBe(201);
    const { id } = await d.json();
    const draft = `/api/creations/${id}`;
    expect((await b.delete(draft, { headers: hdr })).status()).toBe(404);
    expect((await guest.get(`${draft}/assets/${photo}`)).status()).toBe(401);
    expect((await a.get(draft).then((r) => r.json())).share).toBeNull();
    expect(
      (
        await a.post(`${draft}/publish`, {
          headers: hdr,
          data: { consent: true, revision: 0 },
        })
      ).status(),
    ).toBe(409);
    expect(
      (
        await a.put(`${draft}/assets/${photo}`, {
          headers: {
            ...hdr,
            "Content-Type": "image/webp",
            "X-Publish-Consent": "yes",
          },
          data: Buffer.from("not a webp"),
        })
      ).status(),
    ).toBe(415);
    const image = Buffer.from(
      "UklGRiIAAABXRUJQVlA4IBYAAAAwAQCdASoBAAEAAUAmJaQAA3AA/v89WAAAAA==",
      "base64",
    );
    image.writeUInt32LE(image.length - 8, 4);
    expect(
      (
        await a.put(`${draft}/assets/${photo}`, {
          headers: {
            ...hdr,
            "Content-Type": "image/webp",
            "X-Publish-Consent": "yes",
          },
          data: image,
        })
      ).status(),
    ).toBe(200);
    const published = await a.post(`${draft}/publish`, {
      headers: hdr,
      data: { consent: true, revision: 0 },
    });
    expect(published.status()).toBe(200);
    const { share, revision } = await published.json();
    const url = `/api/g/${share}`;
    const live = await guest.get(url);
    expect(live.headers()["x-robots-tag"]).toContain("noindex");
    expect(await live.json()).toEqual({ config });
    expect(
      (await guest.get(`${url}/assets/${photo}`).then((r) => r.body())).equals(
        image,
      ),
    ).toBe(true);
    const edited = { ...config, title: "New title" };
    expect(
      (
        await a.put(draft, {
          headers: hdr,
          data: { config: edited, listed: false, revision },
        })
      ).status(),
    ).toBe(200);
    expect((await guest.get(url).then((r) => r.json())).config.title).toBe(
      config.title,
    );
    expect(
      (
        await a
          .post(`${draft}/publish`, {
            headers: hdr,
            data: { consent: true, revision: revision + 1 },
          })
          .then((r) => r.json())
      ).share,
    ).toBe(share);
    expect((await guest.get(url).then((r) => r.json())).config.title).toBe(
      "New title",
    );
    const second = await a
      .post("/api/creations", {
        headers: hdr,
        data: { config: newGreeting("heartbeat"), listed: false },
      })
      .then((r) => r.json());
    const secondShare = await a
      .post(`/api/creations/${second.id}/publish`, {
        headers: hdr,
        data: { consent: true, revision: 0 },
      })
      .then((r) => r.json());
    expect(secondShare.share).toMatch(/^[a-f0-9]{64}$/);
    expect(secondShare.share).not.toBe(share);
    await a.post(`${draft}/unpublish`, { headers: hdr });
    expect((await guest.get(url)).status()).toBe(404);
    expect((await guest.get(`${url}/assets/${photo}`)).status()).toBe(404);
    expect((await a.delete(draft, { headers: hdr })).status()).toBe(200);
    expect((await guest.get(`/api/g/${secondShare.share}`)).status()).toBe(200);
    expect(
      (
        await a.delete("/api/auth/account", {
          headers: hdr,
          data: { password },
        })
      ).status(),
    ).toBe(200);
    expect((await guest.get(`/api/g/${secondShare.share}`)).status()).toBe(404);
  } finally {
    await Promise.all([a.dispose(), b.dispose(), guest.dispose()]);
  }
});
test("anonymous inbox drops sender name, supports favorites, moderation reports and closure", async ({
  playwright,
}) => {
  const a = await playwright.request.newContext({ baseURL: origin }),
    b = await playwright.request.newContext({ baseURL: origin });
  try {
    await user(a);
    const initial = await a.get("/api/inbox").then((r) => r.json());
    const drop = `/api/drop/${initial.inbox.slug}`;
    expect(
      (
        await b.post(drop, {
          headers: hdr,
          data: {
            body: "A kind note",
            mode: "anonymous",
            name: "Do not disclose",
          },
        })
      ).status(),
    ).toBe(201);
    const {
      messages: [message],
    } = await a.get("/api/inbox").then((r) => r.json());
    expect(message.name).toBeNull();
    expect(
      (
        await a.patch(`/api/inbox/${message.id}`, {
          headers: hdr,
          data: { favorite: true },
        })
      ).status(),
    ).toBe(200);
    expect(
      (await a.get("/api/inbox").then((r) => r.json())).messages[0].favorite,
    ).toBe(1);
    expect(
      (await a.get("/api/notifications").then((r) => r.json()))[0].kind,
    ).toBe("New note");
    expect(
      (
        await a.post("/api/reports", {
          headers: hdr,
          data: {
            category: "note",
            target: message.id,
            detail: "Needs review",
          },
        })
      ).status(),
    ).toBe(201);
    expect((await b.get("/api/reports/queue")).status()).toBe(403);
    await a.put("/api/inbox", { headers: hdr, data: { enabled: false } });
    expect(
      (
        await b.post(drop, {
          headers: hdr,
          data: { body: "Closed", mode: "anonymous" },
        })
      ).status(),
    ).toBe(404);
    await a.put("/api/inbox", { headers: hdr, data: { enabled: true } });
    expect(
      (
        await b.post(drop, {
          headers: hdr,
          data: { body: "A signed note", mode: "named", name: "Sam" },
        })
      ).status(),
    ).toBe(201);
    expect(
      (await a.get("/api/inbox").then((r) => r.json())).messages.map(
        (m: { name: string | null }) => m.name,
      ),
    ).toContain("Sam");
  } finally {
    await Promise.all([a.dispose(), b.dispose()]);
  }
});

const address = () =>
  `10.${Math.floor(Math.random() * 250)}.${Math.floor(Math.random() * 250)}.${Math.floor(Math.random() * 250)}`;
const isolated = (playwright: { request: APIRequest }) =>
  playwright.request.newContext({
    baseURL: origin,
    extraHTTPHeaders: { "cf-connecting-ip": address() },
  });
test("registration needs only username, password and display name; email flows are gone", async ({
  playwright,
}) => {
  const a = await isolated(playwright),
    b = await isolated(playwright);
  try {
    const username = `n${randomUUID().replaceAll("-", "").slice(0, 20)}`;
    const missing = await a.post("/api/auth/register", {
      headers: hdr,
      data: { username, password },
    });
    expect(missing.status()).toBe(400);
    expect(
      (
        await a.post("/api/auth/register", {
          headers: hdr,
          data: { username: "Bad Name!", password, displayName: "X" },
        })
      ).status(),
    ).toBe(400);
    const created = await a.post("/api/auth/register", {
      headers: hdr,
      data: { username: username.toUpperCase(), password, displayName: "Ada" },
    });
    expect(created.status()).toBe(201);
    const body = await created.json();
    expect(body.recoveryCode).toMatch(/^([A-Z2-7]{4}-){7}[A-Z2-7]{4}$/);
    expect(
      (await a.get("/api/auth/me").then((r) => r.json())).account,
    ).toEqual({ id: expect.any(String), username });
    expect(
      (
        await b.post("/api/auth/register", {
          headers: hdr,
          data: { username, password, displayName: "Copy" },
        })
      ).status(),
    ).toBe(409);
    expect(
      (
        await b.post("/api/auth/login", {
          headers: hdr,
          data: { username: username.toUpperCase(), password },
        })
      ).status(),
    ).toBe(200);
    expect(
      (
        await b.post("/api/auth/login", {
          headers: hdr,
          data: { username, password: "not-the-right-password" },
        })
      ).status(),
    ).toBe(401);
    for (const path of ["verify/send", "verify", "recover/send"])
      expect(
        (await b.post(`/api/auth/${path}`, { headers: hdr, data: {} })).status(),
      ).toBe(404);
  } finally {
    await Promise.all([a.dispose(), b.dispose()]);
  }
});
test("recovery code resets the password once, ends sessions and issues a replacement", async ({
  playwright,
}) => {
  const a = await isolated(playwright),
    other = await isolated(playwright),
    stranger = await isolated(playwright);
  try {
    const { username, recoveryCode } = await user(a);
    const draft = await a
      .post("/api/creations", {
        headers: hdr,
        data: { config: newGreeting("letter"), listed: false },
      })
      .then((r) => r.json());
    expect(
      (await other.post("/api/auth/login", { headers: hdr, data: { username, password } })).ok(),
    ).toBeTruthy();
    const newPassword = "a-brand-new-password-123";
    const lower = recoveryCode.toLowerCase().replaceAll("-", " ");
    expect(
      (
        await stranger.post("/api/auth/recover", {
          headers: hdr,
          data: { username, recoveryCode: "A".repeat(32), password: newPassword },
        })
      ).status(),
    ).toBe(400);
    const recovered = await stranger.post("/api/auth/recover", {
      headers: hdr,
      data: { username, recoveryCode: lower, password: newPassword },
    });
    expect(recovered.status()).toBe(200);
    const { recoveryCode: next } = await recovered.json();
    expect(next).toMatch(/^([A-Z2-7]{4}-){7}[A-Z2-7]{4}$/);
    expect(next).not.toBe(recoveryCode);
    expect((await a.get("/api/creations")).status()).toBe(401);
    expect((await other.get("/api/auth/me").then((r) => r.json())).account).toBeNull();
    const reuse = await stranger.post("/api/auth/recover", {
      headers: hdr,
      data: { username, recoveryCode, password: "yet-another-password-456" },
    });
    expect(reuse.status()).toBe(400);
    expect(
      (await stranger.post("/api/auth/login", { headers: hdr, data: { username, password } })).status(),
    ).toBe(401);
    expect(
      (await stranger.post("/api/auth/login", { headers: hdr, data: { username, password: newPassword } })).ok(),
    ).toBeTruthy();
    expect((await stranger.get(`/api/creations/${draft.id}`)).status()).toBe(200);
    const again = await other.post("/api/auth/recover", {
      headers: hdr,
      data: { username, recoveryCode: next, password: "third-password-for-account" },
    });
    expect(again.status()).toBe(200);
    expect((await again.json()).recoveryCode).not.toBe(next);
    expect((await stranger.get("/api/auth/me").then((r) => r.json())).account).toBeNull();
  } finally {
    await Promise.all([a.dispose(), other.dispose(), stranger.dispose()]);
  }
});
test("settings can replace the recovery code and password change keeps ownership intact", async ({
  playwright,
}) => {
  const a = await isolated(playwright),
    guest = await isolated(playwright);
  try {
    const { username, recoveryCode } = await user(a);
    expect(
      (await a.post("/api/auth/recovery-code", { headers: hdr, data: { password: "wrong-password-here" } })).status(),
    ).toBe(403);
    const replaced = await a
      .post("/api/auth/recovery-code", { headers: hdr, data: { password } })
      .then((r) => r.json());
    expect(replaced.recoveryCode).not.toBe(recoveryCode);
    expect(
      (await guest.post("/api/auth/recover", { headers: hdr, data: { username, recoveryCode, password: "irrelevant-password-1" } })).status(),
    ).toBe(400);
    expect(
      (await guest.post("/api/auth/recover", { headers: hdr, data: { username, recoveryCode: replaced.recoveryCode, password: "irrelevant-password-2" } })).status(),
    ).toBe(200);
  } finally {
    await Promise.all([a.dispose(), guest.dispose()]);
  }
});
test("recovery attempts are rate limited per username", async ({
  playwright,
}) => {
  const a = await isolated(playwright);
  try {
    const { username } = await user(a);
    const statuses: number[] = [];
    for (let i = 0; i < 7; i++)
      statuses.push(
        (
          await a.post("/api/auth/recover", {
            headers: hdr,
            data: { username, recoveryCode: "B".repeat(32), password: "long-enough-password-1" },
          })
        ).status(),
      );
    expect(statuses.slice(0, 5)).toEqual([400, 400, 400, 400, 400]);
    expect(statuses.slice(5)).toEqual([429, 429]);
    expect(
      (await a.post("/api/auth/recover", { headers: hdr, data: { username, recoveryCode: "B".repeat(32), password: "long-enough-password-1" } })).status(),
    ).toBe(429);
  } finally {
    await a.dispose();
  }
});
