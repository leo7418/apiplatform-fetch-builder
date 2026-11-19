import { test, describe, mock } from "node:test";
import assert from "node:assert/strict";

import { ApiError } from "./api-error.ts";
import fetchBuilder from "./fetch-builder.ts";
import type { Collection } from "../types/collection.ts";

const getToken = () => "some-complex-token";
const onUnauthorized = mock.fn();

const fetcher = fetchBuilder("https://example.com", {
	getToken,
	onUnauthorized,
});

describe("fetch-builder tests methods", () => {
	test("GET: should make a GET request with the correct header and return the data", async () => {
		const spy = async (input: RequestInfo | URL, init?: RequestInit) => {
			assert.equal(input, "https://example.com/test");
			assert.equal(init?.method, "GET");
			assert.equal(
				new Headers(init?.headers).get("Authorization"),
				"Bearer some-complex-token",
			);

			return new Response(JSON.stringify({ data: "ok" }), {
				status: 200,
				headers: { "Content-Type": "application/ld+json" },
			});
		};
		global.fetch = spy;

		const result = await fetcher.get<object>("/test").fetch();
		assert.deepEqual(result, { data: "ok" });
	});

	test("POST: should send data in JSON and return the response", async () => {
		const body = { foo: "bar" };

		const spy = async (input: RequestInfo | URL, init?: RequestInit) => {
			assert.equal(input, "https://example.com/create");
			assert.equal(init?.method, "POST");
			assert.equal(
				new Headers(init?.headers).get("Content-Type"),
				"application/ld+json",
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
		assert.deepEqual(result, { created: true });
	});

	test("POST: should return null when the response has no body", async () => {
		global.fetch = async () => new Response(null, { status: 204 });

		const result = await fetcher.post<null, object>("/reset").fetch({});
		assert.equal(result, null);
	});

	test("PUT: should send data in JSON and return the response", async () => {
		const body = { foo: "bar" };

		const spy = async (input: RequestInfo | URL, init?: RequestInit) => {
			assert.equal(input, "https://example.com/update");
			assert.equal(init?.method, "PUT");
			assert.equal(
				new Headers(init?.headers).get("Content-Type"),
				"application/ld+json",
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
		assert.deepEqual(result, { updated: true });
	});

	test("PATCH: should send data with Content-Type application/merge-patch+json", async () => {
		const patchData = { name: "newName" };

		const spy = async (input: RequestInfo | URL, init?: RequestInit) => {
			assert.equal(init?.method, "PATCH");
			assert.equal(
				new Headers(init?.headers).get("Content-Type"),
				"application/merge-patch+json",
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
		assert.deepEqual(result, { updated: true });
	});

	test("DELETE: should return null", async () => {
		const spy = async (input: RequestInfo | URL, init?: RequestInit) => {
			assert.equal(init?.method, "DELETE");

			return new Response(null, {
				status: 204,
				headers: { "Content-Type": "application/ld+json" },
			});
		};
		global.fetch = spy;

		const result = await fetcher.delete("/resource").fetch();
		assert.equal(result, null);
	});

	test("Error handling: if the response is not OK, throw an ApiError", async () => {
		const spy = async () => {
			return new Response(JSON.stringify({ detail: "Not authorized" }), {
				status: 401,
				headers: { "Content-Type": "application/ld+json" },
			});
		};
		global.fetch = spy;

		await assert.rejects(
			() => fetcher.get<object>("/secret").fetch(),
			(error) => {
				assert.ok(error instanceof ApiError);
				assert.equal(error.status, 401);
				assert.deepEqual(error.body, { detail: "Not authorized" });
				return true;
			},
		);
		assert.equal(onUnauthorized.mock.callCount(), 1);
	});

	test("Error handling: should keep a non-JSON error body as text", async () => {
		global.fetch = async () =>
			new Response("<html>Bad Gateway</html>", { status: 502 });

		await assert.rejects(() => fetcher.get<object>("/test").fetch(), {
			name: "ApiError",
			status: 502,
			body: "<html>Bad Gateway</html>",
		});
	});
});

describe("fetch-builder tests GET options", () => {
	test("GET with options: should add the correct searchParams", async () => {
		const spy = async (input: RequestInfo | URL) => {
			assert.match(
				input.toString(),
				/https:\/\/example.com\/items\?pagination=true&page=2&itemsPerPage=20&order%5Bname%5D=ASC/,
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

		assert.deepEqual(result, { items: [] });
	});

	test("GET with filters: should add the correct filter parameters", async () => {
		const spy = async (input: RequestInfo | URL) => {
			assert.match(
				input.toString(),
				/https:\/\/example.com\/items\?pagination=false&status=active/,
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

		assert.deepEqual(result, { items: [] });
	});

	test("GET with properties: should add the correct property parameters", async () => {
		const spy = async (input: RequestInfo | URL) => {
			assert.match(
				input.toString(),
				/https:\/\/example.com\/items\?pagination=false&properties%5B%5D=name&properties%5B%5D=age/,
			);

			return new Response(JSON.stringify({ items: [] }), {
				status: 200,
				headers: { "Content-Type": "application/ld+json" },
			});
		};
		global.fetch = spy;

		const result = await fetcher
			.get<Collection<{ name: string; age: number }, `/items/${number}`>>(
				"/items",
			)
			.withOptions({
				pagination: false,
				properties: ["name", "age"],
			})
			.fetch();

		assert.deepEqual(result, { items: [] });
	});
});

describe("fetch-builder withHeaders", () => {
	test("withHeaders: should merge custom headers into the request", async () => {
		const spy = async (_input: RequestInfo | URL, init?: RequestInit) => {
			assert.equal(
				new Headers(init?.headers).get("X-Custom-Header"),
				"custom-value",
			);

			return new Response(JSON.stringify({ data: "ok" }), {
				status: 200,
				headers: { "Content-Type": "application/ld+json" },
			});
		};
		global.fetch = spy;

		await fetcher
			.get<object>("/test")
			.withHeaders({ "X-Custom-Header": "custom-value" })
			.fetch();
	});

	test("withHeaders: should be chainable and merge multiple withHeaders calls", async () => {
		const spy = async (_input: RequestInfo | URL, init?: RequestInit) => {
			const headers = new Headers(init?.headers);
			assert.equal(headers.get("X-First"), "first");
			assert.equal(headers.get("X-Second"), "second");

			return new Response(JSON.stringify({ data: "ok" }), {
				status: 200,
				headers: { "Content-Type": "application/ld+json" },
			});
		};
		global.fetch = spy;

		await fetcher
			.get<object>("/test")
			.withHeaders({ "X-First": "first" })
			.withHeaders({ "X-Second": "second" })
			.fetch();
	});

	test("withHeaders: should accept a Headers instance", async () => {
		const spy = async (_input: RequestInfo | URL, init?: RequestInit) => {
			assert.equal(new Headers(init?.headers).get("X-Tenant"), "acme");

			return new Response(JSON.stringify({ data: "ok" }), { status: 200 });
		};
		global.fetch = spy;

		await fetcher
			.get<object>("/test")
			.withHeaders(new Headers({ "X-Tenant": "acme" }))
			.fetch();
	});

	test("withHeaders: should override a default header whatever its case", async () => {
		const spy = async (_input: RequestInfo | URL, init?: RequestInit) => {
			assert.equal(
				new Headers(init?.headers).get("Content-Type"),
				"application/json",
			);

			return new Response(JSON.stringify({ data: "ok" }), { status: 200 });
		};
		global.fetch = spy;

		await fetcher
			.post<object, object>("/test")
			.withHeaders({ "content-type": "application/json" })
			.fetch({});
	});
});

describe("fetch-builder withBody", () => {
	test("withBody: should pre-configure body and allow fetch() without args", async () => {
		const body = { foo: "bar" };

		const spy = async (_input: RequestInfo | URL, init?: RequestInit) => {
			assert.equal(init?.method, "POST");
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
			.withBody(body)
			.fetch();
		assert.deepEqual(result, { created: true });
	});

	test("withBody + withHeaders: should merge headers and keep body", async () => {
		const body = { foo: "bar" };

		const spy = async (_input: RequestInfo | URL, init?: RequestInit) => {
			assert.equal(new Headers(init?.headers).get("X-Tenant"), "acme");
			const sentBody = init?.body ? JSON.parse(init.body as string) : null;
			assert.deepEqual(sentBody, body);

			return new Response(JSON.stringify({ created: true }), {
				status: 201,
				headers: { "Content-Type": "application/ld+json" },
			});
		};
		global.fetch = spy;

		await fetcher
			.post<{ created: boolean }, typeof body>("/create")
			.withBody(body)
			.withHeaders({ "X-Tenant": "acme" })
			.fetch();
	});
});

describe("fetch-builder clone", () => {
	test("clone: should create a new fetcher with merged config", async () => {
		const spy = async (_input: RequestInfo | URL, init?: RequestInit) => {
			assert.equal(
				new Headers(init?.headers).get("Authorization"),
				"Bearer cloned-token",
			);

			return new Response(JSON.stringify({ ok: true }), {
				status: 200,
				headers: { "Content-Type": "application/ld+json" },
			});
		};
		global.fetch = spy;

		const cloned = fetcher.clone({ getToken: () => "cloned-token" });
		await cloned.get<object>("/test").fetch();
	});

	test("clone: should inherit original config when no overrides", async () => {
		const spy = async (_input: RequestInfo | URL, init?: RequestInit) => {
			assert.equal(
				new Headers(init?.headers).get("Authorization"),
				"Bearer some-complex-token",
			);

			return new Response(JSON.stringify({ ok: true }), {
				status: 200,
				headers: { "Content-Type": "application/ld+json" },
			});
		};
		global.fetch = spy;

		const cloned = fetcher.clone();
		await cloned.get<object>("/test").fetch();
	});
});

describe("fetch-builder refreshToken", () => {
	test("refreshToken: should retry with new token on 401", async () => {
		let callCount = 0;
		const spy = async (_input: RequestInfo | URL, init?: RequestInit) => {
			callCount++;
			if (callCount === 1) {
				return new Response(JSON.stringify({ detail: "Unauthorized" }), {
					status: 401,
					headers: { "Content-Type": "application/ld+json" },
				});
			}
			assert.equal(
				new Headers(init?.headers).get("Authorization"),
				"Bearer refreshed-token",
			);
			return new Response(JSON.stringify({ data: "ok" }), {
				status: 200,
				headers: { "Content-Type": "application/ld+json" },
			});
		};
		global.fetch = spy;

		const refreshFetcher = fetchBuilder("https://example.com", {
			getToken: () => "expired-token",
			refreshToken: () => "refreshed-token",
		});

		const result = await refreshFetcher.get<object>("/secure").fetch();
		assert.deepEqual(result, { data: "ok" });
		assert.equal(callCount, 2);
	});

	test("refreshToken: should call onUnauthorized if retry also fails", async () => {
		const onUnauthorizedMock = mock.fn();
		const spy = async () =>
			new Response(JSON.stringify({ detail: "Unauthorized" }), {
				status: 401,
				headers: { "Content-Type": "application/ld+json" },
			});
		global.fetch = spy;

		const refreshFetcher = fetchBuilder("https://example.com", {
			getToken: () => "expired-token",
			refreshToken: () => "still-bad-token",
			onUnauthorized: onUnauthorizedMock,
		});

		await assert.rejects(() => refreshFetcher.get<object>("/secure").fetch(), {
			name: "ApiError",
			status: 401,
		});
		assert.equal(onUnauthorizedMock.mock.callCount(), 1);
	});

	test("refreshToken: should refresh once for concurrent 401 responses", async () => {
		const refreshToken = mock.fn(async () => "refreshed-token");
		global.fetch = async (_input, init) =>
			new Headers(init?.headers).get("Authorization") === "Bearer expired-token"
				? new Response(JSON.stringify({ detail: "Unauthorized" }), {
						status: 401,
					})
				: new Response(JSON.stringify({ data: "ok" }), { status: 200 });

		const refreshFetcher = fetchBuilder("https://example.com", {
			getToken: () => "expired-token",
			refreshToken,
		});

		await Promise.all([
			refreshFetcher.get<object>("/first").fetch(),
			refreshFetcher.get<object>("/second").fetch(),
			refreshFetcher.get<object>("/third").fetch(),
		]);

		assert.equal(refreshToken.mock.callCount(), 1);
	});
});

describe("fetch-builder security", () => {
	test("assertSafeKey: should throw on unsafe sortBy id", () => {
		assert.throws(
			() =>
				fetcher
					.get<{ items: object[] }>("/items")
					.withOptions({ sortBy: [{ id: "name; DROP TABLE", desc: false }] })
					.fetch(),
			TypeError,
		);
	});

	test("assertSafeKey: should throw on unsafe filter id", () => {
		assert.throws(
			() =>
				fetcher
					.get<{ items: object[] }>("/items")
					.withOptions({ filters: [{ id: "status<script>", value: "x" }] })
					.fetch(),
			TypeError,
		);
	});

	test("assertSafeKey: should not throw on valid dot-notation key", async () => {
		global.fetch = async () =>
			new Response(JSON.stringify({ items: [] }), {
				status: 200,
				headers: { "Content-Type": "application/ld+json" },
			});

		await assert.doesNotReject(() =>
			fetcher
				.get<{ items: object[] }>("/items")
				.withOptions({ sortBy: [{ id: "employee.name", desc: false }] })
				.fetch(),
		);
	});

	test("assertSafeToken: should throw on token with whitespace", async () => {
		const unsafeFetcher = fetchBuilder("https://example.com", {
			getToken: () => "bad token",
		});

		await assert.rejects(
			() => unsafeFetcher.get<object>("/test").fetch(),
			TypeError,
		);
	});

	test("assertSafeToken: should throw on token with newline", async () => {
		const unsafeFetcher = fetchBuilder("https://example.com", {
			getToken: () => "bad\ntoken",
		});

		await assert.rejects(
			() => unsafeFetcher.get<object>("/test").fetch(),
			TypeError,
		);
	});

	test("buildURL: should throw on a URL from another origin", async () => {
		const fetchMock = mock.fn(async () => new Response("{}"));
		global.fetch = fetchMock;

		await assert.rejects(
			() => fetcher.get<object>("https://evil.test/steal").fetch(),
			TypeError,
		);
		await assert.rejects(
			() => fetcher.get<object>("//evil.test/steal").fetch(),
			TypeError,
		);
		assert.equal(fetchMock.mock.callCount(), 0);
	});
});
