# apiplatform-fetch-builder
[![GitHub stars](https://img.shields.io/github/stars/leo7418/apiplatform-fetch-builder.svg?style=social&label=Star)](https://github.com/leo7418/apiplatform-fetch-builder)
[![GitHub issues](https://img.shields.io/github/issues/leo7418/apiplatform-fetch-builder.svg)](https://github.com/leo7418/apiplatform-fetch-builder/issues)
[![npm downloads](https://img.shields.io/npm/dm/apiplatform-fetch-builder.svg)](https://www.npmjs.com/package/apiplatform-fetch-builder)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](./LICENSE)

**apiplatform-fetch-builder** is a TypeScript library for interacting with [ApiPlatform](https://api-platform.com/) / Hydra APIs. It provides a builder-pattern interface for typed `fetch` requests with pagination, sorting, filtering, and property selection — plus an optional `entityServiceBuilder` for full CRUD with typed IRIs.

## Features

- **Typed requests** — full TypeScript generics on responses
- **Builder pattern** — chainable `.withOptions()`, `.withHeaders()`
- **Hydra & ApiPlatform compatible** — pagination, sorting, filtering, property selection
- **`entityServiceBuilder`** — typed CRUD: `create`, `get`, `getAll`, `getAllPages`, `update`, `replace`, `upsert`, `delete`
- **Security** — token validation, safe key assertions on filter/sort ids
- **No bundler required** — pure ESM

## Installation

```bash
pnpm add apiplatform-fetch-builder
```

## Quick start

```ts
import fetchBuilder from "apiplatform-fetch-builder";

const api = fetchBuilder("https://api.example.com", {
  getToken: () => localStorage.getItem("token"),
  onUnauthorized: () => router.push("/login"),
});

// GET
const result = await api.get<{ name: string }>("/users/1").fetch();
if (result.success) {
  console.log(result.data.name);
}

// GET with options
const list = await api
  .get<Collection<User>>("/users")
  .withOptions({
    pagination: true,
    pageIndex: 0,
    pageSize: 20,
    sortBy: [{ id: "name", desc: false }],
    filters: [{ id: "status", value: "active" }],
    properties: ["name", "email"],
  })
  .fetch();

// POST
const created = await api.post<User, UserBody>("/users").fetch({ name: "Alice" });

// PATCH
const updated = await api.patch<User, Partial<UserBody>>("/users/1").fetch({ name: "Bob" });

// PUT
const replaced = await api.put<User, UserBody>("/users/1").fetch({ name: "Carol" });

// DELETE
const deleted = await api.delete("/users/1").fetch();

// Custom headers (chainable)
const result2 = await api
  .get<User>("/users/1")
  .withHeaders({ "X-Tenant": "acme" })
  .fetch();

// withHeaders after withOptions
const result3 = await api
  .get<Collection<User>>("/users")
  .withOptions({ pagination: false })
  .withHeaders({ "X-Tenant": "acme" })
  .fetch();

// Pre-configure body with withBody (POST/PATCH/PUT)
const builder = api.post<User, UserBody>("/users").withBody({ name: "Alice" });
const created2 = await builder.fetch(); // no body argument needed

// Cancel a request with AbortSignal
const controller = new AbortController();
const result4 = await api.get<User>("/users/1").fetch({ signal: controller.signal });
controller.abort(); // cancels in-flight request

// Clone a fetcher with config overrides
const tenantApi = api.clone({ getToken: () => getTenantToken() });
```

## `entityServiceBuilder`

Higher-level CRUD abstraction over `fetchBuilder` for a specific resource path.

```ts
import { entityServiceBuilder } from "apiplatform-fetch-builder";
import type { Iri } from "apiplatform-fetch-builder";

type UserIri = Iri<"users">;
type UserBody = { name: string; email: string };
type User = UserBody & { createdAt: string };

const userService = entityServiceBuilder<UserIri, UserBody, User>(
  fetchBuilder("https://api.example.com", { getToken }),
  "/users"
);

// Create
await userService.create({ name: "Alice", email: "alice@example.com" });

// Get by id or IRI
const user = await userService.get(1);
const user2 = await userService.get("/users/1");

// Get with property selection
const partial = await userService.get(1, { properties: ["name"] });

// Get collection
const all = await userService.getAll();
const filtered = await userService.getAll({
  pagination: true,
  pageIndex: 0,
  pageSize: 10,
  sortBy: [{ id: "name", desc: false }],
});

// Get all pages (auto-pagination)
const everything = await userService.getAllPages();

// With filters
const active = await userService.getAllPages({ filters: [{ id: "status", value: "active" }] });

// With progress callback — return false to stop early
const partial2 = await userService.getAllPages(({ fetchedItems, totalItems, progressPercent }) => {
  console.log(`${progressPercent}% — ${fetchedItems}/${totalItems}`);
  if (fetchedItems >= 500) return false; // stop after 500 items
});

// With both getOptions and onProgress
const result = await userService.getAllPages(
  { pageSize: 50, sortBy: [{ id: "name", desc: false }] },
  ({ progressPercent }) => console.log(`${progressPercent}%`),
);

// Update (PATCH) — by id, IRI, or body with @id / id
await userService.update(1, { name: "Bob" });
await userService.update("/users/1", { name: "Bob" });
await userService.update({ "@id": "/users/1", name: "Bob" });

// Replace (PUT) — same pattern
await userService.replace(1, { name: "Carol", email: "carol@example.com" });
await userService.replace("/users/1", { name: "Carol", email: "carol@example.com" });

// Upsert — create if no id, update if @id or id present
await userService.upsert({ name: "Dave", email: "dave@example.com" }); // → POST
await userService.upsert({ "@id": "/users/1", name: "Dave" });          // → PATCH

// Delete
await userService.delete(1);
await userService.delete("/users/1");
```

### `entityServiceBuilder` initialization

Accepts three forms:

```ts
// From a fetcher instance (recommended — share across services)
entityServiceBuilder(fetchBuilder("https://api.example.com", config), "/users")

// From an entrypoint string
entityServiceBuilder("https://api.example.com", "/users")

// From an entrypoint + config object
entityServiceBuilder({ entrypoint: "https://api.example.com", config }, "/users")
```

## API reference

### `fetchBuilder(entrypoint, config?)`

| Parameter | Type | Description |
|-----------|------|-------------|
| `entrypoint` | `string` | Base URL of the API |
| `config.getToken` | `() => string \| null \| Promise<string \| null>` | Returns the Bearer token |
| `config.refreshToken` | `() => string \| null \| Promise<string \| null>` | Called on 401 — retries the request with the new token before `onUnauthorized` |
| `config.onUnauthorized` | `() => void \| Promise<void>` | Called on 401 after retry (or immediately if no `refreshToken`) |

Returns `{ get, post, patch, put, delete, clone }`.

### `clone(overrides?)`

Returns a new fetcher with the same `entrypoint` and config merged with `overrides`. Useful for per-tenant or per-user token overrides without recreating the full builder.

```ts
const tenantApi = api.clone({ getToken: () => getTenantToken() });
```

---

### `get(url)`

| Method | Description |
|--------|-------------|
| `.fetch(options?)` | Performs the GET request |
| `.withOptions(getOptions)` | Adds pagination, sorting, filtering, property selection |
| `.withHeaders(headers)` | Merges custom headers (chainable, also available after `.withOptions()`) |

### `post(url)`, `patch(url)`, `put(url)`

| Method | Description |
|--------|-------------|
| `.fetch(body, options?)` | Performs the request with body |
| `.withBody(body)` | Pre-configures the body — returns a builder where `.fetch()` takes no body argument |
| `.withHeaders(headers)` | Merges custom headers (chainable after `.withBody()`) |

### `AbortSignal`

All `.fetch()` methods accept a standard `RequestInit` `signal` option:

```ts
const controller = new AbortController();
const result = await api.get<User>("/users/1").fetch({ signal: controller.signal });
controller.abort();
```

### `delete(url)`

| Method | Description |
|--------|-------------|
| `.fetch(options?)` | Performs the DELETE request, returns `null` data |
| `.withHeaders(headers)` | Merges custom headers |

---

### `GetOptions`

| Field | Type | Description |
|-------|------|-------------|
| `pagination` | `boolean` | Default `true` |
| `pageIndex` | `number` | 0-based page index |
| `pageSize` | `number` | Items per page, default `10` |
| `sortBy` | `{ id: PropertyPath, desc: boolean }[]` | Sort fields (type-safe) |
| `filters` | `{ id: PropertyPath, value: ... }[]` | Filter fields (type-safe) |
| `properties` | `PropertyPath[]` | Partial response selection |

---

### `entityServiceBuilder` methods

| Method | Description |
|--------|-------------|
| `create(body)` | POST — creates a new resource |
| `get(idOrIri, options?)` | GET — fetches a single resource |
| `getAll(options?)` | GET — fetches the collection (one page) |
| `getAllPages(onProgress?)` | GET — fetches all pages, concatenates members. `onProgress` can return `false` to stop early |
| `getAllPages(getOptions, onProgress?)` | Same with filters/sorting/pageSize |
| `update(idOrIri, body)` or `update(bodyWithId)` | PATCH |
| `replace(idOrIri, body)` or `replace(bodyWithId)` | PUT |
| `upsert(body)` | POST if no id, PATCH if `@id` or `id` present |
| `delete(idOrIri)` | DELETE |

## License

[MIT](./LICENSE)
