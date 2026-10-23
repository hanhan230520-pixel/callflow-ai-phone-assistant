# Testing Guide

## 1. Test layers

| Layer | Command | Requires | Scope |
| --- | --- | --- | --- |
| Type check + production build | `npm run build` | Node.js >= 22.5 | TypeScript strict mode and Vite bundle |
| API integration | `NODE_ENV=test npm test` | Node.js >= 22.5 | Auth, RBAC, CSRF, appointments, tables, combos, walk-ins, calls, reports, data safeguards |
| UI smoke | `npm run test:smoke` | Microsoft Edge + a running server | Login, routing, appointment flow, simulated calls, responsive layouts, permissions |
| Screenshots | `npm run screenshots` | Microsoft Edge + a running server | Regenerates `docs/screenshots/` |

The API test suite creates a temporary SQLite database and a temporary HTTP port, then removes both when it finishes. It never touches `data/callflow-full.db`.

## 2. Build and API tests

```bash
npm ci
npm run build
NODE_ENV=test npm test
```

Expected result for the current code:

- Build: succeeds with a Vite chunk-size warning only.
- API tests: **26 pass / 0 fail**.

## 3. UI smoke test

The smoke script uses Playwright-core with Microsoft Edge and targets `http://127.0.0.1:8788` by default.

```bash
npm run build
npm start          # keep this terminal running

# in another terminal
npm run test:smoke
```

Expected result for the current code: **30 PASS / 0 FAIL**.

If Edge is installed in a non-standard location, set `BROWSER_PATH` before running the script. The smoke test writes temporary artifacts under the ignored `test-results/` directory.

## 4. Continuous integration

`.github/workflows/ci.yml` runs on pushes and pull requests:

- `npm ci`
- `npm run build`
- `NODE_ENV=test npm test`

UI smoke and screenshots are **not** part of CI because they require Microsoft Edge and a running local server. This is intentional; do not present CI as covering browser tests.

## 5. Current verification record

| Check | Result | Notes |
| --- | --- | --- |
| Build | Pass | 2451 modules; CSS 83.22 kB / gzip 15.43 kB; JS 535.63 kB / gzip 149.60 kB |
| API integration | 26 pass / 0 fail | Node Test Runner |
| UI smoke | 30 PASS / 0 FAIL | Local Microsoft Edge |
| Targeted browser regression | 13 / 13 | Local Microsoft Edge |
| Screenshots | 12 | Manually reviewed; fictional data |
| Dependency audit | 0 vulnerabilities | `npm audit --omit=dev --registry=https://registry.npmjs.org` |

These are local execution records, not a permanent guarantee. Re-run the commands after changing dependencies or business logic.

## 6. What is not covered

- Real telephony, recording, streaming STT, LLM, Feishu and webhook event delivery (not implemented).
- Appointment deletion and walk-in seated/cancelled paths in automated regression.
- Cross-browser compatibility beyond the local Edge smoke run.
- Load, concurrency, high availability and disaster-recovery testing.
