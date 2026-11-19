import { test, describe, mock, type Mock } from "node:test";
import assert from "node:assert/strict";

import entityServiceBuilder from "./entity-service-builder.ts";
import fetchBuilder from "./fetch-builder.ts";
import type { Iri } from "../types/iri.ts";
import type { Item } from "../types/item.ts";
import type { Collection } from "../types/collection.ts";

type EntityIri = Iri<"entities">;
type EntityBody = { name: string };
type Entity = EntityBody & { calculatedName?: string };

const entityPath = "/entities";

const makeService = () => {
	const fetcher = fetchBuilder("https://example.com", {
		headers: { Authorization: "Bearer some-complex-token" },
		onUnauthorized: mock.fn() as () => void,
	});
	const entityService = entityServiceBuilder<EntityIri, EntityBody, Entity>(
		fetcher,
		entityPath,
	);
	return { fetcher, entityService };
};

const makeItem = (id: number, name: string): Item<Entity, EntityIri> => ({
	"@context": "/contexts/Entity",
	"@type": "Entity",
	"@id": `/entities/${id}`,
	name,
});

describe("entityServiceBuilder", () => {
	test("should create an entity", async () => {
		const { entityService } = makeService();
		const body: EntityBody = { name: "Test Entity" };
		const response = makeItem(1, "Test Entity");

		global.fetch = async (input, init) => {
			assert.equal(input, `https://example.com${entityPath}`);
			assert.equal(init?.method, "POST");
			assert.deepEqual(JSON.parse(init?.body as string), body);
			return new Response(JSON.stringify(response), { status: 201 });
		};

		const result = await entityService.create(body);

		assert.deepStrictEqual(result, response);
	});

	test("should get an entity by Iri", async () => {
		const { fetcher, entityService } = makeService();
		const iri: EntityIri = "/entities/1";
		const response = makeItem(1, "Test Entity");

		const getMocked = mock.fn(fetcher.get<Item<Entity, EntityIri>>);
		getMocked.mock.mockImplementationOnce(
			() =>
				({
					fetch: async () => response,
				}) as unknown as ReturnType<
					typeof fetcher.get<Item<Entity, EntityIri>>
				>,
		);
		fetcher.get = getMocked as unknown as typeof fetcher.get;

		const result = await entityService.get(iri);

		assert.strictEqual(getMocked.mock.callCount(), 1);
		assert.strictEqual(getMocked.mock.calls[0].arguments[0], iri);
		assert.deepStrictEqual(result, response);
	});

	test("should get an entity by id with options", async () => {
		const { fetcher, entityService } = makeService();
		const iri: EntityIri = "/entities/1";
		const response: Omit<Item<Entity, EntityIri>, "name"> = {
			"@context": "/contexts/Entity",
			"@type": "Entity",
			"@id": iri,
			calculatedName: "Test Entity",
		};

		const getMocked = mock.fn(fetcher.get<Item<Entity, EntityIri>>);
		getMocked.mock.mockImplementationOnce(
			() =>
				({
					withOptions: mock.fn(() => ({
						fetch: async () => response,
					})),
				}) as unknown as ReturnType<
					typeof fetcher.get<Item<Entity, EntityIri>>
				>,
		);
		fetcher.get = getMocked as unknown as typeof fetcher.get;

		const getOptions = { properties: ["calculatedName"] } as NonNullable<
			Parameters<typeof entityService.get>[1]
		>;
		const result = await entityService.get(iri, getOptions);

		assert.strictEqual(getMocked.mock.callCount(), 1);
		assert.strictEqual(getMocked.mock.calls[0].arguments[0], iri);
		assert.strictEqual(
			(
				getMocked.mock.calls[0].result!.withOptions as unknown as Mock<
					(...args: unknown[]) => unknown
				>
			).mock.callCount(),
			1,
		);
		assert.strictEqual(
			(
				getMocked.mock.calls[0].result!.withOptions as unknown as Mock<
					(...args: unknown[]) => unknown
				>
			).mock.calls[0].arguments[0],
			getOptions,
		);
		assert.deepStrictEqual(result, response);
	});

	test("should get all entities", async () => {
		const { fetcher, entityService } = makeService();
		const response: Collection<Entity, EntityIri> = {
			"@context": "",
			"@type": "Collection",
			"@id": "/entities/1",
			member: [makeItem(1, "Test Entity")],
			totalItems: 1,
		};

		const getMocked = mock.fn(fetcher.get<Item<Entity, EntityIri>>);
		getMocked.mock.mockImplementationOnce(
			() =>
				({
					fetch: async () => response,
				}) as unknown as ReturnType<
					typeof fetcher.get<Item<Entity, EntityIri>>
				>,
		);
		fetcher.get = getMocked as unknown as typeof fetcher.get;

		const result = await entityService.getAll();

		assert.strictEqual(getMocked.mock.callCount(), 1);
		assert.strictEqual(getMocked.mock.calls[0].arguments[0], entityPath);
		assert.deepStrictEqual(result, response);
	});

	test("should get all entities with options", async () => {
		const { fetcher, entityService } = makeService();
		const response: Collection<Entity, EntityIri> = {
			"@context": "",
			"@type": "Collection",
			"@id": "/entities/1",
			member: [
				{
					"@type": "",
					"@id": "/entities/1",
					calculatedName: "Test Entity",
				} as unknown as Item<Entity, EntityIri>,
			],
			totalItems: 1,
		};

		const getMocked = mock.fn(fetcher.get<Item<Entity, EntityIri>>);
		getMocked.mock.mockImplementationOnce(
			() =>
				({
					withOptions: mock.fn(() => ({
						fetch: async () => response,
					})),
				}) as unknown as ReturnType<
					typeof fetcher.get<Item<Entity, EntityIri>>
				>,
		);
		fetcher.get = getMocked as unknown as typeof fetcher.get;

		const getOptions = { properties: ["calculatedName"] } as NonNullable<
			Parameters<typeof entityService.get>[1]
		>;
		const result = await entityService.getAll(getOptions);

		assert.strictEqual(getMocked.mock.callCount(), 1);
		assert.strictEqual(getMocked.mock.calls[0].arguments[0], entityPath);
		assert.strictEqual(
			(
				getMocked.mock.calls[0].result!.withOptions as unknown as Mock<
					(...args: unknown[]) => unknown
				>
			).mock.callCount(),
			1,
		);
		assert.strictEqual(
			(
				getMocked.mock.calls[0].result!.withOptions as unknown as Mock<
					(...args: unknown[]) => unknown
				>
			).mock.calls[0].arguments[0],
			getOptions,
		);
		assert.deepStrictEqual(result, response);
	});

	test("should update an entity by Iri", async () => {
		const { entityService } = makeService();
		const iri: EntityIri = "/entities/1";
		const body = { name: "Updated Entity" };
		const response = makeItem(1, "Updated Entity");

		global.fetch = async (input, init) => {
			assert.equal(input, `https://example.com${iri}`);
			assert.equal(init?.method, "PATCH");
			assert.deepEqual(JSON.parse(init?.body as string), body);
			return new Response(JSON.stringify(response), { status: 200 });
		};

		const result = await entityService.update(iri, body);

		assert.deepStrictEqual(result, response);
	});

	test("should update an entity by id", async () => {
		const { entityService } = makeService();
		const id = 1;
		const body = { name: "Updated Entity" };
		const response = makeItem(id, "Updated Entity");

		global.fetch = async (input, init) => {
			assert.equal(input, `https://example.com${entityPath}/${id}`);
			assert.equal(init?.method, "PATCH");
			assert.deepEqual(JSON.parse(init?.body as string), body);
			return new Response(JSON.stringify(response), { status: 200 });
		};

		const result = await entityService.update(id, body);

		assert.deepStrictEqual(result, response);
	});

	test("should update an entity by body with @id", async () => {
		const { entityService } = makeService();
		const id = 1;
		const bodyWithId = {
			"@id": `/entities/${id}` as EntityIri,
			name: "Updated Entity",
		};
		const response = makeItem(id, "Updated Entity");

		global.fetch = async (input, init) => {
			assert.equal(input, `https://example.com${entityPath}/${id}`);
			assert.equal(init?.method, "PATCH");
			return new Response(JSON.stringify(response), { status: 200 });
		};

		const result = await entityService.update(bodyWithId);

		assert.deepStrictEqual(result, response);
	});

	test("should replace an entity by Iri", async () => {
		const { entityService } = makeService();
		const iri: EntityIri = "/entities/1";
		const body: EntityBody = { name: "Updated Entity" };
		const response = makeItem(1, "Updated Entity");

		global.fetch = async (input, init) => {
			assert.equal(input, `https://example.com${iri}`);
			assert.equal(init?.method, "PUT");
			assert.deepEqual(JSON.parse(init?.body as string), body);
			return new Response(JSON.stringify(response), { status: 200 });
		};

		const result = await entityService.replace(iri, body);

		assert.deepStrictEqual(result, response);
	});

	test("should replace an entity by id", async () => {
		const { entityService } = makeService();
		const id = 1;
		const body: EntityBody = { name: "Updated Entity" };
		const response = makeItem(id, "Updated Entity");

		global.fetch = async (input, init) => {
			assert.equal(input, `https://example.com${entityPath}/${id}`);
			assert.equal(init?.method, "PUT");
			assert.deepEqual(JSON.parse(init?.body as string), body);
			return new Response(JSON.stringify(response), { status: 200 });
		};

		const result = await entityService.replace(id, body);

		assert.deepStrictEqual(result, response);
	});

	test("should replace an entity by body with @id", async () => {
		const { entityService } = makeService();
		const id = 1;
		const bodyWithId = {
			"@id": `/entities/${id}` as EntityIri,
			name: "Updated Entity",
		};
		const response = makeItem(id, "Updated Entity");

		global.fetch = async (input, init) => {
			assert.equal(input, `https://example.com${entityPath}/${id}`);
			assert.equal(init?.method, "PUT");
			return new Response(JSON.stringify(response), { status: 200 });
		};

		const result = await entityService.replace(bodyWithId);

		assert.deepStrictEqual(result, response);
	});

	test("upsert: should call create when body has no id", async () => {
		const { entityService } = makeService();
		const body: EntityBody = { name: "New Entity" };
		const response = makeItem(1, "New Entity");

		global.fetch = async (_input, init) => {
			assert.equal(init?.method, "POST");
			return new Response(JSON.stringify(response), { status: 201 });
		};

		const result = await entityService.upsert(body);

		assert.deepStrictEqual(result, response);
	});

	test("upsert: should call update when body has @id", async () => {
		const { entityService } = makeService();
		const body = { "@id": "/entities/1" as EntityIri, name: "Updated Entity" };
		const response = makeItem(1, "Updated Entity");

		global.fetch = async (input, init) => {
			assert.equal(input, `https://example.com${entityPath}/1`);
			assert.equal(init?.method, "PATCH");
			return new Response(JSON.stringify(response), { status: 200 });
		};

		const result = await entityService.upsert(body);

		assert.deepStrictEqual(result, response);
	});

	test("upsert: should call update when body has numeric id", async () => {
		const { entityService } = makeService();
		const body = { id: 1, name: "Updated Entity" };
		const response = makeItem(1, "Updated Entity");

		global.fetch = async (input, init) => {
			assert.equal(input, `https://example.com${entityPath}/1`);
			assert.equal(init?.method, "PATCH");
			return new Response(JSON.stringify(response), { status: 200 });
		};

		const result = await entityService.upsert(body);

		assert.deepStrictEqual(result, response);
	});

	test("upsert: should call update when body has id 0", async () => {
		const { entityService } = makeService();
		const response = makeItem(0, "Updated Entity");

		global.fetch = async (input, init) => {
			assert.equal(input, `https://example.com${entityPath}/0`);
			assert.equal(init?.method, "PATCH");
			return new Response(JSON.stringify(response), { status: 200 });
		};

		const result = await entityService.upsert({
			id: 0,
			name: "Updated Entity",
		});

		assert.deepStrictEqual(result, response);
	});

	test("getAllPages: should return empty collection when totalItems is 0", async () => {
		const { entityService } = makeService();

		global.fetch = async () =>
			new Response(
				JSON.stringify({
					"@context": "",
					"@type": "Collection",
					"@id": entityPath,
					member: [],
					totalItems: 0,
				} satisfies Collection<Entity, EntityIri>),
				{ status: 200 },
			);

		const result = await entityService.getAllPages();

		assert.deepStrictEqual(result.member, []);
		assert.strictEqual(result.totalItems, 0);
	});

	test("getAllPages: should fetch all pages and concatenate members", async () => {
		const { entityService } = makeService();
		const allMembers = [makeItem(1, "A"), makeItem(2, "B"), makeItem(3, "C")];
		let callCount = 0;

		global.fetch = async () => {
			callCount++;
			// callCount 1 = probe (1 item), callCount 2 = full page
			const members = callCount === 1 ? [allMembers[0]] : allMembers;
			return new Response(
				JSON.stringify({
					"@context": "",
					"@type": "Collection",
					"@id": entityPath,
					member: members,
					totalItems: 3,
				} satisfies Collection<Entity, EntityIri>),
				{ status: 200 },
			);
		};

		const result = await entityService.getAllPages();

		assert.strictEqual(result.totalItems, 3);
		assert.strictEqual(result.member.length, 3);
	});

	test("getAllPages: should stop at probe when onProgress returns false on page 0", async () => {
		const { entityService } = makeService();

		global.fetch = async () =>
			new Response(
				JSON.stringify({
					"@context": "",
					"@type": "Collection",
					"@id": entityPath,
					member: [makeItem(1, "A")],
					totalItems: 10,
				} satisfies Collection<Entity, EntityIri>),
				{ status: 200 },
			);

		const result = await entityService.getAllPages(({ page }) =>
			page === 0 ? false : undefined,
		);

		assert.strictEqual(result.member.length, 0);
	});

	test("getAllPages: should stop after first page when onProgress returns false", async () => {
		const { entityService } = makeService();
		let callCount = 0;

		global.fetch = async () => {
			callCount++;
			const isProbe = callCount === 1;
			return new Response(
				JSON.stringify({
					"@context": "",
					"@type": "Collection",
					"@id": entityPath,
					member: isProbe
						? [makeItem(1, "A")]
						: [makeItem(1, "A"), makeItem(2, "B")],
					totalItems: 10,
				} satisfies Collection<Entity, EntityIri>),
				{ status: 200 },
			);
		};

		const result = await entityService.getAllPages(({ page }) =>
			page >= 1 ? false : undefined,
		);

		assert.strictEqual(result.member.length, 2);
	});

	test("getAllPages: should call onProgress with correct values", async () => {
		const { entityService } = makeService();
		const progressCalls: number[] = [];
		let callCount = 0;

		global.fetch = async () => {
			callCount++;
			const isProbe = callCount === 1;
			return new Response(
				JSON.stringify({
					"@context": "",
					"@type": "Collection",
					"@id": entityPath,
					member: isProbe
						? [makeItem(1, "A")]
						: [makeItem(1, "A"), makeItem(2, "B")],
					totalItems: 2,
				} satisfies Collection<Entity, EntityIri>),
				{ status: 200 },
			);
		};

		await entityService.getAllPages(({ progressPercent }) => {
			progressCalls.push(progressPercent);
		});

		assert.ok(progressCalls.length >= 1);
		assert.strictEqual(progressCalls[progressCalls.length - 1], 100);
	});

	test("getAllPages: should fetch every page when the server ignores the page size", async () => {
		const { entityService } = makeService();
		const allMembers = [1, 2, 3, 4, 5].map((id) =>
			makeItem(id, `Entity ${id}`),
		);
		let callCount = 0;

		global.fetch = async (input) => {
			callCount++;
			const page = Number(new URL(input.toString()).searchParams.get("page"));
			return new Response(
				JSON.stringify({
					"@context": "",
					"@type": "Collection",
					"@id": entityPath,
					member: allMembers.slice((page - 1) * 2, page * 2),
					totalItems: 5,
					view: {
						"@id": `${entityPath}?page=${page}`,
						"@type": "PartialCollectionView",
					},
				} satisfies Collection<Entity, EntityIri>),
				{ status: 200 },
			);
		};

		const result = await entityService.getAllPages();

		assert.deepStrictEqual(result.member, allMembers);
		assert.strictEqual(result.totalItems, 5);
		assert.strictEqual(result.view, undefined);
		assert.strictEqual(callCount, 4);
	});

	test("getAllPages: should read a collection with the hydra: prefix", async () => {
		const { entityService } = makeService();
		const allMembers = [makeItem(1, "A"), makeItem(2, "B"), makeItem(3, "C")];

		global.fetch = async () =>
			new Response(
				JSON.stringify({
					"@context": "",
					"@type": "hydra:Collection",
					"@id": entityPath,
					"hydra:member": allMembers,
					"hydra:totalItems": 3,
				}),
				{ status: 200 },
			);

		const result: Record<string, unknown> = await entityService.getAllPages();

		assert.deepStrictEqual(result["hydra:member"], allMembers);
		assert.strictEqual(result["hydra:totalItems"], 3);
	});

	test("getAllPages: should throw an ApiError when a page fails", async () => {
		const { entityService } = makeService();

		global.fetch = async () =>
			new Response(JSON.stringify({ detail: "Forbidden" }), { status: 403 });

		await assert.rejects(() => entityService.getAllPages(), {
			name: "ApiError",
			status: 403,
			body: { detail: "Forbidden" },
		});
	});

	test("should delete an entity by Iri", async () => {
		const { entityService } = makeService();
		const iri: EntityIri = "/entities/1";

		global.fetch = async (input, init) => {
			assert.equal(input, `https://example.com${iri}`);
			assert.equal(init?.method, "DELETE");
			return new Response(null, { status: 204 });
		};

		const result = await entityService.delete(iri);

		assert.deepStrictEqual(result, null);
	});

	test("should build the IRI from a string identifier", async () => {
		type BookIri = Iri<"books", string>;
		const bookService = entityServiceBuilder<BookIri, EntityBody, Entity>(
			"https://example.com",
			"/books",
		);
		const urls: string[] = [];

		global.fetch = async (input) => {
			urls.push(input.toString());
			return new Response(JSON.stringify({}), { status: 200 });
		};

		await bookService.get("f47ac10b-58cc-4372-a567-0e02b2c3d479");
		await bookService.get("/books/f47ac10b-58cc-4372-a567-0e02b2c3d479");
		await bookService.update({ id: "the-hobbit", name: "The Hobbit" });

		assert.deepStrictEqual(urls, [
			"https://example.com/books/f47ac10b-58cc-4372-a567-0e02b2c3d479",
			"https://example.com/books/f47ac10b-58cc-4372-a567-0e02b2c3d479",
			"https://example.com/books/the-hobbit",
		]);
	});
});
