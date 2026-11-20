import { test, describe, mock } from "node:test";
import assert from "node:assert/strict";

import { ApiError, isHydraError } from "./api-error.ts";
import fetchBuilder from "./fetch-builder.ts";
import type { Collection } from "../types/collection.ts";

const onUnauthorized = mock.fn();

const fetcher = fetchBuilder("https://example.com", {
	headers: { Authorization: "Bearer some-complex-token" },
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

	test("Error handling: should throw an ApiError when an OK response is not JSON", async () => {
		global.fetch = async () =>
			new Response("<html>Maintenance</html>", { status: 200 });

		await assert.rejects(() => fetcher.get<object>("/test").fetch(), {
			name: "ApiError",
			message: "Response is not JSON",
			status: 200,
			body: "<html>Maintenance</html>",
		});
	});

	test("Error handling: should throw an ApiError when a GET response has no body", async () => {
		global.fetch = async () => new Response(null, { status: 204 });

		await assert.rejects(() => fetcher.get<object>("/test").fetch(), {
			name: "ApiError",
			status: 204,
			body: "",
		});
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

describe("fetch-builder isHydraError", () => {
	test("should narrow the body of an API Platform error", async () => {
		global.fetch = async () =>
			new Response(
				JSON.stringify({
					"@type": "ConstraintViolationList",
					title: "An error occurred",
					violations: [
						{
							propertyPath: "name",
							message: "This value should not be blank.",
						},
					],
				}),
				{ status: 422 },
			);

		await assert.rejects(
			() => fetcher.post<object, object>("/users").fetch({}),
			(error) => {
				assert.ok(error instanceof ApiError);
				assert.ok(isHydraError(error.body));
				assert.equal(error.body.violations?.[0].propertyPath, "name");
				return true;
			},
		);
	});

	test("should reject a body that is not an API Platform error", () => {
		assert.equal(
			isHydraError({ code: 401, message: "JWT Token not found" }),
			false,
		);
		assert.equal(isHydraError("<html>Bad Gateway</html>"), false);
	});

	test("should accept an error that only carries the prefixed title", () => {
		assert.ok(
			isHydraError({
				"@type": "ConstraintViolationList",
				"hydra:title": "An error occurred",
				"hydra:description": "name: This value should not be blank.",
				violations: [],
			}),
		);
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

		const cloned = fetcher.clone({
			headers: { Authorization: "Bearer cloned-token" },
		});
		await cloned.get<object>("/test").fetch();
	});

	test("clone: should add its headers to the ones of the original", async () => {
		const spy = async (_input: RequestInfo | URL, init?: RequestInit) => {
			const headers = new Headers(init?.headers);
			assert.equal(headers.get("Authorization"), "Bearer some-complex-token");
			assert.equal(headers.get("X-Tenant"), "acme");

			return new Response(JSON.stringify({ ok: true }), { status: 200 });
		};
		global.fetch = spy;

		const cloned = fetcher.clone({ headers: () => ({ "X-Tenant": "acme" }) });
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

describe("fetch-builder refreshAuth", () => {
	test("refreshAuth: should retry with new token on 401", async () => {
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

		let token = "expired-token";
		const refreshFetcher = fetchBuilder("https://example.com", {
			headers: () => ({ Authorization: `Bearer ${token}` }),
			refreshAuth: () => {
				token = "refreshed-token";
			},
		});

		const result = await refreshFetcher.get<object>("/secure").fetch();
		assert.deepEqual(result, { data: "ok" });
		assert.equal(callCount, 2);
	});

	test("refreshAuth: should call onUnauthorized if retry also fails", async () => {
		const onUnauthorizedMock = mock.fn();
		const spy = async () =>
			new Response(JSON.stringify({ detail: "Unauthorized" }), {
				status: 401,
				headers: { "Content-Type": "application/ld+json" },
			});
		global.fetch = spy;

		const refreshFetcher = fetchBuilder("https://example.com", {
			headers: { Authorization: "Bearer expired-token" },
			refreshAuth: () => {},
			onUnauthorized: onUnauthorizedMock,
		});

		await assert.rejects(() => refreshFetcher.get<object>("/secure").fetch(), {
			name: "ApiError",
			status: 401,
		});
		assert.equal(onUnauthorizedMock.mock.callCount(), 1);
	});

	test("refreshAuth: should refresh once for concurrent 401 responses", async () => {
		let token = "expired-token";
		const refreshAuth = mock.fn(async () => {
			token = "refreshed-token";
		});
		global.fetch = async (_input, init) =>
			new Headers(init?.headers).get("Authorization") === "Bearer expired-token"
				? new Response(JSON.stringify({ detail: "Unauthorized" }), {
						status: 401,
					})
				: new Response(JSON.stringify({ data: "ok" }), { status: 200 });

		const refreshFetcher = fetchBuilder("https://example.com", {
			headers: () => ({ Authorization: `Bearer ${token}` }),
			refreshAuth,
		});

		await Promise.all([
			refreshFetcher.get<object>("/first").fetch(),
			refreshFetcher.get<object>("/second").fetch(),
			refreshFetcher.get<object>("/third").fetch(),
		]);

		assert.equal(refreshAuth.mock.callCount(), 1);
	});

	test("refreshAuth: should not share the refresh between separate fetchers", async () => {
		let token = "expired-token";
		const refreshAuth = mock.fn(async () => {
			token = "refreshed-token";
		});
		global.fetch = async (_input, init) =>
			new Headers(init?.headers).get("Authorization") === "Bearer expired-token"
				? new Response(JSON.stringify({ detail: "Unauthorized" }), {
						status: 401,
					})
				: new Response(JSON.stringify({ data: "ok" }), { status: 200 });

		const build = () =>
			fetchBuilder("https://example.com", {
				headers: () => ({ Authorization: `Bearer ${token}` }),
				refreshAuth,
			});

		await Promise.all([
			build().get<object>("/first").fetch(),
			build().get<object>("/second").fetch(),
		]);

		assert.equal(refreshAuth.mock.callCount(), 2);
	});

	test("refreshAuth: should accept the same response object for the retry", async () => {
		const unauthorized = new Response(
			JSON.stringify({ detail: "Unauthorized" }),
			{ status: 401 },
		);
		global.fetch = async () => unauthorized;

		const refreshFetcher = fetchBuilder("https://example.com", {
			refreshAuth: () => {},
		});

		await assert.rejects(() => refreshFetcher.get<object>("/secure").fetch(), {
			name: "ApiError",
			status: 401,
			body: { detail: "Unauthorized" },
		});
	});

	test("refreshAuth: should share the refresh with a clone", async () => {
		let token = "expired-token";
		const refreshAuth = mock.fn(async () => {
			token = "refreshed-token";
		});
		global.fetch = async (_input, init) =>
			new Headers(init?.headers).get("Authorization") === "Bearer expired-token"
				? new Response(JSON.stringify({ detail: "Unauthorized" }), {
						status: 401,
					})
				: new Response(JSON.stringify({ data: "ok" }), { status: 200 });

		const refreshFetcher = fetchBuilder("https://example.com", {
			headers: () => ({ Authorization: `Bearer ${token}` }),
			refreshAuth,
		});
		const tenantFetcher = refreshFetcher.clone({
			headers: { "X-Tenant": "acme" },
		});

		await Promise.all([
			refreshFetcher.get<object>("/first").fetch(),
			tenantFetcher.get<object>("/second").fetch(),
		]);

		assert.equal(refreshAuth.mock.callCount(), 1);
	});

	test("refreshAuth: should receive a fetcher without the headers and the hooks", async () => {
		let token = "expired-token";
		const refreshAuth = mock.fn();
		const onUnauthorizedMock = mock.fn();
		const refreshHeaders: (string | null)[] = [];
		global.fetch = async (input, init) => {
			const authorization = new Headers(init?.headers).get("Authorization");
			if (input.toString().endsWith("/token/refresh")) {
				refreshHeaders.push(authorization);
				return new Response(JSON.stringify({ token: "refreshed-token" }));
			}
			return authorization === "Bearer refreshed-token"
				? new Response(JSON.stringify({ data: "ok" }), { status: 200 })
				: new Response(JSON.stringify({ detail: "Unauthorized" }), {
						status: 401,
					});
		};

		const refreshFetcher = fetchBuilder("https://example.com/api", {
			headers: () => ({ Authorization: `Bearer ${token}` }),
			refreshAuth: async (auth) => {
				refreshAuth();
				const body = await auth
					.post<{ token: string }, object>("/token/refresh")
					.fetch({});
				token = body.token;
			},
			onUnauthorized: onUnauthorizedMock,
		});

		const result = await refreshFetcher.get<object>("/secure").fetch();

		assert.deepEqual(result, { data: "ok" });
		assert.deepEqual(refreshHeaders, [null]);
		assert.equal(refreshAuth.mock.callCount(), 1);
		assert.equal(onUnauthorizedMock.mock.callCount(), 0);
	});

	test("refreshAuth: should not call onUnauthorized when the refresh fails for another reason", async () => {
		const onUnauthorizedMock = mock.fn();
		global.fetch = async () =>
			new Response(JSON.stringify({ detail: "Unauthorized" }), {
				status: 401,
			});

		for (const failure of [
			new TypeError("fetch failed"),
			new ApiError(503, "Service Unavailable"),
		]) {
			const refreshFetcher = fetchBuilder("https://example.com", {
				refreshAuth: async () => {
					throw failure;
				},
				onUnauthorized: onUnauthorizedMock,
			});

			await assert.rejects(
				() => refreshFetcher.get<object>("/secure").fetch(),
				{ name: "ApiError", status: 401, cause: failure },
			);
		}
		assert.equal(onUnauthorizedMock.mock.callCount(), 0);
	});

	test("refreshAuth: should call onUnauthorized when the API refuses the refresh", async () => {
		const onUnauthorizedMock = mock.fn();
		const fetchMock = mock.fn(
			async () =>
				new Response(JSON.stringify({ detail: "Unauthorized" }), {
					status: 401,
				}),
		);
		global.fetch = fetchMock;

		const failure = new ApiError(401, { detail: "Refresh token expired" });
		const refreshFetcher = fetchBuilder("https://example.com", {
			refreshAuth: async () => {
				throw failure;
			},
			onUnauthorized: onUnauthorizedMock,
		});

		await assert.rejects(() => refreshFetcher.get<object>("/secure").fetch(), {
			name: "ApiError",
			status: 401,
			body: { detail: "Unauthorized" },
			cause: failure,
		});
		assert.equal(onUnauthorizedMock.mock.callCount(), 1);
		assert.equal(fetchMock.mock.callCount(), 1);
	});
});

describe("fetch-builder security", () => {
	test("assertSafeKey: should reject an unsafe sortBy id", async () => {
		await assert.rejects(
			() =>
				fetcher
					.get<{ items: object[] }>("/items")
					.withOptions({ sortBy: [{ id: "name; DROP TABLE", desc: false }] })
					.fetch(),
			TypeError,
		);
	});

	test("assertSafeKey: should reject an unsafe filter id", async () => {
		await assert.rejects(
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
				.withOptions({
					sortBy: [{ id: "employee.name", desc: false }],
					filters: [{ id: "created-after", value: "2026-01-01" }],
				})
				.fetch(),
		);
	});

	test("headers: should reject a header value with a newline", async () => {
		const unsafeFetcher = fetchBuilder("https://example.com", {
			headers: { Authorization: "Bearer bad\ntoken" },
		});

		await assert.rejects(
			() => unsafeFetcher.get<object>("/test").fetch(),
			TypeError,
		);
	});

	test("headers: should reject an invalid header passed to a request", async () => {
		const headers = { "X-User": "名前" };

		await assert.rejects(
			() => fetcher.get<object>("/test").fetch({ headers }),
			TypeError,
		);
		await assert.rejects(
			() => fetcher.post<object, object>("/test").fetch({}, { headers }),
			TypeError,
		);
		await assert.rejects(
			() => fetcher.delete("/test").fetch({ headers }),
			TypeError,
		);
		await assert.rejects(
			() => fetcher.get<object>("/test").withHeaders(headers).fetch(),
			TypeError,
		);
		await assert.rejects(
			() =>
				fetcher.post<object, object>("/test").withHeaders(headers).fetch({}),
			TypeError,
		);
		await assert.rejects(
			() => fetcher.delete("/test").withHeaders(headers).fetch(),
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

describe("fetch-builder config headers", () => {
	test("headers: should call a function before each request and let the request override it", async () => {
		let language = "fr";
		const sent: (string | null)[][] = [];
		global.fetch = async (_input, init) => {
			const headers = new Headers(init?.headers);
			sent.push([headers.get("Accept-Language"), headers.get("X-Tenant")]);
			return new Response(JSON.stringify({ data: "ok" }), { status: 200 });
		};

		const localized = fetchBuilder("https://example.com", {
			headers: async () => ({
				"Accept-Language": language,
				"X-Tenant": "acme",
			}),
		});

		await localized.get<object>("/test").fetch();
		language = "en";
		await localized
			.get<object>("/test")
			.withHeaders({ "x-tenant": "other" })
			.fetch();

		assert.deepEqual(sent, [
			["fr", "acme"],
			["en", "other"],
		]);
	});

	test("headers: should only send a Content-Type with a body", async () => {
		global.fetch = async (_input, init) => {
			assert.equal(new Headers(init?.headers).get("Content-Type"), null);
			return new Response(JSON.stringify({ data: "ok" }), { status: 200 });
		};

		await fetcher.get<object>("/test").fetch();
	});
});

describe("fetch-builder config request options", () => {
	test("should apply them to every request and let a request override them", async () => {
		const sent: (RequestCredentials | undefined)[] = [];
		global.fetch = async (_input, init) => {
			sent.push(init?.credentials);
			return new Response(JSON.stringify({ data: "ok" }), { status: 200 });
		};

		const withCookies = fetchBuilder("https://example.com", {
			credentials: "include",
		});

		await withCookies.get<object>("/test").fetch();
		await withCookies.get<object>("/test").fetch({ credentials: "omit" });

		assert.deepEqual(sent, ["include", "omit"]);
	});
});

describe("fetch-builder request body", () => {
	test("should send a binary body as it is, without a JSON Content-Type", async () => {
		const blob = new Blob(["abc"], { type: "text/plain" });
		global.fetch = async (_input, init) => {
			assert.equal(init?.body, blob);
			assert.equal(new Headers(init?.headers).get("Content-Type"), null);
			return new Response(JSON.stringify({ data: "ok" }), { status: 200 });
		};

		await fetcher.post<object, Blob>("/media").fetch(blob);
	});

	test("should send requests where streams do not exist", async () => {
		const bodies: unknown[] = [];
		const responses = [new Response("{}"), new Response("{}")];
		global.fetch = async (_input, init) => {
			bodies.push(init?.body);
			return responses.shift()!;
		};
		const { ReadableStream } = globalThis;
		Reflect.deleteProperty(globalThis, "ReadableStream");

		try {
			await fetcher.get<object>("/test").fetch();
			await fetcher.post<object, object>("/test").fetch({ name: "Alice" });
		} finally {
			globalThis.ReadableStream = ReadableStream;
		}

		assert.deepEqual(bodies, [undefined, '{"name":"Alice"}']);
	});

	test("should send a stream as it is", async () => {
		const stream = new Blob(["abc"]).stream();
		global.fetch = async (_input, init) => {
			assert.equal(init?.body, stream);
			assert.equal((init as { duplex?: string }).duplex, "half");
			assert.equal(new Headers(init?.headers).get("Content-Type"), null);
			return new Response(JSON.stringify({ data: "ok" }), { status: 200 });
		};

		await fetcher.post<object, ReadableStream>("/media").fetch(stream);
	});

	test("should not send a stream again after a refresh", async () => {
		const refreshAuth = mock.fn();
		const onUnauthorizedMock = mock.fn();
		const fetchMock = mock.fn(
			async () =>
				new Response(JSON.stringify({ detail: "Unauthorized" }), {
					status: 401,
				}),
		);
		global.fetch = fetchMock;

		const refreshFetcher = fetchBuilder("https://example.com", {
			refreshAuth,
			onUnauthorized: onUnauthorizedMock,
		});

		await assert.rejects(
			() =>
				refreshFetcher
					.post<object, ReadableStream>("/media")
					.fetch(new Blob(["abc"]).stream()),
			{ name: "ApiError", status: 401 },
		);
		assert.equal(refreshAuth.mock.callCount(), 1);
		assert.equal(fetchMock.mock.callCount(), 1);
		assert.equal(onUnauthorizedMock.mock.callCount(), 0);
	});
});

describe("fetch-builder query string", () => {
	test("should keep the query string of the path next to the options", async () => {
		const urls: string[] = [];
		global.fetch = async (input) => {
			urls.push(input.toString());
			return new Response(JSON.stringify({ items: [] }), { status: 200 });
		};

		const builder = fetcher.get<{ items: object[] }>("/items?page=2");
		await builder
			.withOptions({ sortBy: [{ id: "name", desc: false }] })
			.fetch();
		await builder.withOptions({}).fetch();

		assert.deepEqual(urls, [
			"https://example.com/items?page=2&order%5Bname%5D=ASC",
			"https://example.com/items?page=2",
		]);
	});
});

describe("fetch-builder fetchRaw", () => {
	test("should resolve with the response of a file download", async () => {
		global.fetch = async (input, init) => {
			const headers = new Headers(init?.headers);
			assert.equal(input, "https://example.com/users?status=active");
			assert.equal(headers.get("Authorization"), "Bearer some-complex-token");
			assert.equal(headers.get("Accept"), "text/csv");
			return new Response("id;name\n1;Alice", {
				status: 200,
				headers: { "Content-Disposition": 'attachment; filename="users.csv"' },
			});
		};

		const response = await fetcher
			.get<object>("/users")
			.withOptions({ filters: [{ id: "status", value: "active" }] })
			.withHeaders({ Accept: "text/csv" })
			.fetchRaw();

		assert.equal(
			response.headers.get("Content-Disposition"),
			'attachment; filename="users.csv"',
		);
		assert.equal(await response.text(), "id;name\n1;Alice");
	});

	test("should throw an ApiError on an error response", async () => {
		global.fetch = async () =>
			new Response(JSON.stringify({ detail: "Not found" }), { status: 404 });

		await assert.rejects(
			() => fetcher.post<null, object>("/reports").withBody({}).fetchRaw(),
			{ name: "ApiError", status: 404, body: { detail: "Not found" } },
		);
	});
});

describe("fetch-builder entrypoint path", () => {
	const urls: string[] = [];
	const prefixed = fetchBuilder("https://example.com/api/");

	test("should prepend the entrypoint path unless the path already has it", async () => {
		global.fetch = async (input) => {
			urls.push(input.toString());
			return new Response(JSON.stringify({ data: "ok" }), { status: 200 });
		};

		await prefixed.get<object>("/users").fetch();
		await prefixed.get<object>("users/1").fetch();
		await prefixed.get<object>("/api/users/1").fetch();
		await prefixed.get<object>("/api-keys?page=2").fetch();
		await prefixed.get<object>("https://example.com/media/1").fetch();

		assert.deepEqual(urls, [
			"https://example.com/api/users",
			"https://example.com/api/users/1",
			"https://example.com/api/users/1",
			"https://example.com/api/api-keys?page=2",
			"https://example.com/media/1",
		]);
	});
});

describe("fetch-builder originAliases", () => {
	test("should send a URL of an alias origin to the entrypoint", async () => {
		const urls: string[] = [];
		global.fetch = async (input) => {
			urls.push(input.toString());
			return new Response(JSON.stringify({ data: "ok" }), { status: 200 });
		};

		const proxied = fetchBuilder("https://example.com/api", {
			originAliases: ["http://internal.test:8080/"],
		});

		await proxied
			.get<object>("http://internal.test:8080/users/1?page=2")
			.fetch();
		await proxied.get<object>("http://internal.test:8080/api/users/1").fetch();
		await assert.rejects(
			() => proxied.get<object>("http://internal.test/users/1").fetch(),
			TypeError,
		);

		assert.deepEqual(urls, [
			"https://example.com/api/users/1?page=2",
			"https://example.com/api/users/1",
		]);
	});
});

describe("fetch-builder date filters", () => {
	test("should send a date of a filter record as an ISO string", async () => {
		const urls: string[] = [];
		global.fetch = async (input) => {
			urls.push(input.toString());
			return new Response(JSON.stringify({ items: [] }), { status: 200 });
		};

		await fetcher
			.get<{ items: object[] }>("/items")
			.withOptions({
				filters: [
					{
						id: "publishedAt",
						value: { after: new Date("2020-01-01T00:00:00Z") },
					},
				],
			})
			.fetch();

		assert.deepEqual(urls, [
			"https://example.com/items?publishedAt%5Bafter%5D=2020-01-01T00%3A00%3A00.000Z",
		]);
	});
});

describe("fetch-builder default GET options", () => {
	test("should only send the options that are set", async () => {
		const urls: string[] = [];
		global.fetch = async (input) => {
			urls.push(input.toString());
			return new Response(JSON.stringify({ items: [] }), { status: 200 });
		};

		const builder = fetcher.get<{ items: object[] }>("/items");
		await builder.withOptions({ sortBy: [{ id: "name", desc: true }] }).fetch();
		await builder.withOptions({ pageSize: 50 }).fetch();
		await builder
			.withOptions({ filters: [{ id: "active", value: true }] })
			.fetch();

		assert.deepEqual(urls, [
			"https://example.com/items?order%5Bname%5D=DESC",
			"https://example.com/items?itemsPerPage=50",
			"https://example.com/items?active=true",
		]);
	});
});
