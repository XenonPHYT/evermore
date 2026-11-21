import { useEffect, useRef, useState, type FormEvent } from "react";
import { Link, useParams, useSearchParams } from "react-router";
import { api, useApi, type Profile } from "./api";
import { Brand, Heading, Status, Wait } from "./ui";
import GreetingView from "./viewer";
import type { Greeting } from "../shared/model";
function GreetingPage({ slug }: { slug: string }) {
  const { data, error, reload } = useApi<{ config: Greeting }>(`/g/${slug}`);
  return data ? (
    <>
      <GreetingView
        key={slug}
        config={data.config}
        source={(id) => `/api/g/${slug}/assets/${id}`}
      />
      <Link to={`/help?category=greeting&target=${slug}`}>
        Report this greeting
      </Link>
    </>
  ) : (
    <>
      <Heading
        eyebrow="EVERMORE"
        title={error ? "Greeting unavailable" : "A greeting for you"}
      />
      <Wait error={error} retry={reload} />
    </>
  );
}
type Turnstile = {
  render: (el: HTMLElement, options: Record<string, unknown>) => string;
  remove: (id: string) => void;
};
function Captcha({
  siteKey,
  onToken,
}: {
  siteKey: string;
  onToken: (token: string) => void;
}) {
  const div = useRef<HTMLDivElement>(null),
    [error, E] = useState("");
  useEffect(() => {
    let id = "",
      active = true;
    const w = window as Window & { turnstile?: Turnstile };
    function start() {
      if (active && div.current && w.turnstile && !id)
        id = w.turnstile.render(div.current, {
          sitekey: siteKey,
          callback: onToken,
          "expired-callback": () => onToken(""),
          "error-callback": () => {
            onToken("");
            E("The spam check failed. Reload to retry.");
          },
        });
    }
    let script = document.querySelector<HTMLScriptElement>("#turnstile-script");
    if (!script) {
      script = document.createElement("script");
      script.id = "turnstile-script";
      script.src =
        "https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit";
      document.head.appendChild(script);
    }
    script.addEventListener("load", start);
    const failed = () => E("The spam check could not load.");
    script.addEventListener("error", failed);
    start();
    return () => {
      active = false;
      script.removeEventListener("load", start);
      script.removeEventListener("error", failed);
      if (id) w.turnstile?.remove(id);
    };
  }, [siteKey, onToken]);
  return (
    <>
      <div ref={div} />
      <Status error={error} />
    </>
  );
}
function NotePage({ slug }: { slug: string }) {
  const { data, error, reload } = useApi<{
    enabled: boolean;
    siteKey: string | null;
  }>(`/drop/${slug}`);
  const [named, N] = useState(false),
    [sent, S] = useState(false),
    [failure, F] = useState(""),
    [busy, B] = useState(false),
    [token, T] = useState(""),
    [attempt, A] = useState(0);
  async function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    B(true);
    F("");
    try {
      await api(`/drop/${slug}`, "POST", {
        body: f.get("body"),
        mode: named ? "named" : "anonymous",
        name: named ? f.get("name") : undefined,
        website: f.get("website"),
        token: token || undefined,
      });
      S(true);
    } catch (e) {
      F((e as Error).message);
      T("");
      A((i) => i + 1);
    } finally {
      B(false);
    }
  }
  return (
    <>
      <Heading eyebrow="A LITTLE KINDNESS" title="Leave a note." />
      <div className="panel stack">
        {sent ? (
          <p role="status">Your note was sent.</p>
        ) : !data ? (
          <Wait error={error} retry={reload} />
        ) : !data.enabled ? (
          <p>This inbox is not accepting messages right now.</p>
        ) : (
          <form className="stack" onSubmit={submit}>
            <label className="check">
              <input
                type="checkbox"
                checked={named}
                onChange={(e) => N(e.target.checked)}
              />
              Use a name instead of staying anonymous
            </label>
            {named && (
              <label>
                Display name (unverified)
                <input name="name" maxLength={50} required />
              </label>
            )}
            <label className="trap" aria-hidden="true">
              Website
              <input tabIndex={-1} autoComplete="off" name="website" />
            </label>
            <label>
              Note
              <textarea name="body" rows={6} required maxLength={1500} />
            </label>
            {data.siteKey && (
              <Captcha key={attempt} siteKey={data.siteKey} onToken={T} />
            )}
            <button
              className="primary"
              disabled={busy || (!!data.siteKey && !token)}
            >
              Send note
            </button>
            <Status error={failure} />
            <p className="small muted">
              An anonymous note hides your name from the recipient. Evermore
              uses limited abuse-prevention data.
            </p>
          </form>
        )}
      </div>
      <Link to={`/help?category=inbox&target=${slug}`}>Report this inbox</Link>
    </>
  );
}
function ProfilePage({ slug }: { slug: string }) {
  const { data, error, reload } = useApi<{
    profile: Profile;
    creations: { share: string; title: string }[];
  }>(`/people/${slug}`);
  return data ? (
    <>
      <section className={`panel tile ${data.profile.theme}`}>
        {data.profile.has_avatar !== 0 && (
          <img
            src={`/api/people/${slug}/avatar`}
            className="avatar"
            alt="Profile picture"
          />
        )}
        <Heading title={data.profile.display_name} eyebrow={`@${slug}`} />
        <p className="pre">{data.profile.bio}</p>
      </section>
      <h2>Shared creations</h2>
      <ul>
        {data.creations.map((c) => (
          <li key={c.share}>
            <Link to={`/g/${c.share}`}>{c.title}</Link>
          </li>
        ))}
      </ul>
      <Link to={`/help?category=profile&target=${slug}`}>
        Report this profile
      </Link>
    </>
  ) : (
    <Wait error={error} retry={reload} />
  );
}
function Help() {
  const [query] = useSearchParams();
  const [msg, M] = useState(""),
    [err, E] = useState(""),
    [busy, B] = useState(false);
  const category = ["note", "greeting", "inbox", "profile"].includes(
    query.get("category") || "",
  )
    ? query.get("category")
    : "support";
  return (
    <>
      <Heading eyebrow="HELP & SUPPORT" title="Here to help." />
      <section className="panel stack">
        <h2>Frequently asked questions</h2>
        <details>
          <summary>Who can see my greeting?</summary>
          <p>
            Drafts are private. Once published, anyone with the link can open
            it. Unpublish to revoke access. A recipient may keep copies they
            already viewed.
          </p>
        </details>
        <details>
          <summary>Where do my photos go?</summary>
          <p>
            Originals stay on your device. Publishing uploads selected optimized
            crops and a preview. A crop kept only on your device cannot be
            loaded by recipients.
          </p>
        </details>
        <details>
          <summary>Does a countdown keep my message private?</summary>
          <p>
            No. A countdown is part of the presentation, not an access-control
            mechanism. Publish only when you are comfortable sharing the
            greeting content.
          </p>
        </details>
        <details>
          <summary>Are anonymous notes truly anonymous?</summary>
          <p>
            The recipient does not see a sender name unless you supply one.
            Names are unverified. Time-windowed abuse controls are used to limit
            spam.
          </p>
        </details>
        <h2 id="privacy">Privacy and security</h2>
        <p>
          Evermore stores account, draft, notification and inbox data while your
          account is active. You can export structured account data, remove
          content and delete your account in Settings. Optimized local photos
          remain on a device until cleared. Short-lived abuse counters and
          expired tokens are cleared by scheduled maintenance; backup retention
          follows the deployment operator’s Cloudflare policy. Submitted support
          and abuse reports may be kept separately for moderation.
        </p>
      </section>
      <form
        className="panel stack"
        onSubmit={async (e) => {
          e.preventDefault();
          B(true);
          E("");
          M("");
          const form = new FormData(e.currentTarget);
          try {
            await api("/reports", "POST", {
              category,
              target: query.get("target") || "",
              detail: form.get("detail"),
            });
            M("Submitted to the support queue.");
          } catch (e) {
            E((e as Error).message);
          } finally {
            B(false);
          }
        }}
      >
        <h2>{category === "support" ? "Contact support" : "Report content"}</h2>
        <label>
          Details
          <textarea
            name="detail"
            minLength={5}
            maxLength={2000}
            required
            rows={5}
          />
        </label>
        <button className="primary" disabled={busy}>
          Submit
        </button>
        <Status error={err} message={msg} />
      </form>
    </>
  );
}
function Moderation() {
  const [token, T] = useState(""),
    [items, I] = useState<
      { id: string; category: string; target: string; detail: string }[]
    >([]),
    [error, E] = useState(""),
    [message, M] = useState("");
  async function call(method = "GET", body?: unknown) {
    const r = await fetch("/api/reports/queue", {
      method,
      headers: {
        Authorization: `Bearer ${token}`,
        "X-Evermore": "1",
        "Content-Type": "application/json",
      },
      body: body ? JSON.stringify(body) : undefined,
    });
    const result = (await r.json()) as typeof items & { error?: string };
    if (!r.ok) throw Error(result.error);
    return result;
  }
  async function run(f: () => Promise<void>) {
    E("");
    M("");
    try {
      await f();
    } catch (e) {
      E((e as Error).message);
    }
  }
  return (
    <>
      <Heading eyebrow="OPERATOR TOOLS" title="Moderation queue" />
      <form
        className="panel stack"
        onSubmit={(e) => {
          e.preventDefault();
          void run(async () => {
            const data = await call();
            I(data);
            M(data.length ? "Queue loaded." : "No open reports.");
          });
        }}
      >
        <label>
          Moderator token
          <input
            type="password"
            autoComplete="off"
            value={token}
            onChange={(e) => {
              T(e.target.value);
              I([]);
            }}
            required
          />
        </label>
        <button>Load queue</button>
      </form>
      <Status error={error} message={message} />
      {items.map((item) => (
        <form
          key={item.id}
          className="panel stack"
          onSubmit={(e) => {
            e.preventDefault();
            const f = new FormData(e.currentTarget);
            void run(async () => {
              await call("POST", {
                id: item.id,
                decision: f.get("decision"),
                reason: f.get("reason"),
              });
              I((a) => a.filter((x) => x.id !== item.id));
              M("Decision recorded.");
            });
          }}
        >
          <h2>{item.category}</h2>
          <p className="pre">{item.detail}</p>
          <p className="pre muted">Target: {item.target}</p>
          <label>
            Decision
            <select name="decision">
              <option value="resolve">Resolve</option>
              <option value="dismiss">Dismiss</option>
              <option value="remove">Remove content</option>
            </select>
          </label>
          <label>
            Reason
            <input name="reason" required minLength={5} maxLength={300} />
          </label>
          <button>Record decision</button>
        </form>
      ))}
    </>
  );
}
export default function Public({ page }: { page: string }) {
  const { slug = "" } = useParams();
  const safe = encodeURIComponent(slug);
  return (
    <main id="main" className="public stack">
      <Brand />
      {page === "greeting" ? (
        <GreetingPage key={safe} slug={safe} />
      ) : page === "inbox" ? (
        <NotePage key={safe} slug={safe} />
      ) : page === "profile" ? (
        <ProfilePage key={safe} slug={safe} />
      ) : page === "moderation" ? (
        <Moderation />
      ) : (
        <Help />
      )}
    </main>
  );
}
