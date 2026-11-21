import { useState } from "react";
import { Link } from "react-router";
import {
  api,
  copyPath,
  useApi,
  type Creation,
  type Inbox,
  type Notification,
  type Profile,
} from "./api";
import { Heading, Status, Wait } from "./ui";
import { newGreeting, templates } from "../shared/model";
import GreetingView from "./viewer";
function useAction() {
  const [error, E] = useState(""),
    [message, M] = useState("");
  return {
    error,
    message,
    run: async (f: () => Promise<unknown>, done = "") => {
      E("");
      M("");
      try {
        await f();
        M(done);
      } catch (e) {
        E((e as Error).message);
      }
    },
  };
}
function Tiles({ items }: { items: readonly (typeof templates)[number][] }) {
  const [preview, P] = useState<string | null>(null);
  return (
    <>
      <div className="tiles">
        {items.map((t) => (
          <article className={"tile " + t.palette} key={t.id}>
            <div className="tile-art" aria-hidden="true">
              {t.icon}
            </div>
            <div className="tile-text">
              <p className="eyebrow">
                {t.relationship} / {t.occasion}
              </p>
              <h3>{t.title}</h3>
              <div className="actions">
                <Link to={`/app/studio/${t.id}`} className="primary">
                  Customize
                </Link>
                <button
                  onClick={() => P(preview === t.id ? null : t.id)}
                  aria-expanded={preview === t.id}
                >
                  Preview
                </button>
              </div>
            </div>
          </article>
        ))}
      </div>
      {preview && (
        <section className="stack">
          <h2>Template preview</h2>
          <GreetingView
            key={preview}
            config={newGreeting(preview)}
            source={() => undefined}
          />
        </section>
      )}
    </>
  );
}
function Dashboard() {
  const profile = useApi<Profile>("/profile"),
    list = useApi<Creation[]>("/creations"),
    notes = useApi<Inbox>("/inbox"),
    alerts = useApi<Notification[]>("/notifications");
  const [search, S] = useState("");
  const q = search.trim().toLowerCase();
  return (
    <>
      <Heading
        eyebrow="YOUR CREATIVE SPACE"
        title={`Hello${profile.data ? ", " + profile.data.display_name : ""}.`}
      >
        A little magic goes a long way.
      </Heading>
      <section className="dashboard-hero">
        <div>
          <p className="eyebrow">THE CREATIVE STUDIO</p>
          <h2>Say it your way.</h2>
          <p>Make a digital greeting that feels like you.</p>
          <Link className="primary" to="/app/templates">
            Start creating ↗
          </Link>
        </div>
        <span aria-hidden="true">✉</span>
      </section>
      <div className="stats">
        <Link to="/app/creations">
          <b>{list.data?.length ?? "—"}</b> Recent creations
        </Link>
        <Link to="/app/inbox">
          <b>{notes.data?.messages.length ?? "—"}</b> Recent notes
        </Link>
        <Link to="/app/notifications">
          <b>{alerts.data?.filter((n) => !n.seen).length ?? "—"}</b> Unread
          alerts
        </Link>
        <Link to="/app/settings">
          <b>↗</b> Account settings
        </Link>
      </div>
      <Status
        error={profile.error || list.error || notes.error || alerts.error}
      />
      <label>
        Find a greeting or template
        <input
          type="search"
          value={search}
          onChange={(e) => S(e.target.value)}
          placeholder="Try Memory Lane"
        />
      </label>
      <h2>Recent creations</h2>
      {list.data && !list.data.length && (
        <p className="muted">Your saved greetings will appear here.</p>
      )}
      <ul>
        {list.data
          ?.filter((r) => r.title.toLowerCase().includes(q))
          .slice(0, 5)
          .map((r) => (
            <li key={r.id}>
              <Link to={"/app/studio/" + r.id}>{r.title || "Untitled"}</Link>
            </li>
          ))}
      </ul>
      <h2>Inspiration for you</h2>
      <Tiles
        items={templates
          .filter((t) =>
            `${t.title} ${t.relationship} ${t.occasion}`
              .toLowerCase()
              .includes(q),
          )
          .slice(0, q ? 5 : 3)}
      />
    </>
  );
}
function Templates() {
  const { data, error, reload } =
    useApi<(typeof templates)[number][]>("/templates");
  const [q, Q] = useState(""),
    [rel, R] = useState(""),
    [oc, O] = useState(""),
    [category, C] = useState("");
  const categories = {
    letter: "Letter",
    heartbeat: "Animation",
    memory: "Photo album",
    forever: "Reveal",
    surprise: "Reveal",
  };
  const filtered = data?.filter(
    (t) =>
      (!rel || t.relationship === rel) &&
      (!oc || t.occasion === oc) &&
      (!category || categories[t.id] === category) &&
      `${t.title} ${t.relationship} ${t.occasion}`
        .toLowerCase()
        .includes(q.toLowerCase()),
  );
  return (
    <>
      <Heading eyebrow="TEMPLATE LIBRARY" title="Find the right words.">
        Start with a design and make it personal.
      </Heading>
      <div className="filters">
        <label>
          Search templates
          <input value={q} onChange={(e) => Q(e.target.value)} type="search" />
        </label>
        {[
          [
            "Relationship",
            rel,
            R,
            [...new Set(templates.map((t) => t.relationship))],
          ],
          ["Occasion", oc, O, [...new Set(templates.map((t) => t.occasion))]],
          ["Category", category, C, [...new Set(Object.values(categories))]],
        ].map(([name, value, set, options]) => (
          <label key={String(name)}>
            {String(name)}
            <select
              value={String(value)}
              onChange={(e) => (set as (v: string) => void)(e.target.value)}
            >
              <option value="">All</option>
              {(options as string[]).map((o) => (
                <option key={o}>{o}</option>
              ))}
            </select>
          </label>
        ))}
      </div>
      {filtered ? (
        <Tiles items={filtered} />
      ) : (
        <Wait error={error} retry={reload} />
      )}{" "}
      {filtered?.length === 0 && <p>No templates match those filters.</p>}
    </>
  );
}
function Creations() {
  const a = useAction(),
    { data, error, reload } = useApi<Creation[]>("/creations");
  return (
    <>
      <Heading eyebrow="YOUR WORK" title="My Creations" />
      <Link to="/app/templates" className="primary">
        New creation
      </Link>
      <Status error={a.error} message={a.message} />
      {!data ? (
        <Wait error={error} retry={reload} />
      ) : data.length === 0 ? (
        <p className="panel">No creations yet. Pick a template to begin.</p>
      ) : (
        <div className="stack spaced">
          {data.map((row) => (
            <article className="panel row" key={row.id}>
              <div>
                <p className="eyebrow">
                  {row.share ? "Published" : "Private draft"}
                </p>
                <h2>{row.title || "Untitled"}</h2>
              </div>
              <div className="actions">
                <Link className="secondary" to={`/app/studio/${row.id}`}>
                  Edit / export
                </Link>
                {row.share && (
                  <>
                    <Link to={`/g/${row.share}`}>View live</Link>
                    <button
                      onClick={() =>
                        a.run(() => copyPath(`/g/${row.share}`), "Link copied.")
                      }
                    >
                      Copy link
                    </button>
                    <button
                      onClick={() =>
                        a.run(async () => {
                          await api(`/creations/${row.id}/unpublish`, "POST");
                          reload();
                        })
                      }
                    >
                      Unpublish
                    </button>
                  </>
                )}
                <button
                  className="danger"
                  onClick={() => {
                    if (
                      confirm(
                        "Permanently delete this greeting and revoke its link?",
                      )
                    )
                      void a.run(async () => {
                        await api(`/creations/${row.id}`, "DELETE");
                        reload();
                      }, "Creation deleted.");
                  }}
                >
                  Delete
                </button>
              </div>
            </article>
          ))}
        </div>
      )}
    </>
  );
}
function Notes() {
  const a = useAction(),
    { data, error, reload } = useApi<Inbox>("/inbox");
  return (
    <>
      <Heading eyebrow="A LITTLE KINDNESS" title="Anonymous Notes">
        Share your inbox link so others can leave you a note.
      </Heading>
      <Status error={a.error} message={a.message} />
      {!data ? (
        <Wait error={error} retry={reload} />
      ) : (
        <>
          <div className="panel stack">
            <a href={`/note/${data.inbox.slug}`}>Open your inbox link</a>
            <div className="actions">
              <button
                onClick={() =>
                  a.run(
                    () => copyPath(`/note/${data.inbox.slug}`),
                    "Inbox link copied.",
                  )
                }
              >
                Copy inbox link
              </button>
              <button
                onClick={() =>
                  a.run(async () => {
                    await api("/inbox", "PUT", {
                      enabled: !data.inbox.enabled,
                    });
                    reload();
                  })
                }
              >
                {data.inbox.enabled
                  ? "Disable submissions"
                  : "Reactivate submissions"}
              </button>
            </div>
          </div>
          <div className="stack spaced">
            {data.messages.length === 0 && (
              <p className="muted">No notes yet.</p>
            )}
            {data.messages.map((n) => (
              <article key={n.id} className="panel">
                <p className="eyebrow">
                  {n.name ? `${n.name} · unverified name` : "Anonymous"} ·{" "}
                  {new Date(n.created * 1000).toLocaleDateString()}
                </p>
                <p className="pre">{n.body}</p>
                <div className="actions">
                  <button
                    onClick={() =>
                      a.run(async () => {
                        await api(`/inbox/${n.id}`, "PATCH", {
                          favorite: !n.favorite,
                        });
                        reload();
                      })
                    }
                  >
                    {n.favorite ? "Unfavorite" : "Favorite"}
                  </button>
                  <button
                    onClick={() => {
                      if (confirm("Delete this note?"))
                        void a.run(async () => {
                          await api(`/inbox/${n.id}`, "DELETE");
                          reload();
                        });
                    }}
                  >
                    Delete
                  </button>
                  <Link to={`/help?category=note&target=${n.id}`}>Report</Link>
                </div>
              </article>
            ))}
          </div>
        </>
      )}
    </>
  );
}
function Notifications() {
  const a = useAction(),
    { data, error, reload } = useApi<Notification[]>("/notifications");
  return (
    <>
      <Heading eyebrow="YOUR ACTIVITY" title="Notifications" />
      <button
        onClick={() =>
          a.run(async () => {
            await api("/notifications/read", "POST");
            reload();
          })
        }
      >
        Mark all as read
      </button>
      <Status error={a.error} />
      {!data ? (
        <Wait error={error} retry={reload} />
      ) : (
        <div className="stack spaced">
          {data.length === 0 && <p>Nothing new yet.</p>}
          {data.map((n) => (
            <article className="panel row" key={n.id}>
              <b>
                {n.kind}
                {!n.seen ? " · New" : ""}
              </b>
              <time>{new Date(n.created * 1000).toLocaleString()}</time>
            </article>
          ))}
        </div>
      )}
    </>
  );
}
export default function Pages({ page }: { page: string }) {
  return page === "dashboard" ? (
    <Dashboard />
  ) : page === "templates" ? (
    <Templates />
  ) : page === "creations" ? (
    <Creations />
  ) : page === "inbox" ? (
    <Notes />
  ) : (
    <Notifications />
  );
}
