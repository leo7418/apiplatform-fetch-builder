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

const getToken = () => "some-complex-token";
const entityPath = "/entities";

const makeService = () => {
	const fetcher = fetchBuilder("https://example.com", {
		getToken,
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

		assert.ok(result.success);
		assert.deepStrictEqual(result.data, response);
	});

	test("should get an entity by Iri", async () => {
		const { fetcher, entityService } = makeService();
		const iri: EntityIri = "/entities/1";
		const response = makeItem(1, "Test Entity");

		const getMocked = mock.fn(fetcher.get<Item<Entity, EntityIri>>);
		getMocked.mock.mockImplementationOnce(
			() =>
				({
					fetch: async () => ({ success: true, data: response }),
				}) as unknown as ReturnType<
					typeof fetcher.get<Item<Entity, EntityIri>>
				>,
		);
		fetcher.get = getMocked as unknown as typeof fetcher.get;

		const result = await entityService.get(iri);

		assert.strictEqual(getMocked.mock.callCount(), 1);
		assert.strictEqual(getMocked.mock.calls[0].arguments[0], iri);
		assert.ok(result.success);
		assert.deepStrictEqual(result.data, response);
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
						fetch: async () => ({ success: true, data: response }),
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
		assert.ok(result.success);
		assert.deepStrictEqual(result.data, response);
	});

	test("should get all entities", async () => {
		const { fetcher, entityService } = makeService();
		const response: Collection<Entity, EntityIri> = {
			"@context": "",
			"@type": "hydra:Collection",
			"@id": "/entities/1",
			"hydra:member": [makeItem(1, "Test Entity")],
			"hydra:totalItems": 1,
		};

		const getMocked = mock.fn(fetcher.get<Item<Entity, EntityIri>>);
		getMocked.mock.mockImplementationOnce(
			() =>
				({
					fetch: async () => ({ success: true, data: response }),
				}) as unknown as ReturnType<
					typeof fetcher.get<Item<Entity, EntityIri>>
				>,
		);
		fetcher.get = getMocked as unknown as typeof fetcher.get;

		const result = await entityService.getAll();

		assert.strictEqual(getMocked.mock.callCount(), 1);
		assert.strictEqual(getMocked.mock.calls[0].arguments[0], entityPath);
		assert.ok(result.success);
		assert.deepStrictEqual(result.data, response);
	});

	test("should get all entities with options", async () => {
		const { fetcher, entityService } = makeService();
		const response: Collection<Entity, EntityIri> = {
			"@context": "",
			"@type": "hydra:Collection",
			"@id": "/entities/1",
			"hydra:member": [
				{
					"@type": "",
					"@id": "/entities/1",
					calculatedName: "Test Entity",
				} as unknown as Item<Entity, EntityIri>,
			],
			"hydra:totalItems": 1,
		};

		const getMocked = mock.fn(fetcher.get<Item<Entity, EntityIri>>);
		getMocked.mock.mockImplementationOnce(
			() =>
				({
					withOptions: mock.fn(() => ({
						fetch: async () => ({ success: true, data: response }),
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
		assert.ok(result.success);
		assert.deepStrictEqual(result.data, response);
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

		assert.ok(result.success);
		assert.deepStrictEqual(result.data, response);
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

		assert.ok(result.success);
		assert.deepStrictEqual(result.data, response);
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

		assert.ok(result.success);
		assert.deepStrictEqual(result.data, response);
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

		assert.ok(result.success);
		assert.deepStrictEqual(result.data, response);
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

		assert.ok(result.success);
		assert.deepStrictEqual(result.data, response);
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

		assert.ok(result.success);
		assert.deepStrictEqual(result.data, response);
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

		assert.ok(result.success);
		assert.deepStrictEqual(result.data, response);
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

		assert.ok(result.success);
		assert.deepStrictEqual(result.data, response);
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

		assert.ok(result.success);
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

		assert.ok(result.success);
		assert.deepStrictEqual(result.data, null);
	});
});
