# ROC Platform frontend

React + TypeScript frontend for the ROC robot operations workspace.

## Requirements

- Node.js 20
- pnpm 10.15.1 (declared in `package.json`)
- ROC backend reachable at `http://localhost:8080` or through `VITE_DEV_PROXY_TARGET`

## Development

```bash
pnpm install --frozen-lockfile
pnpm dev
```

The development server listens on port 3000. To proxy API and WebSocket requests to another backend:

```bash
VITE_DEV_PROXY_TARGET=http://127.0.0.1:18080 pnpm dev
```

## Quality checks

```bash
pnpm typecheck
pnpm lint
pnpm test
pnpm build
```

The production output directory is `build/`.

## Product structure

- `/` — public product introduction; authenticated users are directed to the workspace.
- `/login`, `/register` — authentication.
- `/projects` — project workspace entry.
- `/projects/:projectId/maps` — map resources and default-map selection.
- `/projects/:projectId/vehicles` — project-scoped vehicles.
- `/projects/:projectId/settings` — supported project settings.
- `/projects/:projectId/maps/:mapId/monitor` — map and vehicle monitoring workspace.
- `/profile` — account profile and password change.
- `/admin/users` — super-administrator user management.
- `/guide` — public device integration guide.
- `/protocols` — authenticated guide embedded in the application workspace.

Vehicle state uses authenticated project-scoped WebSocket subscriptions. Events are merged by telemetry version; reconnection uses exponential backoff and project-scoped REST polling remains the fallback.

## Device integration guide

`/guide` and `/protocols` render the same current interface reference in public and authenticated layouts. It documents:

- account JWT versus per-vehicle Device token authentication;
- JSON status, command, and pending-command endpoints;
- the ROC binary `STATUS_REPORT` frame and its current HTTP boundary;
- project-scoped WebSocket authentication, subscription, events, and heartbeat.

Do not place real credentials in examples. The backend's byte-level ROC definition is in [`../roc-backend/src/protocols/roc/README.md`](../roc-backend/src/protocols/roc/README.md).

See the [repository README](../README.md) for architecture, API details, deployment guidance, and current limitations. Local verification records, test-host scripts, and the development plan are intentionally not part of the published repository.
