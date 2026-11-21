# Deploy Evermore from your browser

You will need a GitHub account, a Cloudflare account with permission to manage Workers, D1 and R2. Settings may be named slightly differently depending on the dashboard rollout.

## 1. Prepare GitHub and resources

1. Extract the download using your device’s file manager. Inside `evermore`, `package.json` and `wrangler.jsonc` are at the repository root. Create a GitHub repository and add the contents to `main` using **Add file → Upload files**. Preserve paths. If a browser uploader skips dotfiles, create `.gitignore`, `.env.example` and `.github/workflows/ci.yml` through **Add file → Create new file**, copying their exact contents. If the site does not preserve folders, use GitHub’s web editor (`github.dev`) or the file-creation form with full paths. Check that `package-lock.json`, `worker/`, `src/`, `shared/` and `database/schema.sql` are present. Do not commit any real credentials.
2. In Cloudflare, open **Storage & databases → D1** and create a database. Record the exact database name and UUID. Open **R2** and create a private bucket. Leave public access and custom bucket domain off.
3. Edit `wrangler.jsonc` in GitHub and replace `REPLACE_WITH_D1_NAME`, `REPLACE_WITH_D1_ID`, and `replace-with-r2-bucket-name`. Keep binding names `DB`, `MEDIA`, `ASSETS`. Keep the Worker name `evermore` or change it to exactly match the Worker you will deploy. The source assets directory is used for Vite public assets; the Vite build rewrites Wrangler to serve `dist/client`.

## 2. Connect Workers Builds

In **Workers & Pages**, create or select your Worker, then import the Git repository (or connect it under **Settings → Build**). Authorize the repository in GitHub. Set these options:

| Setting | Value |
|---|---|
| Production branch | `main` |
| Root directory | Repository root (`/`) |
| Build-time Node version | Set build variable `NODE_VERSION` to a current Node 22 patch release, at least 22.16 |
| Build command | `npm ci && npm run build` |
| Deploy command | `npm run db:init:remote && npm run deploy:built` |
| Preview builds | Leave off until you have isolated staging resources |

These commands run **on Cloudflare’s build server**, not on your computer. The deploy command runs `database/schema.sql` against the database named by `DB`, then deploys the Vite-built application. The file is written with `IF NOT EXISTS` and `INSERT OR IGNORE`, so it initializes a completely empty D1 database and is safe to run again on every deploy; it never drops or alters data. The Workers Builds token must be scoped to this account and permit both Worker deployment and **D1 Edit**. If the default build token cannot migrate, create/select a scoped build token under **Settings → Build** using the Cloudflare token dashboard. Do not paste that token into the repo or into Worker runtime settings. To recover a failed first build, correct resource names or token permissions and retry in **Deployments/Build logs**. `--keep-vars` preserves dashboard runtime variables across redeployments.

Sources: [Workers Builds settings](https://developers.cloudflare.com/workers/ci-cd/builds/configuration/) · [D1 console and SQL execution](https://developers.cloudflare.com/d1/platform/client-api/) · [Workers Vite plugin](https://developers.cloudflare.com/workers/vite-plugin/get-started/).

### Alternative: initialize D1 by pasting SQL (no build token needed)

If you prefer, skip `db:init:remote` and use **Deploy command** `npm run deploy:built` instead. Then open **Storage & databases → D1 → your database → Console**, paste the entire contents of `database/schema.sql` from GitHub, and run it once. Afterwards **Tables** should list `users`, `profiles`, `sessions`, `recovery_codes`, `creations`, `creation_assets`, `inboxes`, `messages`, `notifications`, `templates`, `reports`, `moderation_records`, `rate_limits` and `storage_gc`. The old `0001_core.sql` and `0002_publication_state.sql` files no longer exist and must not be run.

## 3. Add runtime variables and secrets

In **Workers & Pages → Evermore → Settings → Variables & Secrets**, not in build settings:

| Name | Type / purpose |
|---|---|
| `ABUSE_SECRET` | **Required secret** for production writes subject to rate limiting. Generate a unique random value, at least 32 random characters, in a trusted password manager. |
| `TURNSTILE_SITE_KEY` / `TURNSTILE_SECRET` | Optional widget key and secret; configure both with the actual hostname to enable the note form challenge. Enable before broader release if appropriate for your abuse risk. |
| `MODERATION_TOKEN` | Optional secret of at least 32 random characters to enable queue access at `/moderation`. Store in your password manager and rotate when access changes. Never share it with customers. |

Confirm **Bindings** lists `DB`, `MEDIA` and the built assets. Check **Triggers** for scheduled cleanup. No email, SMS or external sign-in provider is used or needed. Accounts are a username, a password and a one-time recovery code shown at sign-up; tell users to store it, because nobody (including you) can look it up. Review the Workers plan’s CPU budget before enabling registration publicly; confirm registration and login work under production limits. Saving Variables & Secrets may create a new Worker deployment; confirm the active deployment receives the values.

## 4. Preview and validate

For safe previews, create an isolated staging Worker with its own Git branch, D1 and private R2 and its own secrets; use the same build/database-initialization sequence on the staging branch and visit that Worker’s URL. Keep production project preview builds off unless you have explicitly validated the preview mechanism and bindings. Do not point a branch preview or a version upload at production data. Use the GitHub **Actions** tab to inspect CI. After committing on `main`, inspect Cloudflare **Build logs**, then **Deployments** and **Observability**. Check `/api/health`, then register (copy the recovery code shown once), log out, recover the account with the username and code, confirm the old code is rejected and the new one works, log in, publish a greeting containing a crop, open it in a private window, unpublish it, and confirm both page and asset are inaccessible. Also send an anonymous note, test inbox closure and verify the moderator queue. See [production readiness](docs/PRODUCTION-READINESS.md).

`database/schema.sql` describes the first, empty database. After real users exist, do not rely on editing it to change live tables: `CREATE TABLE IF NOT EXISTS` will not alter an existing table. Add a separate, reviewed SQL change file and test it on staging first. If you see server errors after deploying, check that the schema ran (D1 **Tables** should list `users`, `recovery_codes` and the rest), resource bindings are correct, and the Worker has its runtime secrets. If the frontend returns a 404 for nested links, inspect the Vite build output and SPA asset configuration. If auth fails only on deployed Workers, inspect CPU-limit errors and the runtime configuration. Avoid posting any private build token or application payload in issues.
