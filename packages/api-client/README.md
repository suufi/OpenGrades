# @opengrades/api-client

Shared HTTP client, query keys, and TanStack Query option factories used by the OpenGrades web app and mobile app.

## Web (same repo)

This package is a Yarn workspace. From the repo root:

```bash
yarn install
yarn workspace @opengrades/api-client build
```

The Next.js app depends on `@opengrades/api-client` via `workspaces`.

## Mobile (separate repo)

Install a tagged release from GitHub (no local path dependencies):

```bash
npm install @opengrades/api-client@git+https://github.com/suufi/OpenGrades.git#v0.1.0:packages/api-client
```

Or, after publishing to npm:

```bash
npm install @opengrades/api-client
```

## Publishing

```bash
cd packages/api-client
npm run build
npm publish --access public
```

Bump the version in `package.json` and tag the OpenGrades repo (`v0.1.0`) when releasing for mobile.
