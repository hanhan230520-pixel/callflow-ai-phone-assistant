# Contributing to CallFlow

Thanks for taking a look at CallFlow. This is an independent portfolio project, and small, focused contributions are welcome.

## Before you start

- Read `README.md` and `docs/ARCHITECTURE.md` to understand the project boundaries.
- Keep the project honest: telephony, STT, AI and Feishu are currently **mock adapters**. Do not describe them as real integrations.
- The project is licensed under the [MIT License](LICENSE). Contributions are accepted under the same license.
- For security issues, do not open a public Issue with exploit details. Contact the maintainer privately through the repository's security contact once it is configured.

## Development setup

Requirements: Node.js >= 22.5.0 and npm 10+.

```bash
npm ci
npm run dev
```

- API: `http://127.0.0.1:8788`
- Web: `http://127.0.0.1:5174`

The first run creates a local SQLite database with fictional demo data.

## Required checks

Before opening a pull request, run:

```bash
npm run build
NODE_ENV=test npm test
```

If your change affects the UI and you have Microsoft Edge installed, also run:

```bash
npm run test:smoke
```

Do not weaken business rules, delete assertions, or mark failing tests as passing to make CI green. If a test needs to change, explain why in the pull request.

## Code guidelines

- TypeScript strict mode is enabled; avoid `any` unless there is a clear boundary reason.
- Keep business rules in `server/domain/`, HTTP validation and responses in `server/routes/`, and external-service boundaries in `server/adapters/`.
- Use parameterized SQL; never concatenate user input into SQL.
- Validate request bodies with Zod schemas in `server/lib/schemas.js`.
- Keep simulated results explicitly labelled with `simulated: true` and UI notices.
- Do not add a dependency without checking its license and adding it to `THIRD_PARTY_NOTICES.md`.
- Do not commit `.env`, databases, logs, backups, `dist/`, `node_modules/` or real customer data.

## Pull requests

1. Open an Issue for non-trivial changes so the scope can be agreed first.
2. Keep the change focused; avoid unrelated refactors or visual redesigns.
3. Include the tests or manual verification you ran.
4. Describe any change to the real/mock boundary, API shape, database schema or permissions.
5. By submitting a contribution, you agree that it may be distributed under the project's MIT License.

## Documentation

If behavior changes, update the relevant document:

- `README.md` / `README.en.md`
- `docs/FEATURE_MATRIX.md`
- `docs/DEVELOPMENT.md`
- `docs/SECURITY.md`
- `docs/TESTING.md`

Keep test counts and verification claims consistent with the actual commands and results.
