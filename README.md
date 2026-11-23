# apiplatform-fetch-builder

[![npm version](https://img.shields.io/npm/v/apiplatform-fetch-builder.svg)](https://www.npmjs.com/package/apiplatform-fetch-builder)
[![Test](https://github.com/leo7418/apiplatform-fetch-builder/actions/workflows/test.yml/badge.svg?branch=main)](https://github.com/leo7418/apiplatform-fetch-builder/actions/workflows/test.yml)
[![npm downloads](https://img.shields.io/npm/dm/apiplatform-fetch-builder.svg)](https://www.npmjs.com/package/apiplatform-fetch-builder)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](./LICENSE)
[![GitHub issues](https://img.shields.io/github/issues/leo7418/apiplatform-fetch-builder.svg)](https://github.com/leo7418/apiplatform-fetch-builder/issues)
[![GitHub stars](https://img.shields.io/github/stars/leo7418/apiplatform-fetch-builder.svg?style=social&label=Star)](https://github.com/leo7418/apiplatform-fetch-builder)

**apiplatform-fetch-builder** is a TypeScript client for [API Platform](https://api-platform.com/) / Hydra APIs. It provides a builder-pattern interface for typed `fetch` requests with pagination, sorting, filtering, and property selection — plus an optional `entityServiceBuilder` for full CRUD with typed IRIs.

## Features

- **Typed requests** — the type of the response follows the request: `properties` narrows it to what was selected
- **Builder pattern** — chainable `.withQuery()`, `.withHeaders()`, `.withBody()`
- **API Platform conventions** — pagination, sorting, filtering, property selection, with or without the `hydra:` prefix
- **`entityServiceBuilder`** — typed CRUD for one resource: `create`, `get`, `getAll`, `getAllPages`, `update`, `replace`, `upsert`, `delete`, with the body of the writes deduced from the model
- **Authentication** — headers resolved before each request, and one shared refresh when the API answers 401
- **Security** — a URL on another origin is refused and a redirect is not followed, so the headers never leave the API; safe key assertions on filter/sort ids
- **No dependency, no bundler required** — pure ESM on top of the native `fetch`

## Table of contents

- [Scope](#scope)
- [Requirements](#requirements)
- [Installation](#installation)
- [Quick start](#quick-start)
- [`fetchBuilder`](#fetchbuilder)
- [Error handling](#error-handling)
- [File downloads](#file-downloads)
- [`hydra:` prefix](#hydra-prefix)
- [`entityServiceBuilder`](#entityservicebuilder)
  - [Model of a resource](#model-of-a-resource)
  - [`entityServiceBuilder` initialization](#entityservicebuilder-initialization)
- [API reference](#api-reference)
- [Recipes](#recipes)
- [Contributing](#contributing)
- [License](#license)

## Scope

The library types and sends JSON-LD requests. It does not retry, time out, cache or deduplicate them: leave that to the caller, for instance TanStack Query, and pass its `signal` to `fetch({ signal })`. A response that is not JSON, such as a file download, is read with `fetchRaw()`.

## Requirements

- A runtime with the native `fetch`: Node.js 18 or later, or a browser
- ES modules: the package has no CommonJS build
- TypeScript 5.0 or later with `strict`, or at least `strictNullChecks`, which the types of the bodies rely on
- API Platform 3.4, 4.4 or 5.0, the versions the library is verified against

## Installation

```bash
npm install apiplatform-fetch-builder
# or
pnpm add apiplatform-fetch-builder
# or
yarn add apiplatform-fetch-builder
```

## Quick start

```ts
import fetchBuilder, { entityServiceBuilder } from "apiplatform-fetch-builder";
import type { Collection, Iri } from "apiplatform-fetch-builder";

type User = { readonly id: number; name: string; email: string };

const api = fetchBuilder("https://api.example.com");

// One typed request
const page = await api
  .get<Collection<User>>("/users")
  .withQuery({ pageSize: 20, sortBy: [{ id: "name", desc: false }], properties: ["name"] })
  .fetch();
console.log(page.totalItems, page.member.map((user) => user.name)); // `email` was not selected: it is not in the type

// A CRUD service for one resource
const users = entityServiceBuilder<Iri<"users">, User>(api, "/users");
const user = await users.get(1);
await users.update(user["@id"], { name: "Bob" });
```

The sections below detail both layers, and [examples/](./examples) holds complete programs.

## `fetchBuilder`

The low-level client sends one typed request at a time. Its configuration carries what every request needs, such as the authentication:

```ts
import fetchBuilder from "apiplatform-fetch-builder";
import type { Collection, ReplaceBody, WriteBody } from "apiplatform-fetch-builder";

type User = { name: string; email: string };

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

// GET with a query
const list = await api
  .get<Collection<User>>("/users")
  .withQuery({
    pagination: true,
    pageIndex: 0,
    pageSize: 20,
    sortBy: [{ id: "name", desc: false }],
    filters: [{ id: "status", value: "active" }],
    properties: ["name", "email"],
  })
  .fetch();

// POST
const created = await api
  .post<User, WriteBody<User>>("/users")
  .fetch({ name: "Alice", email: "alice@example.com" });

// PATCH
const updated = await api.patch<User, WriteBody<User>>("/users/1").fetch({ name: "Bob" });

// PUT
const replaced = await api
  .put<User, ReplaceBody<User>>("/users/1")
  .fetch({ name: "Carol", email: "carol@example.com" });

// DELETE
const deleted = await api.delete("/users/1").fetch();

// Custom headers (chainable)
const result2 = await api
  .get<User>("/users/1")
  .withHeaders({ "X-Tenant": "acme" })
  .fetch();

// withHeaders after withQuery
const result3 = await api
  .get<Collection<User>>("/users")
  .withQuery({ pagination: false })
  .withHeaders({ "X-Tenant": "acme" })
  .fetch();

// Pre-configure body with withBody (POST/PATCH/PUT)
const builder = api
  .post<User, WriteBody<User>>("/users")
  .withBody({ name: "Alice", email: "alice@example.com" });
const created2 = await builder.fetch(); // no body argument needed

// Cancel a request with AbortSignal
const controller = new AbortController();
const pending = api.get<User>("/users/1").fetch({ signal: controller.signal });
controller.abort(); // cancels the request: `pending` rejects with an AbortError

// Clone a fetcher with config overrides
const tenantApi = api.clone({ headers: { "X-Tenant": "acme" } });
```

## Error handling

Every `.fetch()` resolves with the body of the response. A response that is not OK rejects with an `ApiError` carrying the HTTP `status`, the `body` sent by the API (parsed JSON, or the raw text when it is not JSON) and the `headers` of the response.

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

A `POST`, `PATCH`, `PUT` or `DELETE` response without a body (204) resolves with `null`. An OK response that is not JSON, or a `GET` response without a body, rejects with an `ApiError` too: read it with [`fetchRaw()`](#file-downloads). A URL on another origin than the entrypoint is rejected with a `TypeError`, and a redirect answered by the API is not followed but rejects with an `ApiError`, so the headers never leave the API. Outside a browser, its `headers` give the `Location`. Pass `redirect: "follow"` in the config or to `fetch()` to follow redirects, for instance when a path with a trailing slash is redirected. When the API writes its IRIs with another origin than the one you call (behind a proxy, for instance), list it in `originAliases`: these URLs are then sent to the entrypoint.

## File downloads

`fetchRaw()` sends the request like `fetch()`, with the same headers, authentication refresh and errors, but resolves with the native `Response` instead of parsing JSON. Use it for a file or any response that is not JSON, and set `Accept` to the format the endpoint declares, or to `*/*`:

```ts
const response = await api
  .get("/users")
  .withQuery({ filters: [{ id: "status", value: "active" }] })
  .withHeaders({ Accept: "text/csv" })
  .fetchRaw();

const file = await response.blob();
const disposition = response.headers.get("Content-Disposition"); // when the endpoint names its file
```

A file served outside the path of the entrypoint, such as `/media/1.png` next to an API under `/api`, is requested with its full URL: the entrypoint path is not prepended to it.

## `hydra:` prefix

The types follow the API Platform 4 default, where collections and errors have no `hydra:` prefix (`member`, `totalItems`, `view`). When the API keeps the prefix (API Platform 3, or `hydra_prefix: true`), declare it once in the project:

```ts
declare module "apiplatform-fetch-builder" {
  interface Register {
    hydraPrefix: true;
  }
}
```

Write it in a file that has an `import` or an `export` (in a declaration file, add `export {};`): alone in a file, the block would replace the types of the package instead of extending them.

`Collection`, `PartialCollection` and `HydraError` then expose `hydra:member`, `hydra:totalItems`, `hydra:view`, `hydra:title`, `hydra:description`. `getAllPages` reads both formats at runtime. See [examples/hydra-prefix](./examples/hydra-prefix).

## `entityServiceBuilder`

Higher-level CRUD abstraction over `fetchBuilder` for a specific resource path.

```ts
import fetchBuilder, { entityServiceBuilder } from "apiplatform-fetch-builder";
import type { Iri } from "apiplatform-fetch-builder";

type UserIri = Iri<"users">;
type User = {
  readonly id: number;
  name: string;
  email: string;
  readonly createdAt: string;
};

const userService = entityServiceBuilder<UserIri, User>(
  fetchBuilder("https://api.example.com"),
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
  return fetchedItems < 500; // stop after 500 items
});

// With both query and onProgress
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

### Model of a resource

A resource is described once, as `get()` returns it. The body of `create`, `update` and `upsert` is deduced from that model, and `WriteBody<User>` gives it to `fetchBuilder` (`api.post<User, WriteBody<User>>("/users")`):

| In the model | Read | Written |
|--------------|------|---------|
| `name: string` | A property that is always returned | Optional, does not accept `null` |
| `readonly createdAt: string` | A property the API computes or normalizes | Not part of the body: naming it is a compile error |
| `nickname?: string` or `nickname: string \| null` | A property that can be null | Optional, and accepts `null` |
| `company: Company \| CompanyIri` or `company: Embedded<Company, CompanyIri>` | A relation, as described under [`QueryOptions`](#queryoptions) | Its IRI, or the object |
| `address: { city: string }` | A nested object | The object, with every property optional and without its `readonly` properties |
| `company: Company` | A relation that is always embedded, declared without its IRI | Any IRI, or the object |

Every property of the body is optional: a model does not tell a property the API requires from one it fills with a default, so the API decides what is missing. A validation constraint answers with a `422` and its violations; without one, the answer depends on the API.

A relation is written as its IRI, and an item can be sent back as it was read, `userService.update({ ...user, name: "Bob" })`: the service sends every embedded resource, an object whose `@id` is a path or a URL, as that IRI. A nested object that is not a resource, whose `@id` is generated (`/.well-known/genid/…`), stays an object and loses its `@id` and `@type`. An object that carries a `@context` other than one of the API (`/contexts/…`), such as a JSON-LD document kept in a JSON column, is left as it is, with everything it contains. An object without `@id` is sent as it is, which API Platform takes only where nested documents are allowed and refuses otherwise, with a `400` or a `422` (`Nested documents for attribute "company" are not allowed. Use IRIs instead.`). To change a related resource through its relation, with its `@id` and its new values, use `fetchBuilder`, which sends a body as it is given.

A model does not tell a nested object from a relation declared without its IRI: both take any IRI at compile time, which the API ignores or refuses for a nested object, and an object that is not written in place is only checked on the properties it shares with the model, so the item of another resource is accepted. Declare the relation as `Company | CompanyIri` or `Embedded<Company, CompanyIri>` to have its IRI and its content checked.

Nothing else is changed before sending, apart from `id` and the JSON-LD keys of the body being removed: an item sent back still carries its `readonly` properties, which the API ignores unless it can write them. A nested object is merged by a `PATCH` when it is an embeddable and replaced as a whole when it is a JSON column.

`replace` takes `ReplaceBody<User>`, where every property that is not nullable is required: a standard `PUT` (`standard_put: true`) resets what the body leaves out, as well as the properties the API sets itself, such as a `createdAt` set in the constructor.

API Platform leaves out a property whose value is `null`, so `nickname?: string` is what it sends by default. With `skip_null_values: false` in the normalization context of the API, the property is always present and `nickname: string | null` is the exact type.

When the body cannot be deduced, for a property that is only written (a password), give it in the options of the service: `entityServiceBuilder<UserIri, User, { body: UserBody }>`. The same option requires a property at compile time: `{ body: WriteBody<User> & { email: string } }`. A given body stands for both deduced ones: `replace` takes it as it is, without the properties `ReplaceBody` would require.

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
| `entrypoint` | `string` | Base URL of the API. Its path is prepended to every path that does not already start with it, so `/users` and the IRI `/api/users/1` both work with `https://api.example.com/api`. In a browser, a relative URL such as `/api` is resolved against the page at the first request, once for the fetcher and its clones; elsewhere its requests reject |
| `config.originAliases` | `string[]` | Other origins the API uses in its IRIs. A request to one of them is sent to the entrypoint instead |
| `config.headers` | `HeadersInit \| (() => HeadersInit \| Promise<HeadersInit>)` | Headers sent with every request (authentication, language…). A function is called before each request, and again after a 401 when `refreshAuth` is set. `withHeaders` and `fetch({ headers })` override them |
| `config.refreshAuth` | `(fetcher) => void \| Promise<void>` | Called on 401 — the request is then retried with fresh `headers`. It receives a fetcher for the same API that has neither the `headers` nor these hooks: call the refresh endpoint with it, never with the main fetcher, whose request would wait for the refresh it is part of. Concurrent 401 responses share a single call when they come from the same fetcher, from its clones or from fetchers built with the same `config` object; when one fetcher serves several identities, the requests are grouped by their `Authorization` and `Cookie` headers. A 401 received after these credentials changed is retried without a new call. If it rejects, the request is not retried and the reason is the `cause` of the `ApiError` |
| `config.onUnauthorized` | `() => void \| Promise<void>` | Called on a 401 that remains after the retry, immediately if there is no `refreshAuth`, or once for the requests of a refresh that the API refuses: `refreshAuth` rejects with a 4xx `ApiError` other than 408 and 429, which a hook doing its own requests reports with `throw new ApiError(401, body)`. A refresh that fails for another reason, such as a network error, does not call it |
| `config.*` | `RequestInit` | Any other `fetch` option (`credentials`, `cache`, `mode`, `redirect`…) applies to every request; `fetch(options)` overrides it. |

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
| `.withQuery(query)` | Adds pagination, sorting, filtering, property selection |
| `.withHeaders(headers)` | Merges custom headers (chainable, also available after `.withQuery()`) |

### `post(url)`, `patch(url)`, `put(url)`

| Method | Description |
|--------|-------------|
| `.fetch(body, options?)` | Performs the request with body |
| `.fetchRaw(body, options?)` | Same request, resolves with the native `Response` |
| `.withBody(body)` | Pre-configures the body — returns a builder where `.fetch()` takes no body argument |
| `.withHeaders(headers)` | Merges custom headers (chainable after `.withBody()`) |

The body is sent as JSON. A `FormData`, `Blob`, `URLSearchParams`, binary buffer or `ReadableStream` is sent as it is. A stream cannot be sent twice: after a 401, the authentication is refreshed but the request is not retried and rejects with the 401. In a browser, prefer a `Blob` or a `File`: Chromium only sends a stream over HTTP/2, and Firefox and Safari do not send one at all.

### `delete(url)`

| Method | Description |
|--------|-------------|
| `.fetch(options?)` | Performs the DELETE request, resolves with `null` |
| `.fetchRaw(options?)` | Same request, resolves with the native `Response` |
| `.withHeaders(headers)` | Merges custom headers |

### `AbortSignal`

All `.fetch()` methods accept a standard `RequestInit` `signal` option:

```ts
const controller = new AbortController();
const pending = api.get<User>("/users/1").fetch({ signal: controller.signal });
controller.abort(); // `pending` rejects with an AbortError
```

---

### `QueryOptions`

| Field | Type | Description |
|-------|------|-------------|
| `pagination` | `boolean` | Enables or disables pagination. Ignored unless the API allows it (`pagination_client_enabled`); a resource with `strictQueryParameterValidation` answers 400 instead |
| `pageIndex` | `number` | 0-based page index |
| `pageSize` | `number` | Items per page. Ignored unless the API allows it (`pagination_client_items_per_page`); a resource with `strictQueryParameterValidation` answers 400 instead |
| `sortBy` | `{ id: PropertyPath, desc: boolean }[]` | Sort fields (type-safe) |
| `filters` | `{ id: PropertyPath \| string, value: ... }[]` | Filters: property paths are suggested, any other filter name (`exists`, a custom one) is accepted. An array is sent as one `name[]` parameter per value, so an empty array does not filter. A date goes in a record, as the date filter of API Platform expects: `{ after: date }`, `{ before: date }`; it is sent as an ISO string, and a bound that is `null` or `undefined` is left out |
| `properties` | `PropertyPath[]` | Partial response selection. Ignored by a resource that does not declare the property filter; a resource with `strictQueryParameterValidation` answers 400 instead |

Only the options that are set are sent; the API defaults apply to the others.

Type a collection with `Collection<T, I>`, or with `PartialCollection<T, I>` when the resource uses partial pagination, which has no `totalItems`. With `entityServiceBuilder`, the third type argument describes the resource: `{ pagination: "partial" }` types `getAll()` as a `PartialCollection`, and `{ output: false }` types `create`, `update`, `replace` and `upsert` as resolving with `null`, for a resource whose writes return no content.

```ts
const logs = entityServiceBuilder<LogIri, Log, { pagination: "partial" }>(api, "/logs");
```

`properties` narrows the type of the response, whether it is typed as an `Item`, a `Collection`, a plain object or an array of them, and the way a relation is declared tells how the API serializes it:

| Declaration | Meaning | Type once selected |
|-------------|---------|--------------------|
| `company: CompanyIri` | Always an IRI | `CompanyIri` |
| `company: Company` | Always embedded, by the serialization groups of the API | `Company` with `company`, the selected properties with `company.name` |
| `company: Company \| CompanyIri` | An IRI, embedded only when one of its properties is selected | `CompanyIri` with `company`, the embedded item with `company.name` |

`Item<T, I>` is a resource read on its own, with its `@context`; an embedded relation has none, and `Embedded<T, I>` declares it that way. A relation that leads back to a resource already being read, such as `company.employees` when it contains the user that was requested, comes as its IRI: it is typed as the embedded item or the IRI, when the response is typed as an `Item` or a `Collection`. Two cases are not covered by the types: a resource that refers to itself, such as a user who is their own manager, also comes as its IRI, and relations that serialization groups embed in both directions come as IRIs even without `properties`.

A route that serializes a resource in another way is typed with its own model. Without `properties`, the response keeps the type it was given. A property whose value is `null` is left out by default, see [Model of a resource](#model-of-a-resource); a nested object left with no property is written as an empty array.

---

### `entityServiceBuilder` methods

| Method | Description |
|--------|-------------|
| `create(body)` | POST — creates a new resource. The body is sent without the JSON-LD keys and with its embedded resources as IRIs; an `id` is kept, for identifiers generated by the client, unless it is the one of the `@id` the body carries, as in a copied item |
| `get(idOrIri, query?)` | GET — fetches a single resource |
| `getAll(query?)` | GET — fetches the collection (one page) |
| `getAllPages(onProgress?)` | GET — fetches all pages, concatenates members. Follows the `next` link of each page, so page, partial and cursor pagination all work. `onProgress` can return `false` to stop early, before any item is read when it does so on page 0. Pages of 100 items are requested unless `pageSize` is given; a resource that refuses the parameter is read with its own page size |
| `getAllPages(query, onProgress?)` | Same with filters/sorting/pageSize |
| `update(idOrIri, body)` or `update(bodyWithId)` | PATCH — the body is sent without `id` and the JSON-LD keys (`@id`, `@type`, `@context`), and with its embedded resources as IRIs. The body follows the [model of the resource](#model-of-a-resource): every property is optional, a relation is its IRI, and naming a `readonly` property is a compile error |
| `replace(idOrIri, body)` or `replace(bodyWithId)` | PUT — same rule for the body, except that every property that is not nullable is required, since a standard `PUT` resets what is left out. API Platform 4 and later do not expose `PUT` by default: the resource has to declare the operation |
| `upsert(body)` | POST if there is no id (absent, `null` or empty), PATCH if `@id` or `id` is present |
| `delete(idOrIri)` | DELETE |

An identifier is URL-encoded into the path of the resource; an IRI is requested as it is.

## Recipes

### Typing a custom search endpoint

`withQuery` narrows the response of a `GET`. For an endpoint that takes `properties` another way, such as a `POST /search` reading them from the body, `PropertyPath` and `PropertyValue` give the same narrowing:

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

### Wrapping a service in generic code

Inside a function that is generic over the model, the bodies deduced from it are not resolved yet, so a `WriteBody<T>` cannot be passed to `update`, `replace` or `upsert`. Take the parameters from the type of the service instead:

```ts
import type { AnyIri, EntityService, IriId } from "apiplatform-fetch-builder";

const patch = <I extends AnyIri, T extends object>(
  service: EntityService<I, T>,
  id: IriId<I>,
  body: Parameters<EntityService<I, T>["update"]>[1],
) => service.update(id, body);

await patch(userService, 1, { name: "Bob" });
```

## Contributing

Bugs and ideas go to the [issue tracker](https://github.com/leo7418/apiplatform-fetch-builder/issues). To work on the library, use pnpm and Node.js 22.6 or later, since the tests run the TypeScript files directly:

```bash
pnpm install
pnpm lint   # type check, build, examples, ESLint
pnpm test
```

`pnpm test:compiled` runs the same tests compiled to JavaScript, which is what CI does on Node.js 18, 20, 22 and 24. `pnpm test:integration` runs the integration tests against the API Platform application of [integration/](./integration), which CI does for API Platform 3.4, 4.4 and 5.0. It needs PHP 8.4 or later and Composer, and the version is chosen first:

```bash
composer update --working-dir=integration/api --with "api-platform/core:~5.0.0"
pnpm test:integration
```

## License

[MIT](./LICENSE)
