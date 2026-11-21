# Evermore v1.0

**Every connection deserves a little magic.** Evermore is a free platform for making interactive greetings, sharing them by link, and receiving notes. It supports everyday messages as well as celebrations, with no subscriptions or paid features.

**Project owners:** Start with [NO-TERMINAL-DEPLOYMENT.md](NO-TERMINAL-DEPLOYMENT.md). No local terminal, Node.js, Git or Wrangler installation is required for that workflow. See the [compliance report](docs/REQUIREMENTS.md) and [production readiness checklist](docs/PRODUCTION-READINESS.md) before going live.

## Architecture and layout

| Path | Responsibility |
|---|---|
| `src/` | React 19, React Router, Tailwind v4 and Vite SPA. Includes dashboard, account, community screens, studio and recipient views. |
| `worker/` | Cloudflare Worker with Hono routes and shared authentication, validation and request controls. Same-origin API at `/api`. |
| `shared/` | Versioned greeting schema and reusable template definitions. |
| `database/schema.sql` | Complete, idempotent D1 schema for a fresh database (no migrations). |
| `tests/` | Vitest and React Testing Library; Playwright integration and mobile browser tests. |
| `.github/workflows/` | GitHub Actions CI. Cloudflare Workers Builds deploys from Git. |

The Worker serves the built SPA through `ASSETS`. D1 (`DB`) holds users, hashed sessions and hashed single-use recovery codes, structured drafts, publication snapshots, messages, profiles, moderation and notifications. R2 (`MEDIA`) holds optimized assets and preview files; it is private and served via authorized Worker routes. Owner drafts and the last published snapshot are separate. A draft edit does not change a live greeting until republished. A countdown is visual, not a privacy boundary.

Photo crops are created using Canvas in a worker; optional browser persistence uses IndexedDB. Without publishing, recipients cannot access a local photo. Exports are visual keepsakes rather than full replicas of the interactive design. Codec support varies; long messages can be clipped in the single-page export. A lazy Pyodide worker can check and count words without uploading the greeting to the CDN; the CDN receives runtime-download requests only. The JS editor is independent of that check.

## Optional contributor workflow

Use Node 22.16 or newer (CI uses Node 22). Run `npm ci`, `npm run db:init:local`, and `npm run dev`. For optional local integrations copy `.env.example` to `.dev.vars`; never commit it. Production settings belong in runtime Variables & Secrets, not Vite variables. Commands: `npm run typecheck`, `npm run lint`, `npm run test`, `npm run test:integration`, `npm run build`, `npm run test:e2e`. Run `npx playwright install --with-deps chromium` on Linux if needed. The Playwright suite launches a local Worker with local bindings; its WebServer command creates fresh temporary state and applies `database/schema.sql`. The builds output `dist/client` and `dist/evermore`; Wrangler deploys the Vite-generated config after build. Refer to the [official Vite guide](https://developers.cloudflare.com/workers/vite-plugin/get-started/).

## Security, privacy, backup and recovery

Accounts need only a unique username, a password and a display name; there is no email, phone or third-party sign-in. Passwords use salted scrypt with host-only HttpOnly session cookies in production. At registration a 160-bit random recovery code is shown once and only its SHA-256 hash is stored. Recovery takes the username, that code and a new password; the code is claimed atomically so it works once, all sessions end, and a replacement code is issued. Signed-in users can replace their code from Settings (password required). Recovery is limited to 10 attempts per network per 15 minutes and 5 per username per hour, so someone repeatedly guessing a username can temporarily block that person’s recovery. A user who loses both the password and the code cannot be recovered by design. Provision a Workers plan and CPU allowance appropriate for the scrypt cost; benchmark sign-up/login under staging load rather than reducing the work factor to meet a budget. Sessions expire after seven days. Anonymous submission counters are HMAC pseudonyms keyed by time window, not stored IP addresses; cron removes expired sessions and counters and used recovery-code records older than 30 days hourly. Support reports and moderation records persist until an operator removes or archives them under the site's retention policy. Avoid including sensitive personal data in reports. User deletion revokes access in D1 immediately, then hourly cleanup removes queued unreferenced R2 objects (with a one-hour grace period). Local media may remain until cleared per device. Device-photo clearing affects the whole Evermore origin on that browser.

Keep R2 public access disabled. Disable or redact infrastructure request logs that collect link paths, tokens, headers or user content, and never enable request-body logging. Public links are bearer links, not account authorization, and users can retain copies. Keep staged and production resources separate. For backup, document the actual D1 Time Travel retention in your account, and back up R2 objects independently with restricted access. Before applying irreversible schema changes or restoring a snapshot, capture the current state, test restores in isolation, and reconcile R2 objects against D1 before allowing recipient traffic. Restoration can otherwise resurrect previously revoked links; reconcile your deletion ledger or rotate affected links before reopening traffic. No backup or restoration was performed here.
