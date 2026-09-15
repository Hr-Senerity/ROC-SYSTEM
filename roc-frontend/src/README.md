# Frontend source layout

The source tree is organized by responsibility rather than by exported design screens.

```text
src/
├── app/
│   ├── auth/          session provider and route authentication state
│   └── layout/        global application and project shells
├── components/        routed pages and reusable visual components
├── features/
│   ├── maps/          map DTOs, coordinate transforms, and tests
│   ├── projects/      project DTOs and tests
│   └── vehicles/      vehicle DTOs and tests
├── shared/
│   ├── api/           URL configuration, request client, and API errors
│   ├── styles/        Tailwind entry point and design tokens
│   └── ui/            shared loading, error, empty, header, and status states
├── App.tsx            route definitions and access boundaries
└── main.tsx           React entry point
```

## Conventions

- Routed authenticated pages render inside `AppShell`; project pages additionally use `ProjectLayout`.
- API calls go through `shared/api/client.ts`. Do not construct environment-specific API URLs inside components.
- Parse server payloads through feature model adapters before storing them in typed state.
- Loading, error, empty, and forbidden states must remain distinct.
- Project and map ownership is enforced by the backend; hiding a frontend button is not authorization.
- Map images and SVG overlays must share the same transform. Coordinate math belongs in `features/maps/coordinates.ts` and requires deterministic tests.
- Filters and selected resource identifiers that must survive refresh belong in URL search parameters.
- Use Radix-based dialogs for modal and destructive confirmation flows; do not add clickable `div` elements or placeholder links.
- Do not advertise controls, password recovery, notification settings, or protocol capabilities that have no backend implementation.

Run `pnpm typecheck`, `pnpm lint`, `pnpm test`, and `pnpm build` before handing off changes.
