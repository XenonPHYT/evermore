import { useState, type FormEvent } from "react";
import { Link, useNavigate } from "react-router";
import { api, download, useApi, type Profile } from "./api";
import { Heading, RecoveryCodePanel, Status, Wait } from "./ui";
import { clearLocal, optimize } from "./media";
import type { Me } from "../shared/auth";
export default function Settings() {
  const p = useApi<Profile>("/profile");
  return p.data ? (
    <SettingsForm key={JSON.stringify(p.data)} p={p.data} reload={p.reload} />
  ) : (
    <Wait error={p.error} retry={p.reload} />
  );
}
function SettingsForm({ p, reload }: { p: Profile; reload: () => void }) {
  const a = useApi<Me>("/auth/me");
  const [newCode, setNewCode] = useState("");
  const sessions =
    useApi<{ created: number; expires: number; current: number }[]>(
      "/auth/sessions",
    );
  const navigate = useNavigate();
  const [error, E] = useState(""),
    [message, M] = useState(""),
    [busy, B] = useState(false),
    [avatar, A] = useState(0);
  async function run(f: () => Promise<unknown>, done = "") {
    E("");
    M("");
    B(true);
    try {
      await f();
      M(done);
    } catch (e) {
      E((e as Error).message);
    } finally {
      B(false);
    }
  }
  function form(
    e: FormEvent<HTMLFormElement>,
    action: (f: FormData) => Promise<unknown>,
    done: string,
  ) {
    e.preventDefault();
    const data = new FormData(e.currentTarget);
    void run(() => action(data), done);
  }
  return (
    <>
      <Heading eyebrow="YOUR PREFERENCES" title="Settings & privacy" />
      <Status error={error || a.error || sessions.error} message={message} />
      <div className="settings-grid">
        <section className="panel stack">
          <h2>Profile</h2>
          {p.has_avatar || avatar > 0 ? (
            <img
              className="avatar"
              src={`/api/profile/avatar?v=${avatar}`}
              alt="Your profile picture"
            />
          ) : null}
          <label>
            Upload a profile picture
            <input
              type="file"
              accept="image/*"
              disabled={busy}
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f)
                  void run(async () => {
                    await api(
                      "/profile/avatar",
                      "PUT",
                      await optimize(f, 1, 0.5, 0.5, 400),
                    );
                    A((i) => i + 1);
                  }, "Profile picture uploaded.");
              }}
            />
          </label>
          <p className="muted small">
            Choosing a photo uploads an optimized crop. It is public only if
            your profile is public.
          </p>
          <form
            className="stack"
            onSubmit={(e) =>
              form(
                e,
                async (f) => {
                  await api("/profile", "PUT", {
                    display_name: f.get("display_name"),
                    username: f.get("username") || null,
                    bio: f.get("bio"),
                    theme: f.get("theme"),
                    is_public: f.has("is_public"),
                    show_creations: f.has("show_creations"),
                    notify_notes: f.has("notify_notes"),
                  });
                  reload();
                },
                "Profile saved.",
              )
            }
          >
            <label>
              Display name
              <input
                name="display_name"
                defaultValue={p.display_name}
                required
                maxLength={50}
              />
            </label>
            <label>
              Public profile name
              <input
                name="username"
                defaultValue={p.username ?? ""}
                maxLength={30}
              />
            </label>
            <label>
              Biography
              <textarea name="bio" defaultValue={p.bio} maxLength={500} />
            </label>
            <label>
              Profile theme
              <select name="theme" defaultValue={p.theme}>
                {["rose", "lavender", "blue", "night"].map((t) => (
                  <option key={t}>{t}</option>
                ))}
              </select>
            </label>
            <label className="check">
              <input
                type="checkbox"
                name="is_public"
                defaultChecked={!!p.is_public}
              />
              Enable public profile
            </label>
            <label className="check">
              <input
                type="checkbox"
                name="show_creations"
                defaultChecked={!!p.show_creations}
              />
              Show published greetings I choose to list
            </label>
            <label className="check">
              <input
                type="checkbox"
                name="notify_notes"
                defaultChecked={!!p.notify_notes}
              />
              Notify me about incoming notes
            </label>
            <button className="primary" disabled={busy}>
              Save profile
            </button>
            {p.is_public !== 0 && p.username && (
              <Link to={`/people/${p.username}`}>Open public profile</Link>
            )}
          </form>
        </section>
        <div className="stack">
          <section className="panel stack">
            <h2>Account</h2>
            <p>
              Signed in as <b>{a.data?.account?.username}</b>
            </p>
            <form
              className="stack"
              onSubmit={(e) =>
                form(
                  e,
                  async (f) => {
                    await api("/auth/password", "POST", {
                      current: f.get("current"),
                      password: f.get("password"),
                    });
                    sessions.reload();
                  },
                  "Password changed. Other sessions ended.",
                )
              }
            >
              <label>
                Current password
                <input
                  name="current"
                  type="password"
                  required
                  autoComplete="current-password"
                />
              </label>
              <label>
                New password
                <input
                  name="password"
                  type="password"
                  minLength={12}
                  maxLength={128}
                  required
                  autoComplete="new-password"
                />
              </label>
              <button disabled={busy}>Change password</button>
            </form>
          </section>
          <section className="panel stack">
            <h2>Recovery code</h2>
            {newCode ? (
              <RecoveryCodePanel
                code={newCode}
                intro="Your previous code no longer works. Store this one safely; it is shown only once."
                continueLabel="Done"
                onContinue={() => setNewCode("")}
              />
            ) : (
              <form
                className="stack"
                onSubmit={(e) =>
                  form(
                    e,
                    async (f) => {
                      const r = await api<{ recoveryCode: string }>(
                        "/auth/recovery-code",
                        "POST",
                        { password: f.get("recoverypassword") },
                      );
                      setNewCode(r.recoveryCode);
                    },
                    "",
                  )
                }
              >
                <p className="muted small">
                  Lost your code? Enter your password to replace it. The old
                  code stops working immediately.
                </p>
                <label>
                  Confirm password
                  <input
                    name="recoverypassword"
                    type="password"
                    required
                    autoComplete="current-password"
                  />
                </label>
                <button disabled={busy}>Generate new recovery code</button>
              </form>
            )}
          </section>
          <section className="panel stack">
            <h2>Sessions and data</h2>
            <ul>
              {sessions.data?.map((s, i) => (
                <li key={i}>
                  {s.current ? "This session" : "Other session"} · expires{" "}
                  {new Date(s.expires * 1000).toLocaleDateString()}
                </li>
              ))}
            </ul>
            <div className="actions">
              <button
                disabled={busy}
                onClick={() =>
                  run(async () => {
                    await api("/auth/sessions/others", "DELETE");
                    sessions.reload();
                  }, "Other sessions revoked.")
                }
              >
                Sign out other sessions
              </button>
              <button
                disabled={busy}
                onClick={() =>
                  run(async () =>
                    download(
                      new Blob(
                        [JSON.stringify(await api("/profile/export"), null, 2)],
                        { type: "application/json" },
                      ),
                      "evermore-data.json",
                    ),
                  )
                }
              >
                Export account data
              </button>
              <button
                disabled={busy}
                onClick={() => run(clearLocal, "Device photos cleared.")}
              >
                Clear device photos
              </button>
            </div>
            <Link to="/help#privacy">Privacy information</Link>
          </section>
          <section className="panel stack">
            <h2>Delete account</h2>
            <p>
              Revokes all published links and deletes your account, creations
              and inbox. Also clear device photos on shared devices.
            </p>
            <form
              className="stack"
              onSubmit={(e) => {
                if (!confirm("Permanently delete your account?")) {
                  e.preventDefault();
                  return;
                }
                form(
                  e,
                  async (f) => {
                    await api("/auth/account", "DELETE", {
                      password: f.get("password"),
                    });
                    await clearLocal().catch(() => {});
                    navigate("/");
                  },
                  "",
                );
              }}
            >
              <label>
                Confirm password
                <input
                  type="password"
                  name="password"
                  required
                  autoComplete="current-password"
                />
              </label>
              <button className="danger" disabled={busy}>
                Permanently delete account
              </button>
            </form>
          </section>
        </div>
      </div>
    </>
  );
}
