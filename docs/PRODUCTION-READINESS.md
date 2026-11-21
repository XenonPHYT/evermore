# Production readiness checklist

The archive is source code, not a deployed or audited production service.

- [ ] Create production and staging Workers, D1 databases, and private R2 buckets; verify separation.
- [ ] Configure scoped build permissions and runtime secrets; run `database/schema.sql` against an empty staging D1 database first.
- [ ] Check registration/login latency, CPU and resource limits on the actual plan with realistic traffic. Do not weaken the password KDF to fit a plan.
- [ ] Verify HTTPS cookie attributes, direct navigation, no-store/noindex behavior, and revocation of access to published greetings/assets.
- [ ] On staging, register, record the recovery code, recover the account, and confirm the old code and old sessions stop working. Verify Turnstile with real staging credentials if enabled.
- [ ] Confirm cron cleanup in deployed Cloudflare, including abandoned uploads, expired counters and media associated with deleted records.
- [ ] Verify an actual moderation decision, define who handles reports, and set a report-retention and escalation policy.
- [ ] Validate accessibility and device behavior beyond the Chromium tests; verify Safari/iOS cropping and codec support if needed.
- [ ] Exercise incident response, rate limits, account deletion, backups and isolated restoration. Align retention with your privacy terms.
- [ ] Perform independent security and load review. Review provider logs, fees, operational limits and credential rotation procedures.
- [ ] Decide user-support policy for accounts that lose both password and recovery code (there is no email fallback), and for recovery rate-limit lockouts.
