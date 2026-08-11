---
name: pwa-release
description: Safely change Vite, service-worker, offline fallback, cache, Docker, Vercel, or release-distribution behavior. Use when changing deployment configuration, public assets, versioning, or install/update flows.
---

# PWA and Release

## Read First

- `vite.config.ts` for Vite, PWA, manifest, cache, and injected version settings.
- `src/main.tsx` and PWA-related components for registration and update prompts.
- `public/`, `public/offline.html`, `Dockerfile`, `nginx.conf`, and `vercel.json` for runtime behavior.
- `.github/workflows/build_test.yml` and `.github/workflows/release_dist.yml` for CI and release packaging.
- `docs/VERSIONING.md` for the version workflow, while treating `package.json` as the source of truth.

## Change Rules

1. Preserve SPA fallback behavior for Vercel, Nginx, and the release ZIP.
2. Keep service-worker precache/runtime cache patterns, size limits, update prompts, and offline fallback intentional. Avoid caching secrets or mutable API responses indiscriminately.
3. Ensure public assets referenced by the manifest and `includeAssets` exist and are included in `dist`.
4. `package.json` owns the application version; builds inject it as `__APP_VERSION__`. Release tags must match the package version after removing an optional `v` prefix.
5. Do not manually edit generated `dist/`, `dev-dist/`, service-worker, or manifest output. Rebuild instead.
6. Remember that analytics and provider calls can still require network access even though core editing is offline-first.

## Verification

- Run `pnpm run type-check`, `pnpm run lint`, and `pnpm run build`.
- Inspect `dist/index.html`, `dist/sw.js`, the manifest, fallback assets, and expected public assets after a build.
- Perform a production preview smoke test for first load, refresh on a nested route, update prompt, installable manifest, and offline navigation when practical.
- For Docker or release changes, verify the package and deployment artifact separately from the local Vite build.
