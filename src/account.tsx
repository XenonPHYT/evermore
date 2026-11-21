import { useState, type FormEvent } from "react";
import { Link, useNavigate, useParams } from "react-router";
import { api } from "./api";
import { Brand, Heading, RecoveryCodePanel, Status } from "./ui";
import type { RecoverResponse, RegisterResponse } from "../shared/auth";
export default function Account() {
  const { mode } = useParams();
  return <AccountForm key={mode} mode={mode || "login"} />;
}
function AccountForm({ mode }: { mode: string }) {
  const go = useNavigate();
  const [error, E] = useState(""),
    [busy, B] = useState(false),
    [code, setCode] = useState<{ value: string; next: string } | null>(null);
  const recover = mode === "recover",
    register = mode === "register";
  const title = code
    ? "Save your recovery code"
    : recover
      ? "Recover your account"
      : register
        ? "Make yourself at home"
        : "Welcome back";
  async function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    B(true);
    E("");
    const f = new FormData(e.currentTarget);
    try {
      if (recover) {
        const r = await api<RecoverResponse>("/auth/recover", "POST", {
          username: f.get("username"),
          recoveryCode: f.get("recoveryCode"),
          password: f.get("password"),
        });
        setCode({ value: r.recoveryCode, next: "/account/login" });
      } else if (register) {
        const r = await api<RegisterResponse>("/auth/register", "POST", {
          username: f.get("username"),
          password: f.get("password"),
          displayName: f.get("name"),
        });
        setCode({ value: r.recoveryCode, next: "/app" });
      } else {
        await api("/auth/login", "POST", {
          username: f.get("username"),
          password: f.get("password"),
        });
        go("/app");
      }
    } catch (e) {
      E((e as Error).message);
    } finally {
      B(false);
    }
  }
  return (
    <main id="main" className="public narrow">
      <Brand />
      <Heading eyebrow="YOUR EVERMORE ACCOUNT" title={title} />
      {code ? (
        <RecoveryCodePanel
          code={code.value}
          continueLabel={
            recover ? "Continue to log in" : "Continue to my workspace"
          }
          intro={
            recover
              ? "Your password was changed and every session was signed out. The code you just used no longer works. This replacement is the only code that can recover your account now."
              : "This is the only way to get back in if you forget your password. We store only a hash, so we cannot show it again."
          }
          onContinue={() => go(code.next)}
        />
      ) : (
        <form className="panel stack" onSubmit={submit}>
          {register && (
            <label>
              Display name
              <input
                name="name"
                required
                maxLength={50}
                autoComplete="nickname"
              />
            </label>
          )}
          <label>
            Username
            <input
              name="username"
              required
              minLength={3}
              maxLength={30}
              pattern="[A-Za-z0-9_\-]{3,30}"
              autoCapitalize="none"
              autoCorrect="off"
              spellCheck={false}
              autoComplete="username"
            />
            {register && (
              <small>3–30 letters, numbers, hyphens or underscores.</small>
            )}
          </label>
          {recover && (
            <label>
              Recovery code
              <input
                name="recoveryCode"
                required
                maxLength={64}
                autoCapitalize="characters"
                autoCorrect="off"
                spellCheck={false}
                autoComplete="off"
              />
            </label>
          )}
          <label>
            {recover ? "New password" : "Password"}
            <input
              type="password"
              name="password"
              minLength={mode === "login" ? undefined : 12}
              maxLength={128}
              required
              autoComplete={
                mode === "login" ? "current-password" : "new-password"
              }
            />
            {mode !== "login" && <small>Use at least 12 characters.</small>}
          </label>
          <button className="primary" disabled={busy}>
            {busy
              ? "Please wait…"
              : recover
                ? "Reset password"
                : register
                  ? "Create account"
                  : "Log in"}
          </button>
          <Status error={error} />
        </form>
      )}
      {!code && (
        <div className="actions">
          <Link to={mode === "login" ? "/account/register" : "/account/login"}>
            {mode === "login" ? "Create an account" : "Back to log in"}
          </Link>
          {mode === "login" && (
            <Link to="/account/recover">Forgot password</Link>
          )}
        </div>
      )}
    </main>
  );
}
