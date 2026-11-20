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
- **Security** — requests never leave the entrypoint origin, safe key assertions on filter/sort ids
- **No bundler required** — pure ESM

## Installation

```bash
pnpm add apiplatform-fetch-builder
```

## Quick start

```ts
import fetchBuilder from "apiplatform-fetch-builder";

const api = fetchBuilder("https://api.example.com", {
  headers: () => {
    const token = localStorage.getItem("token");
    return {
      ...(token && { Authorization: `Bearer ${token}` }),
      "Accept-Language": navigator.language,
    };
  },
  refreshAuth: async (auth) => {
    const { token } = await auth
      .post<{ token: string }, { refresh_token: string | null }>("/token/refresh")
      .fetch({ refresh_token: localStorage.getItem("refreshToken") });
    localStorage.setItem("token", token);
  },
  onUnauthorized: () => router.push("/login"),
});

// GET
const user = await api.get<{ name: string }>("/users/1").fetch();
console.log(user.name);

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
const tenantApi = api.clone({ headers: { "X-Tenant": "acme" } });
```

## Error handling

Every `.fetch()` resolves with the body of the response. A response that is not OK rejects with an `ApiError` carrying the HTTP `status` and the `body` sent by the API (parsed JSON, or the raw text when it is not JSON).

```ts
import { ApiError } from "apiplatform-fetch-builder";

try {
  await api.get<User>("/users/1").fetch();
} catch (error) {
  if (error instanceof ApiError && error.status === 404) {
    console.log(error.body);
  }
}
```

`isHydraError` narrows the body to the error format of API Platform, without a cast. An error that Symfony renders itself (unknown route, 405, a 401 or 403 from the firewall) only has this format when `handle_symfony_errors` is enabled, and a 401 can have an empty body:

```ts
import { ApiError, isHydraError } from "apiplatform-fetch-builder";

if (error instanceof ApiError && isHydraError(error.body)) {
  error.body.violations?.forEach(({ propertyPath, message }) => {
    form.setError(propertyPath, message);
  });
}
```

A `POST`, `PATCH`, `PUT` or `DELETE` response without a body (204) resolves with `null`. An OK response that is not JSON, or a `GET` response without a body, rejects with an `ApiError` too: read it with [`fetchRaw()`](#file-downloads). A URL on another origin than the entrypoint is rejected with a `TypeError`, so the token never leaves the API. When the API writes its IRIs with another origin than the one you call (behind a proxy, for instance), list it in `originAliases`: these URLs are then sent to the entrypoint.

## File downloads

`fetchRaw()` sends the request like `fetch()`, with the same headers, authentication refresh and errors, but resolves with the native `Response` instead of parsing JSON. Use it for a file or any response that is not JSON, and set `Accept` to the format the endpoint declares, or to `*/*`:

```ts
const response = await api
  .get("/users")
  .withOptions({ filters: [{ id: "status", value: "active" }] })
  .withHeaders({ Accept: "text/csv" })
  .fetchRaw();

const file = await response.blob();
const disposition = response.headers.get("Content-Disposition");
```

A file served outside the path of the entrypoint, such as `/media/1.png` next to an API under `/api`, is requested with its full URL: the entrypoint path is not prepended to it.

## Scope

The library types and sends JSON-LD requests. It does not retry, time out, cache or deduplicate them: leave that to the caller, for instance TanStack Query, and pass its `signal` to `fetch({ signal })`. A response that is not JSON, such as a file download, is read with `fetchRaw()`.

## `hydra:` prefix

The types follow the API Platform 4 default, where collections and errors have no `hydra:` prefix (`member`, `totalItems`, `view`). When the API keeps the prefix (API Platform 3, or `hydra_prefix: true`), declare it once in the project:

```ts
declare module "apiplatform-fetch-builder" {
  interface Register {
    hydraPrefix: true;
  }
}
```

`Collection`, `PartialCollection` and `HydraError` then expose `hydra:member`, `hydra:totalItems`, `hydra:view`, `hydra:title`, `hydra:description`. `getAllPages` reads both formats at runtime. See [examples/hydra-prefix](./examples/hydra-prefix).

## `entityServiceBuilder`

Higher-level CRUD abstraction over `fetchBuilder` for a specific resource path.

```ts
import { entityServiceBuilder } from "apiplatform-fetch-builder";
import type { Iri } from "apiplatform-fetch-builder";

type UserIri = Iri<"users">;
type UserBody = { name: string; email: string };
type User = UserBody & { createdAt: string };

const userService = entityServiceBuilder<UserIri, UserBody, User>(
  fetchBuilder("https://api.example.com", { headers }),
  "/users"
);

// Create
await userService.create({ name: "Alice", email: "alice@example.com" });

// Get by id or IRI
const user = await userService.get(1);
const user2 = await userService.get("/users/1");

// String identifiers (UUID, ULID, slug): type the IRI with Iri<"users", string>
// const user3 = await userService.get("f47ac10b-58cc-4372-a567-0e02b2c3d479");

// IRIs returned as full URLs, with or without the protocol (url_generation_strategy: ABS_URL or NET_PATH): type them with AbsoluteIri<"users">
// const user4 = await userService.get("https://api.example.com/users/1");

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
| `entrypoint` | `string` | Base URL of the API. Its path is prepended to every path that does not already start with it, so `/users` and the IRI `/api/users/1` both work with `https://api.example.com/api` |
| `config.originAliases` | `string[]` | Other origins the API uses in its IRIs. A request to one of them is sent to the entrypoint instead |
| `config.headers` | `HeadersInit \| (() => HeadersInit \| Promise<HeadersInit>)` | Headers sent with every request (authentication, language…). A function is called before each request. `withHeaders` and `fetch({ headers })` override them |
| `config.refreshAuth` | `(fetcher) => void \| Promise<void>` | Called on 401 — the request is then retried once with fresh `headers`. It receives a fetcher for the same API that has neither the `headers` nor these hooks: call the refresh endpoint with it, never with the main fetcher, whose request would wait for the refresh it is part of. Concurrent 401 responses of a fetcher and its clones share a single call, so one fetcher stands for one identity: on a server, build one per request. If it rejects, the request is not retried and the reason is the `cause` of the `ApiError` |
| `config.onUnauthorized` | `() => void \| Promise<void>` | Called on a 401 that remains after the retry, when the API refuses the refresh (`refreshAuth` rejects with a 4xx `ApiError`), or immediately if there is no `refreshAuth`. A refresh that fails for another reason, such as a network error, does not call it |
| `config.*` | `RequestInit` | Any other `fetch` option (`credentials`, `cache`, `mode`…) applies to every request; `fetch(options)` overrides it. |

Returns a `Fetcher`: `{ get, post, patch, put, delete, clone }`.

### `clone(overrides?)`

Returns a new fetcher with the same `entrypoint` and config merged with `overrides`. An overridden key replaces the original one, except `headers`: the ones of the clone are added to the ones of the original and win on the same name.

```ts
const tenantApi = api.clone({ headers: { "X-Tenant": "acme" } });
```

---

### `get(url)`

| Method | Description |
|--------|-------------|
| `.fetch(options?)` | Performs the GET request |
| `.fetchRaw(options?)` | Same request, resolves with the native `Response` (file downloads) |
| `.withOptions(getOptions)` | Adds pagination, sorting, filtering, property selection |
| `.withHeaders(headers)` | Merges custom headers (chainable, also available after `.withOptions()`) |

### `post(url)`, `patch(url)`, `put(url)`

| Method | Description |
|--------|-------------|
| `.fetch(body, options?)` | Performs the request with body |
| `.fetchRaw(body, options?)` | Same request, resolves with the native `Response` |
| `.withBody(body)` | Pre-configures the body — returns a builder where `.fetch()` takes no body argument |
| `.withHeaders(headers)` | Merges custom headers (chainable after `.withBody()`) |

The body is sent as JSON. A `FormData`, `Blob`, `URLSearchParams`, binary buffer or `ReadableStream` is sent as it is. A stream cannot be sent twice: after a 401, the authentication is refreshed but the request is not retried and rejects with the 401.

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
| `.fetch(options?)` | Performs the DELETE request, resolves with `null` |
| `.withHeaders(headers)` | Merges custom headers |

---

### `GetOptions`

| Field | Type | Description |
|-------|------|-------------|
| `pagination` | `boolean` | Enables or disables pagination. Ignored unless the API allows it (`pagination_client_enabled`) |
| `pageIndex` | `number` | 0-based page index |
| `pageSize` | `number` | Items per page. Ignored unless the API allows it (`pagination_client_items_per_page`) |
| `sortBy` | `{ id: PropertyPath, desc: boolean }[]` | Sort fields (type-safe) |
| `filters` | `{ id: PropertyPath \| string, value: ... }[]` | Filters: property paths are suggested, any other filter name (`exists`, a custom one) is accepted. A date goes in a record, as the date filter of API Platform expects: `{ after: date }`, `{ before: date }`; it is sent as an ISO string |
| `properties` | `PropertyPath[]` | Partial response selection |

Only the options that are set are sent; the API defaults apply to the others.

Type a collection with `Collection<T, I>`, or with `PartialCollection<T, I>` when the resource uses partial pagination, which has no `totalItems`. With `entityServiceBuilder`, pass `"partial"` as the fourth type argument: `entityServiceBuilder<LogIri, LogBody, Log, "partial">(api, "/logs")`.

`properties` narrows the type of the response, and the way a relation is declared tells how the API serializes it:

| Declaration | Meaning | Type once selected |
|-------------|---------|--------------------|
| `company: CompanyIri` | Always an IRI | `CompanyIri` |
| `company: Company` | Always embedded, by the serialization groups of the API | `Company` with `company`, the selected properties with `company.name` |
| `company: Company \| CompanyIri` | An IRI, embedded only when one of its properties is selected | `CompanyIri` with `company`, the embedded item with `company.name` |

A route that serializes a resource in another way is typed with its own model. Without `properties`, the response keeps the type it was given. API Platform leaves out a property whose value is `null`: declare such a property as optional (`company?: Company | CompanyIri`).

---

### `entityServiceBuilder` methods

| Method | Description |
|--------|-------------|
| `create(body)` | POST — creates a new resource. The body is sent without the JSON-LD keys; an `id` is kept, for identifiers generated by the client |
| `get(idOrIri, options?)` | GET — fetches a single resource |
| `getAll(options?)` | GET — fetches the collection (one page) |
| `getAllPages(onProgress?)` | GET — fetches all pages, concatenates members. Follows the `next` link of each page, so page, partial and cursor pagination all work. `onProgress` can return `false` to stop early, before any item is read when it does so on page 0. Pages of 100 items are requested unless `pageSize` is given; a resource that refuses the parameter is read with its own page size |
| `getAllPages(getOptions, onProgress?)` | Same with filters/sorting/pageSize |
| `update(idOrIri, body)` or `update(bodyWithId)` | PATCH — the body is sent without `id` and the JSON-LD keys (`@id`, `@type`, `@context`). A relation is sent as it is given: API Platform expects its IRI, unless the resource accepts nested writes |
| `replace(idOrIri, body)` or `replace(bodyWithId)` | PUT — same rule for the body. API Platform 4 and later do not expose `PUT` by default: the resource has to declare the operation |
| `upsert(body)` | POST if there is no id (absent, `null` or empty), PATCH if `@id` or `id` is present |
| `delete(idOrIri)` | DELETE |

An identifier is URL-encoded into the path of the resource; an IRI is requested as it is.

## Recipes

### Typing a custom search endpoint

`withOptions` narrows the response of a `GET`. For an endpoint that takes `properties` another way, such as a `POST /search` reading them from the body, `PropertyPath` and `PropertyValue` give the same narrowing:

```ts
import type { PropertyPath, PropertyValue } from "apiplatform-fetch-builder";

const search =
  <Out extends object>(url: string) =>
  <P extends PropertyPath<Out>[]>(body: { properties: P }) =>
    api.post<PropertyValue<Out, P[number]>, { properties: P }>(url).fetch(body);

const users = await search<Collection<User>>("/users/search")({
  properties: ["name"],
});

users.member[0].name; // string
users.member[0].email; // compile error: not selected
```

## License

[MIT](./LICENSE)
