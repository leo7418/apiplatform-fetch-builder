# apiplatform-fetch-builder
[![GitHub stars](https://img.shields.io/github/stars/leo7418/apiplatform-fetch-builder.svg?style=social&label=Star)](https://github.com/leo7418/apiplatform-fetch-builder)
[![GitHub issues](https://img.shields.io/github/issues/leo7418/apiplatform-fetch-builder.svg)](https://github.com/leo7418/apiplatform-fetch-builder/issues)
[![npm downloads](https://img.shields.io/npm/dm/apiplatform-fetch-builder.svg)](https://www.npmjs.com/package/apiplatform-fetch-builder)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](./LICENSE)

**apiplatform-fetch-builder** is a TypeScript library designed to simplify and streamline interactions with APIs built on [ApiPlatform](https://api-platform.com/) and Hydra. It provides a flexible builder-pattern interface for making typed `fetch` requests, handling pagination, sorting, filtering, and other common query operations. By integrating type definitions, this library ensures that developers benefit from static type checking and an improved developer experience when working with complex API responses and custom request configurations.

## Features

- **Typed `fetch` requests:** Leverage TypeScript’s static type system to ensure safety and reduce runtime errors.
- **Builder-pattern interface:** Easily compose requests with pagination, sorting, filtering, and property selection.
- **Hydra & ApiPlatform compatibility:** Designed to integrate seamlessly with Hydra-based APIs.
- **No bundler required:** Uses native `fetch` and `URLSearchParams`, keeping dependencies minimal.

## Installation

```bash
npm install apiplatform-fetch-builder
# or
yarn add apiplatform-fetch-builder
# or
pnpm add apiplatform-fetch-builder
```

## Usage Example

```typescript
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

// POST
const postResult = await api
  .post<{ created: boolean }, { name: string }>("/items")
  .fetch({ name: "New Item" });

if (postResult.success) {
  console.log("Item created successfully!");
} else {
  console.error("Item creation failed:", postResult.error);
}
```

## API

### `builder(entrypoint: string, config?: BuilderConfig)`

**Parameters:**

- `entrypoint: string`: The base URL of your API (e.g., `"https://api.example.com"`).
- `config?: BuilderConfig`: Optional configuration object.
  - `getToken?: () => string | null | Promise<string | null>`: Function that returns the authorization token.
  - `onUnauthorized?: () => void | Promise<void>`: Callback triggered on `401 Unauthorized` responses.

**Returns:** An object with methods `get`, `post`, `patch`, and `del`.

### `get(url: string)`

Returns an object with:

- `fetch(options?: FetchOptions)`: Performs a GET request.
- `withOptions(getOptions: GetOptions)`: Returns a specialized fetch function that applies pagination, sorting, filtering, and properties selection.

### `post(url: string)`, `patch(url: string)`, `del(url: string)`

Similar to `get`, but for respective HTTP methods. `post` and `patch` accept a `body` parameter for the request payload, while `del` is for DELETE requests and returns `null` as data on success.

## Contributing

Contributions are welcome! Please open an issue or submit a pull request on the [GitHub repository](https://github.com/leo7418/apiplatform-fetch-builder).

## License

Licensed under the [MIT License](./LICENSE).
