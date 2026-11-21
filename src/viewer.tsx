import { useEffect, useRef, useState } from "react";
import { palettes, templates, type Greeting } from "../shared/model";
const icons = {
  letter: "✉",
  heartbeat: "♡",
  memory: "▧",
  forever: "❀",
  surprise: "🎁",
};
export default function GreetingView({
  config: c,
  source,
}: {
  config: Greeting;
  source: (id: string) => string | undefined;
}) {
  const [open, O] = useState(false),
    [now, N] = useState(Date.now()),
    [typed, T] = useState(0);
  const card = useRef<HTMLDivElement>(null);
  const remaining = Math.ceil(((c.countdown ?? 0) - now) / 1000);
  const locked = remaining > 0;
  useEffect(() => {
    if (!c.countdown) return;
    const i = setInterval(() => N(Date.now()), 500);
    return () => clearInterval(i);
  }, [c.countdown]);
  useEffect(() => {
    if (
      !open ||
      c.kind !== "letter" ||
      matchMedia("(prefers-reduced-motion: reduce)").matches
    )
      return;
    const start = Date.now();
    const i = setInterval(() => {
      const n = Math.ceil((Date.now() - start) / 24);
      T(n);
      if (n >= c.body.length) clearInterval(i);
    }, 24);
    return () => clearInterval(i);
  }, [open, c.kind, c.body.length]);
  function reveal() {
    T(0);
    O(true);
    if (!matchMedia("(prefers-reduced-motion: reduce)").matches)
      card.current?.animate(
        [
          { opacity: 0.5, transform: "scale(.97)" },
          { opacity: 1, transform: "scale(1)" },
        ],
        { duration: c.kind === "forever" ? 850 : 380 },
      );
    if (c.sound) {
      try {
        const ctx = new AudioContext();
        const g = ctx.createGain();
        g.gain.value = 0.075;
        g.connect(ctx.destination);
        [523.25, 659.25, 783.99].forEach((f, i) => {
          const x = ctx.createOscillator();
          x.frequency.value = f;
          x.connect(g);
          x.start(ctx.currentTime + i * 0.15);
          x.stop(ctx.currentTime + i * 0.15 + 0.13);
        });
        setTimeout(() => void ctx.close(), 850);
      } catch {
        /* Audio is optional. */
      }
    }
  }
  const [bg, ink] = palettes[c.palette],
    tpl = templates.find((t) => t.id === c.kind);
  const body =
    c.kind === "letter" &&
    !matchMedia("(prefers-reduced-motion: reduce)").matches
      ? c.body.slice(0, typed)
      : c.body;
  return (
    <div
      ref={card}
      className={`greeting ${c.kind} ${c.texture}`}
      style={{
        backgroundColor: bg,
        color: c.ink || ink,
        fontFamily: {
          serif: "Georgia, serif",
          sans: "system-ui, sans-serif",
          mono: "ui-monospace, monospace",
        }[c.font],
      }}
    >
      {c.effect !== "none" && (
        <div className="particles" aria-hidden="true">
          {Array.from({ length: 10 }, (_, i) => (
            <span
              key={i}
              style={{
                left: `${(i * 17 + 5) % 97}%`,
                animationDelay: `${-i * 0.63}s`,
              }}
            >
              {c.effect === "hearts" ? "♥" : c.effect === "petals" ? "❀" : "✦"}
            </span>
          ))}
        </div>
      )}
      <div className="greeting-content">
        <p className="eyebrow">{tpl?.title}</p>
        {!open || locked ? (
          <>
            <div className="reveal-icon" aria-hidden="true">
              {c.kind === "heartbeat" ? (
                <svg
                  viewBox="0 0 64 60"
                  width="100"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                >
                  <path d="M32 54C27 49 4 31 4 17 4 4 22 0 32 13 42 0 60 4 60 17 60 31 37 49 32 54Z" />
                </svg>
              ) : (
                icons[c.kind]
              )}
            </div>
            <p>
              {locked
                ? `Opens in ${Math.floor(remaining / 86400)}d ${Math.floor(remaining / 3600) % 24}h ${Math.floor(remaining / 60) % 60}m ${remaining % 60}s`
                : "A little something for you."}
            </p>
            <button className="primary" disabled={locked} onClick={reveal}>
              {
                [
                  "Open envelope",
                  "Reveal heartbeat",
                  "Open scrapbook",
                  "Break the seal",
                  "Open the gift",
                ][
                  [
                    "letter",
                    "heartbeat",
                    "memory",
                    "forever",
                    "surprise",
                  ].indexOf(c.kind)
                ]
              }
            </button>
          </>
        ) : (
          <>
            <h2>
              {c.title || "Untitled greeting"}{" "}
              {c.sticker !== "none" && (
                <span aria-hidden="true">
                  {{ heart: "♥", flower: "❀", star: "✦" }[c.sticker]}
                </span>
              )}
            </h2>
            <div className="pre">
              <span className="sr-only">{c.body}</span>
              <span aria-hidden="true">{body}</span>
            </div>
            {c.photos.length > 0 && (
              <div className="album">
                {c.photos.map((p, i) => (
                  <figure key={p.id}>
                    {source(p.id) ? (
                      <img
                        src={source(p.id)}
                        alt={`Memory ${i + 1}${p.caption ? ": " + p.caption : ""}`}
                        loading="lazy"
                      />
                    ) : (
                      <div className="photo-empty">Photo unavailable</div>
                    )}
                    <figcaption>{p.caption}</figcaption>
                  </figure>
                ))}
              </div>
            )}
            <button onClick={() => O(false)}>Replay</button>
          </>
        )}
      </div>
    </div>
  );
}
