# repo-test

Core platform API — authentication, caching, rate limiting, and user management.

## Structure

```
src/
  api/          # Route handlers (v2)
  middleware/   # Auth, rate limiting, caching
  config/       # Environment and tier configuration
  services/     # Business logic and integrations
```

## Getting started

```bash
npm install
cp .env.example .env
npm run dev
```

Requires Redis and PostgreSQL. See [docs/config.md](./docs/config.md) for all environment variables.

## API

Base URL: `https://api.example.com/v2`

All responses use the v2 envelope:

```json
{
  "data": { ... },
  "meta": { "apiVersion": "v2" },
  "errors": []
}
```

See the developer portal for full docs and an interactive explorer.

## Contributing

All PRs require one approval. Branch naming: `{ticket-id}_{short-description}`.
