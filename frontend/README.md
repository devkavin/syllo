# Syllo web

The production web client is a Vite + React application. It uses same-origin `/api`
requests by default, so production builds contain no backend URL or application
secrets.

## Local development

```powershell
corepack yarn install
corepack yarn dev
```

The Vite server proxies `/api` to `http://localhost:8000`. Override that target with
`VITE_API_PROXY_TARGET`, or set a complete browser-visible base such as
`VITE_API_BASE_URL=http://localhost:8000/api`.

## Checks

```powershell
corepack yarn test:run
corepack yarn lint
corepack yarn build
```

The production output is written to `dist/`. Secondary screens, billing, admin,
search, and the study companion are emitted as lazy-loaded chunks.
