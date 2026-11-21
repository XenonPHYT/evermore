import { useEffect, useState } from "react";
import { Link, useOutletContext, useParams } from "react-router";
import { api, copyPath, download, useApi } from "./api";
import { Heading, Status, Toggle, Wait } from "./ui";
import { greeting, kinds, newGreeting, type Greeting } from "../shared/model";
import GreetingView from "./viewer";
import {
  exportGreeting,
  localPhoto,
  optimize,
  removeLocal,
  saveLocal,
} from "./media";
type Saved = {
  id: string;
  revision: number;
  config: Greeting;
  listed: boolean;
  share: string | null;
  publishedPhotos: string[];
};
export default function Studio() {
  const { id = "letter" } = useParams();
  return kinds.some((k) => k === id) ? (
    <Editor
      key={id}
      initial={{
        id: "",
        revision: 0,
        config: newGreeting(id),
        listed: false,
        share: null,
        publishedPhotos: [],
      }}
    />
  ) : (
    <Existing key={id} id={id} />
  );
}
function Existing({ id }: { id: string }) {
  const { data, error, reload } = useApi<Saved>("/creations/" + id);
  return data ? (
    <Editor initial={data} />
  ) : (
    <Wait error={error} retry={reload} />
  );
}
function Editor({ initial }: { initial: Saved }) {
  const account = useOutletContext<string>();
  const [id, I] = useState(initial.id),
    [rev, R] = useState(initial.revision),
    [c, C] = useState(initial.config),
    [listed, L] = useState(initial.listed),
    [share, S] = useState(initial.share),
    [published, P] = useState(initial.publishedPhotos),
    [urls, U] = useState<Record<string, string>>({}),
    [local, J] = useState<Record<string, Blob>>({}),
    [error, E] = useState(""),
    [message, M] = useState(""),
    [busy, B] = useState(false),
    [keep, K] = useState(true),
    [consent, Q] = useState(false),
    [file, F] = useState<File | null>(null),
    [fileURL, V] = useState(""),
    [zoom, Z] = useState(1),
    [x, X] = useState(0.5),
    [y, Y] = useState(0.5),
    [preview, PV] = useState(false),
    [py, Py] = useState("");
  useEffect(() => {
    let active = true;
    Promise.all(
      initial.config.photos.map(
        async (p) =>
          [
            p.id,
            await localPhoto(`${account}:${p.id}`).catch(() => undefined),
          ] as const,
      ),
    ).then((a) => {
      if (active)
        J(
          Object.fromEntries(
            a.filter((t): t is readonly [string, Blob] => !!t[1]),
          ),
        );
    });
    return () => {
      active = false;
    };
  }, [account, initial.config.photos]);
  useEffect(() => {
    const a = Object.fromEntries(
      Object.entries(local).map(([k, v]) => [k, URL.createObjectURL(v)]),
    );
    U(a);
    return () => Object.values(a).forEach(URL.revokeObjectURL);
  }, [local]);
  useEffect(() => {
    if (!file) {
      V("");
      return;
    }
    const u = URL.createObjectURL(file);
    V(u);
    return () => URL.revokeObjectURL(u);
  }, [file]);
  const set = <T extends keyof Greeting>(field: T, value: Greeting[T]) =>
    C((s) => ({ ...s, [field]: value }));
  const source = (p: string) =>
    urls[p] ||
    (id && published.includes(p)
      ? `/api/creations/${id}/assets/${p}`
      : undefined);
  async function run(action: () => Promise<void>) {
    E("");
    M("");
    B(true);
    try {
      await action();
    } catch (e) {
      E((e as Error).message);
    } finally {
      B(false);
    }
  }
  async function save() {
    const valid = greeting.parse(c);
    if (id) {
      const out = await api<{ id: string; revision: number }>(
        `/creations/${id}`,
        "PUT",
        { config: valid, listed, revision: rev },
      );
      R(out.revision);
      return out;
    }
    const out = await api<{ id: string }>("/creations", "POST", {
      config: valid,
      listed,
    });
    I(out.id);
    return { ...out, revision: 0 };
  }
  async function publish() {
    if (!consent) throw Error("Confirm the publishing and media notice first.");
    if (c.photos.some((p) => !local[p.id] && !published.includes(p.id)))
      throw Error("Reattach missing device photos before publishing.");
    const a = await save();
    for (const p of c.photos) {
      const b = local[p.id];
      if (b && !published.includes(p.id))
        await api(`/creations/${a.id}/assets/${p.id}`, "PUT", b, {
          "X-Publish-Consent": "yes",
        });
    }
    {
      const b = await exportGreeting(c, source, "webp");
      await api(`/creations/${a.id}/assets/preview`, "PUT", b, {
        "X-Publish-Consent": "yes",
      });
    }
    const out = await api<{ share: string; revision: number }>(
      `/creations/${a.id}/publish`,
      "POST",
      { consent: true, revision: a.revision },
    );
    R(out.revision);
    S(out.share);
    P(c.photos.map((p) => p.id));
    Q(false);
    M("Published. Your greeting is ready to share.");
  }
  async function crop() {
    if (!file || c.photos.length >= 6) return;
    const blob = await optimize(file, zoom, x, y);
    const p = { id: crypto.randomUUID(), caption: "" };
    if (keep) await saveLocal(`${account}:${p.id}`, blob);
    J((a) => ({ ...a, [p.id]: blob }));
    set("photos", [...c.photos, p]);
    F(null);
  }
  function checkPython() {
    Py("Starting the optional validator…");
    const w = new Worker(new URL("./python.worker.ts", import.meta.url));
    const timeout = setTimeout(() => {
      w.terminate();
      Py("Python timed out. The JavaScript editor is still available.");
    }, 35000);
    const end = (m: string) => {
      clearTimeout(timeout);
      w.terminate();
      Py(m);
    };
    w.onerror = () =>
      end(
        "Python was blocked or unavailable. Continue in JavaScript, or retry.",
      );
    w.onmessage = (e) => {
      if (e.data.stage) Py(e.data.stage);
      else if (e.data.error) end(e.data.error);
      else
        end(
          `${e.data.result.valid ? "Looks good" : "A title and message are required"} · ${e.data.result.words} words.`,
        );
    };
    w.postMessage(JSON.stringify(c));
  }
  return (
    <>
      <Heading eyebrow="CREATIVE STUDIO" title={c.title || "Untitled greeting"}>
        Design privately. Publish only when you’re ready.
      </Heading>
      <div className="studio">
        <fieldset className="panel stack controls" disabled={busy}>
          <legend>Greeting details</legend>
          <label>
            Greeting title
            <input
              value={c.title}
              maxLength={90}
              onChange={(e) => set("title", e.target.value)}
            />
          </label>
          <label>
            Message
            <textarea
              aria-label="Message"
              rows={6}
              value={c.body}
              maxLength={2500}
              onChange={(e) => set("body", e.target.value)}
            />
          </label>
          <div className="filters">
            {(["font", "palette", "texture", "effect", "sticker"] as const).map(
              (k) => (
                <label className="capitalize" key={k}>
                  {k}
                  <select
                    value={c[k]}
                    onChange={(e) => set(k, e.target.value as never)}
                  >
                    {{
                      font: ["serif", "sans", "mono"],
                      palette: ["rose", "lavender", "blue", "night"],
                      texture: ["plain", "linen"],
                      effect: ["none", "hearts", "petals", "sparkles"],
                      sticker: ["none", "heart", "flower", "star"],
                    }[k].map((v) => (
                      <option key={v}>{v}</option>
                    ))}
                  </select>
                </label>
              ),
            )}
          </div>
          <div className="actions">
            <label>
              Custom text color
              <input
                type="color"
                value={c.ink || "#75465e"}
                onChange={(e) => set("ink", e.target.value)}
              />
            </label>
            <button onClick={() => set("ink", undefined)}>
              Use theme color
            </button>
          </div>
          <label>
            Countdown (your local time)
            <input
              type="datetime-local"
              value={
                c.countdown
                  ? new Date(
                      c.countdown -
                        new Date(c.countdown).getTimezoneOffset() * 60000,
                    )
                      .toISOString()
                      .slice(0, 16)
                  : ""
              }
              onChange={(e) =>
                set(
                  "countdown",
                  e.target.value ? new Date(e.target.value).getTime() : null,
                )
              }
            />
          </label>
          <Toggle
            label="Play a soft chime on reveal"
            checked={c.sound}
            onChange={(v) => set("sound", v)}
          />
          <Toggle
            label="List on my public profile after publishing, if enabled"
            checked={listed}
            onChange={L}
          />
          <details>
            <summary>Photos ({c.photos.length}/6)</summary>
            <p className="muted">
              Originals stay on this device. Only your optimized crops are sent
              when you publish.
            </p>
            <Toggle
              label="Keep optimized crops in this browser"
              checked={keep}
              onChange={K}
            />
            <label>
              Choose a photo
              <input
                type="file"
                accept="image/jpeg,image/png,image/webp,image/gif,image/avif"
                disabled={c.photos.length >= 6}
                onChange={(e) => F(e.target.files?.[0] ?? null)}
              />
            </label>
            {file && (
              <div className="stack">
                <div className="crop-frame">
                  <img
                    className="crop"
                    src={fileURL}
                    alt="Crop reference"
                    style={{
                      objectPosition: `${x * 100}% ${y * 100}%`,
                      transformOrigin: `${x * 100}% ${y * 100}%`,
                      scale: zoom,
                    }}
                  />
                </div>
                {[
                  ["Zoom", zoom, Z, 1, 3],
                  ["Horizontal position", x, X, 0, 1],
                  ["Vertical position", y, Y, 0, 1],
                ].map(([name, v, change, min, max]) => (
                  <label key={String(name)}>
                    {String(name)}
                    <input
                      type="range"
                      min={Number(min)}
                      max={Number(max)}
                      step="0.05"
                      value={Number(v)}
                      onChange={(e) =>
                        (change as (n: number) => void)(Number(e.target.value))
                      }
                    />
                  </label>
                ))}
                <button onClick={() => run(crop)}>Add optimized crop</button>
              </div>
            )}
            {c.photos.map((p, i) => (
              <div className="photo-editor" key={p.id}>
                {source(p.id) ? (
                  <img src={source(p.id)} alt={`Crop ${i + 1}`} />
                ) : (
                  <p>Crop missing on this device.</p>
                )}
                <label>
                  Photo {i + 1} caption
                  <input
                    maxLength={150}
                    value={p.caption}
                    onChange={(e) =>
                      set(
                        "photos",
                        c.photos.map((a) =>
                          a.id === p.id ? { ...a, caption: e.target.value } : a,
                        ),
                      )
                    }
                  />
                </label>
                <button
                  onClick={() =>
                    run(async () => {
                      set(
                        "photos",
                        c.photos.filter((a) => a.id !== p.id),
                      );
                      J((o) =>
                        Object.fromEntries(
                          Object.entries(o).filter(([k]) => k !== p.id),
                        ),
                      );
                      if (keep) await removeLocal(`${account}:${p.id}`);
                    })
                  }
                >
                  Remove photo
                </button>
              </div>
            ))}
          </details>
          <div className="actions">
            <button
              onClick={() =>
                run(async () => {
                  await save();
                  M("Private draft saved. Reopen it from My Creations.");
                })
              }
            >
              Save draft
            </button>
            <button onClick={() => PV(!preview)}>
              {preview ? "Exit preview mode" : "Preview mode"}
            </button>
          </div>
          <Toggle
            label="Publish an unlisted link and upload my selected optimized crops and preview"
            checked={consent}
            onChange={Q}
          />
          <button
            className="primary"
            disabled={!consent || busy}
            onClick={() => run(publish)}
          >
            {share ? "Republish greeting" : "Publish greeting"}
          </button>
        </fieldset>
        <div className="stack">
          <Status error={error} message={busy ? "Working…" : message} />
          <GreetingView
            key={String(preview)}
            config={preview ? c : { ...c, countdown: null }}
            source={source}
          />
          {share && (
            <div className="panel actions">
              <Link to={`/g/${share}`}>Open live greeting</Link>
              <button
                onClick={() =>
                  run(async () => {
                    await copyPath(`/g/${share}`);
                    M("Link copied.");
                  })
                }
              >
                Copy sharing link
              </button>
            </div>
          )}
          <details className="panel">
            <summary>Export / advanced tools</summary>
            <p>
              Exports are visual keepsakes, not interactive greetings. Video
              format depends on your browser.
            </p>
            <div className="actions">
              {(["png", "jpeg", "video"] as const).map((f) => (
                <button
                  key={f}
                  disabled={busy}
                  onClick={() =>
                    run(async () => {
                      const b = await exportGreeting(c, source, f);
                      download(
                        b,
                        `evermore.${b.type.split("/")[1].split(";")[0]}`,
                      );
                      M("Export ready.");
                    })
                  }
                >
                  {f.toUpperCase()}
                </button>
              ))}
              <button disabled={busy} onClick={checkPython}>
                Check with Python
              </button>
            </div>
            <p role="status">{py}</p>
          </details>
        </div>
      </div>
    </>
  );
}
