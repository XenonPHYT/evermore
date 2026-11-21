import { useState, type ReactNode } from "react";
import { Link } from "react-router";
import { download } from "./api";
export function Brand() {
  return (
    <Link to="/" className="brand">
      <span aria-hidden="true">✦</span> Evermore
    </Link>
  );
}
export function Heading({
  eyebrow,
  title,
  children,
}: {
  eyebrow: string;
  title: string;
  children?: ReactNode;
}) {
  return (
    <header className="heading">
      <p className="eyebrow">{eyebrow}</p>
      <h1>{title}</h1>
      {children && <div className="muted">{children}</div>}
    </header>
  );
}
export function Status({
  error = "",
  message = "",
}: {
  error?: string;
  message?: string;
}) {
  return error ? (
    <p className="error" role="alert">
      {error}
    </p>
  ) : message ? (
    <p className="status" role="status">
      {message}
    </p>
  ) : null;
}
export function Wait({ error, retry }: { error?: string; retry?: () => void }) {
  return (
    <div className="panel" role={error ? "alert" : "status"}>
      {error || "Loading…"}{" "}
      {error && retry && <button onClick={retry}>Try again</button>}
    </div>
  );
}
export function Toggle({
  label,
  checked,
  onChange,
}: {
  label: string;
  checked: boolean;
  onChange: (value: boolean) => void;
}) {
  return (
    <label className="check">
      <input
        type="checkbox"
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
      />
      {label}
    </label>
  );
}
export function RecoveryCodePanel({
  code,
  intro,
  continueLabel,
  onContinue,
}: {
  code: string;
  intro: string;
  continueLabel: string;
  onContinue: () => void;
}) {
  const [saved, setSaved] = useState(false),
    [copied, setCopied] = useState("");
  async function copy() {
    try {
      await navigator.clipboard.writeText(code);
      setCopied("Copied.");
    } catch {
      setCopied("Copy failed. Select the code and copy it manually.");
    }
  }
  return (
    <section className="panel stack" aria-labelledby="recovery-title">
      <h2 id="recovery-title">Your recovery code</h2>
      <p>{intro}</p>
      <p
        className="recovery-code"
        data-testid="recovery-code"
        aria-label="Recovery code"
      >
        {code}
      </p>
      <div className="actions">
        <button type="button" onClick={() => void copy()}>
          Copy code
        </button>
        <button
          type="button"
          onClick={() =>
            download(
              new Blob(
                [
                  `Evermore recovery code\n${code}\nKeep this private. It works once.\n`,
                ],
                { type: "text/plain" },
              ),
              "evermore-recovery-code.txt",
            )
          }
        >
          Download as text
        </button>
      </div>
      <Status message={copied} />
      <label className="check">
        <input
          type="checkbox"
          checked={saved}
          onChange={(e) => setSaved(e.target.checked)}
        />
        I have saved my recovery code somewhere safe
      </label>
      <button className="primary" disabled={!saved} onClick={onContinue}>
        {continueLabel}
      </button>
    </section>
  );
}
