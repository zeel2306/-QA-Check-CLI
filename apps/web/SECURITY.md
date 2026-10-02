# Security boundaries

The public `/demo` workspace is sample data only. Never put real secrets or application data into demo forms. Its state is stored in sessionStorage on the user's device. Demo token values cannot authenticate. `/dashboard` and application APIs require configured Clerk identity, organization membership and server-side permissions. Real data never falls back to the demo.

Project upload tokens are 256-bit random credentials, hashed at rest, project-scoped and expiring. Copy them once, store them in a CI secret manager, and revoke them if exposed. Do not use project tokens in client-side application code or fork PR workflows. Interactive CLI browser login is not implemented here.

Uploads project local report schema v2 onto bounded cloud fields; raw process output, source snippets, stack traces and request headers are not stored. Secret-pattern redaction is supplementary. Users must remove sensitive values from free text before upload. Screenshot ingestion is disabled in this initial implementation. Object storage must have private access policies.

Payment webhook signatures use exact raw bytes and timing-safe verification. Provider state is retrieved server-side; browser success cannot grant plan entitlement. All real payment paths need Razorpay test-mode verification and concurrency hardening before live launch. No card data is stored by this application.

Use a private vulnerability report through the repository owner's configured channel; do not post credentials or private reports in public issues. Do not deploy until provider setup, tenant-isolation integration tests, storage policies, TLS, backups and recovery have been verified. This build intentionally documents unimplemented production features in README rather than treating it as production-certified.
