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

See [`../plan.md`](../plan.md) for the implementation plan and [`../docs/frontend/verification.md`](../docs/frontend/verification.md) for verified results and remaining release blockers.
