# apiplatform-fetch-builder
[![GitHub stars](https://img.shields.io/github/stars/leo7418/apiplatform-fetch-builder.svg?style=social&label=Star)](https://github.com/leo7418/apiplatform-fetch-builder)
[![GitHub issues](https://img.shields.io/github/issues/leo7418/apiplatform-fetch-builder.svg)](https://github.com/leo7418/apiplatform-fetch-builder/issues)
[![npm downloads](https://img.shields.io/npm/dm/apiplatform-fetch-builder.svg)](https://www.npmjs.com/package/apiplatform-fetch-builder)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](./LICENSE)

**apiplatform-fetch-builder** is a TypeScript library designed to simplify and streamline interactions with [ApiPlatform](https://api-platform.com/) / Hydra APIs. It provides a builder-pattern interface for making typed `fetch` requests, handling pagination, sorting, filtering, property selection, and includes an optional `entityServiceBuilder` for more advanced resource CRUD operations with type safety.

## Features
- **Typed `fetch` requests**  
- **Builder-pattern interface** (pagination, sorting, filtering, property selection)  
- **Hydra & ApiPlatform compatibility**  
- **Optional `entityServiceBuilder`** for CRUD (Create, Read, Update, Delete) operations with typed IRIs  
- **No bundler required**

## Installation

```bash
npm install apiplatform-fetch-builder
# or
yarn add apiplatform-fetch-builder
# or
pnpm add apiplatform-fetch-builder
```

## Quick Usage Example

```ts
import builder from "apiplatform-fetch-builder";

const api = builder("https://api.example.com", {
  getToken: async () => "your_jwt_token_here",
  onUnauthorized: async () => {
    console.log("Unauthorized! Redirecting to login...");
  },
});

// Simple GET
const result = await api.get<{ items: { id: number; name: string }[] }>("/items").fetch();

if (result.success) {
  console.log("Fetched items:", result.data.items);
} else {
  console.error("Failed to fetch items:", result.error);
}

// GET with pagination, sorting, filtering, and property selection
const getOptions = {
  pagination: true,
  pageIndex: 0,
  pageSize: 20,
  sortBy: [{ id: "name", desc: false }],
  filters: [{ id: "category", value: "books" }],
  properties: ["id", "name"] as const,
};

const paginatedResult = await api
  .get<{ items: { id: number; name: string }[] }>("/items")
  .withOptions(getOptions)
  .fetch();

if (paginatedResult.success) {
  console.log("Paginated items:", paginatedResult.data.items);
}
```

## Using `entityServiceBuilder`

```ts
import fetchBuilder from "apiplatform-fetch-builder";
import entityServiceBuilder from "apiplatform-fetch-builder/entity-service-builder"; 
import type { Company, CompanyBody, CompanyIri } from "./types/company";

// Create a typed service builder
const companyService = entityServiceBuilder<CompanyIri, CompanyBody, Company>(
  fetchBuilder("https://api.example.com"), 
  "/companies"
);

// GET collection with options
const companiesResult = await companyService.getAll({
  pagination: true,
  pageIndex: 1,
  pageSize: 10,
  sortBy: [{ id: "name", desc: false }],
  properties: ["name", "description", "ceo", "employees.id"] as const,
});

if (companiesResult.success) {
  console.log("Companies:", companiesResult.data["hydra:member"]);
}

// GET single item
const companyResult = await companyService.get(1);
if (companyResult.success) {
  console.log("Company:", companyResult.data);
}

// CREATE new item
const createResult = await companyService.create({
  name: "New Company",
  description: "We build new things",
});
if (createResult.success) {
  console.log("Created company:", createResult.data);
}
```

## API

### `builder(entrypoint: string, config?: BuilderConfig)`

**Parameters:**
- `entrypoint: string`: Base URL of your API (e.g., `"https://api.example.com"`).
- `config?: BuilderConfig`: Optional config object.
  - `getToken?: () => string | null | Promise<string | null>`  
  - `onUnauthorized?: () => void | Promise<void>`

**Returns:** An object with methods `get`, `post`, `patch`, `put`, and `delete`.

---

### `get(url: string)`

Returns an object with:
- `fetch(options?: FetchOptions)`: Performs a GET request.
- `withOptions(getOptions: GetOptions)`: Applies pagination, sorting, filtering, property selection.

### `post(url: string)`, `patch(url: string)`, `put(url: string)`, `delete(url: string)`

Similar to `get` but for respective HTTP methods. `post`, `patch`, and `put` accept a request body. `delete` returns `null` data on success.

---

### `entityServiceBuilder(...)`

**Parameters:**
- Generic type parameters: `<IriType, BodyType, EntityType>`
- Accepts a fetcher (from `builder(...)`) or a string/entrypoint object.
- `entityPath: string` for the resource (e.g. `"/companies"`).

**Returns:**  
An object with methods: `create`, `get`, `getAll`, `update`, `replace`, `delete`.

---

## Contributing

Contributions are welcome! Please open an issue or submit a pull request on [GitHub](https://github.com/leo7418/apiplatform-fetch-builder).

## License

Licensed under the [MIT License](./LICENSE).
