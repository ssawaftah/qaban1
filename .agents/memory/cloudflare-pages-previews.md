---
name: Cloudflare Pages previews
description: Wrangler Pages and D1 local-preview constraints in the Replit workspace.
---

Run `wrangler pages dev` from the Pages app directory so Wrangler discovers its configuration file; Pages rejects a custom `--config` path. Local D1 migrations and Pages dev must use the same persistence directory. For a Replit artifact mounted below a URL prefix, the preview build also needs a root SPA fallback whose asset URLs still point at that prefix; clear prior build output when switching between prefixed and root builds.

**Why:** Wrangler's Pages CLI, D1 local state, and Replit's path-based artifact preview each apply different defaults; mismatches can make the root page work while nested routes or database-backed pages fail.

**How to apply:** When wiring another Pages app in this workspace, verify the app's configured working directory, use identical local D1 persistence for migration and preview, and test a direct reload of a nested route under the artifact prefix.
