import { test, describe, mock } from "node:test";
import assert from "node:assert/strict";

import fetchBuilder from "./fetch-builder.ts";
import type { Collection } from "../types/collection.ts";

const getToken = () => "some-complex-token";
const onUnauthorized = mock.fn();

const fetcher = fetchBuilder("https://example.com", {
	getToken,
	onUnauthorized,
});

describe("fetch-builder tests methods", () => {
	test("GET: should make a GET request with the correct header and return success=true", async () => {
		const spy = async (input: RequestInfo | URL, init?: RequestInit) => {
			assert.equal(input, "https://example.com/test");
			assert.equal(init?.method, "GET");
			assert.equal(
				(init?.headers as Record<string, string> | undefined)?.[
					"Authorization"
				],
				"Bearer some-complex-token"
			);

			return new Response(JSON.stringify({ data: "ok" }), {
				status: 200,
				headers: { "Content-Type": "application/ld+json" },
			});
		};
		global.fetch = spy;

		const result = await fetcher.get<object>("/test").fetch();
		assert.equal(result.success, true);
		assert.deepEqual(result.data, { data: "ok" });
	});

	test("POST: should send data in JSON and return the response", async () => {
		const body = { foo: "bar" };

		const spy = async (input: RequestInfo | URL, init?: RequestInit) => {
			assert.equal(input, "https://example.com/create");
			assert.equal(init?.method, "POST");
			assert.equal(
				(init?.headers as Record<string, string> | undefined)?.["Content-Type"],
				"application/ld+json"
			);
			const sentBody = init?.body ? JSON.parse(init.body as string) : null;
			assert.deepEqual(sentBody, body);

			return new Response(JSON.stringify({ created: true }), {
				status: 201,
				headers: { "Content-Type": "application/ld+json" },
			});
		};
		global.fetch = spy;

		const result = await fetcher
			.post<{ created: boolean }, typeof body>("/create")
			.fetch(body);
		assert.equal(result.success, true);
		assert.deepEqual(result.data, { created: true });
	});

	test("PUT: should send data in JSON and return the response", async () => {
		const body = { foo: "bar" };

		const spy = async (input: RequestInfo | URL, init?: RequestInit) => {
			assert.equal(input, "https://example.com/update");
			assert.equal(init?.method, "PUT");
			assert.equal(
				(init?.headers as Record<string, string> | undefined)?.["Content-Type"],
				"application/ld+json"
			);
			const sentBody = init?.body ? JSON.parse(init.body as string) : null;
			assert.deepEqual(sentBody, body);

			return new Response(JSON.stringify({ updated: true }), {
				status: 200,
				headers: { "Content-Type": "application/ld+json" },
			});
		};
		global.fetch = spy;

		const result = await fetcher
			.put<{ updated: boolean }, typeof body>("/update")
			.fetch(body);
		assert.equal(result.success, true);
		assert.deepEqual(result.data, { updated: true });
	});

	test("PATCH: should send data with Content-Type application/merge-patch+json", async () => {
		const patchData = { name: "newName" };

		const spy = async (input: RequestInfo | URL, init?: RequestInit) => {
			assert.equal(init?.method, "PATCH");
			assert.equal(
				(init?.headers as Record<string, string> | undefined)?.["Content-Type"],
				"application/merge-patch+json"
			);
			const sentBody = init?.body ? JSON.parse(init.body as string) : null;
			assert.deepEqual(sentBody, patchData);

			return new Response(JSON.stringify({ updated: true }), {
				status: 200,
				headers: { "Content-Type": "application/ld+json" },
			});
		};
		global.fetch = spy;

		const result = await fetcher
			.patch<{ updated: boolean }, typeof patchData>("/resource")
			.fetch(patchData);
		assert.equal(result.success, true);
		assert.deepEqual(result.data, { updated: true });
	});

	test("DELETE: should return success=true and data=null", async () => {
		const spy = async (input: RequestInfo | URL, init?: RequestInit) => {
			assert.equal(init?.method, "DELETE");

			return new Response(null, {
				status: 204,
				headers: { "Content-Type": "application/ld+json" },
			});
		};
		global.fetch = spy;

		const result = await fetcher.del("/resource").fetch();
		assert.equal(result.success, true);
		assert.equal(result.data, null);
	});

	test("Error handling: if the response is not OK, return success=false and error", async () => {
		const spy = async (input: RequestInfo | URL, init?: RequestInit) => {
			return new Response(JSON.stringify({ detail: "Not authorized" }), {
				status: 401,
				headers: { "Content-Type": "application/ld+json" },
			});
		};
		global.fetch = spy;

		const result = await fetcher.get<object>("/secret").fetch();
		assert.equal(onUnauthorized.mock.callCount(), 1);
		assert.equal(result.success, false);
		assert.deepEqual(result.error, { detail: "Not authorized" });
	});
});

describe("fetch-builder tests GET options", () => {
	test("GET with options: should add the correct searchParams", async () => {
		const spy = async (input: RequestInfo | URL, init?: RequestInit) => {
			assert.match(
				input.toString(),
				/https:\/\/example.com\/items\?pagination=true&page=2&itemsPerPage=20&order%5Bname%5D=ASC/
			);

			return new Response(JSON.stringify({ items: [] }), {
				status: 200,
				headers: { "Content-Type": "application/ld+json" },
			});
		};
		global.fetch = spy;

		const result = await fetcher
			.get<{ items: object[] }>("/items")
			.withOptions({
				pagination: true,
				pageIndex: 1,
				pageSize: 20,
				sortBy: [{ id: "name", desc: false }],
			})
			.fetch();

		assert.equal(result.success, true);
		assert.deepEqual(result.data, { items: [] });
	});

	test("GET with filters: should add the correct filter parameters", async () => {
		const spy = async (input: RequestInfo | URL, init?: RequestInit) => {
			assert.match(
				input.toString(),
				/https:\/\/example.com\/items\?status=active/
			);

			return new Response(JSON.stringify({ items: [] }), {
				status: 200,
				headers: { "Content-Type": "application/ld+json" },
			});
		};
		global.fetch = spy;

		const result = await fetcher
			.get<{ items: object[] }>("/items")
			.withOptions({
				pagination: false,
				filters: [{ id: "status", value: "active" }],
			})
			.fetch();

		assert.equal(result.success, true);
		assert.deepEqual(result.data, { items: [] });
	});

	test("GET with properties: should add the correct property parameters", async () => {
		const spy = async (input: RequestInfo | URL, init?: RequestInit) => {
			assert.match(
				input.toString(),
				/https:\/\/example.com\/items\?properties%5B%5D=name&properties%5B%5D=age/
			);

			return new Response(JSON.stringify({ items: [] }), {
				status: 200,
				headers: { "Content-Type": "application/ld+json" },
			});
		};
		global.fetch = spy;

		const result = await fetcher
			.get<Collection<{ name: string; age: number }, `/items/${number}`>>(
				"/items"
			)
			.withOptions({
				pagination: false,
				properties: ["name", "age"],
			})
			.fetch();

		assert.equal(result.success, true);
		assert.deepEqual(result.data, { items: [] });
	});
});
