import { test, describe, mock, type Mock } from "node:test";
import assert from "node:assert/strict";

import entityServiceBuilder from "./entity-service-builder.ts";
import fetchBuilder from "./fetch-builder.ts";
import type { Iri } from "@/types/iri.ts";
import type { Item } from "@/types/item.ts";
import type { Collection } from "@/types/collection.ts";

type EntityIri = Iri<"entities">;
type EntityBody = { name: string };
type Entity = EntityBody & { calculatedName?: string };

const getToken = () => "some-complex-token";
const onUnauthorized = mock.fn();

const fetcher = fetchBuilder("https://example.com", {
	getToken,
	onUnauthorized,
});

const entityPath = "/entities";
const entityService = entityServiceBuilder<EntityIri, EntityBody, Entity>(
	fetcher,
	entityPath
);

describe("entityServiceBuilder", () => {
	test("should create an entity", async () => {
		const body: EntityBody = { name: "Test Entity" };
		const response: Item<Entity, EntityIri> = {
			"@context": "",
			"@type": "",
			"@id": "/entities/1",
			name: "Test Entity",
		};

		const postMocked = mock.fn(
			fetcher.post<Item<Entity, EntityIri>, EntityBody>
		);
		postMocked.mock.mockImplementationOnce(() => ({
			fetch: async () => ({ success: true, data: response }),
		}));
		fetcher.post = postMocked as unknown as typeof fetcher.post;

		const result = await entityService.create(body);

		assert.strictEqual(postMocked.mock.callCount(), 1);
		assert.strictEqual(postMocked.mock.calls[0].arguments[0], entityPath);
		assert.strictEqual(result.success, true);
		assert.deepStrictEqual(result.data, response);
	});

	test("should get an entity by Iri", async () => {
		const iri: EntityIri = "/entities/1";
		const response: Item<Entity, EntityIri> = {
			"@context": "",
			"@type": "",
			"@id": iri,
			name: "Test Entity",
		};

		const getMocked = mock.fn(fetcher.get<Item<Entity, EntityIri>>);
		getMocked.mock.mockImplementationOnce(
			() =>
				({
					fetch: async () => ({ success: true, data: response }),
				} as unknown as ReturnType<typeof fetcher.get<Item<Entity, EntityIri>>>)
		);
		fetcher.get = getMocked as unknown as typeof fetcher.get;

		const result = await entityService.get(iri);

		assert.strictEqual(getMocked.mock.callCount(), 1);
		assert.strictEqual(getMocked.mock.calls[0].arguments[0], iri);
		assert.strictEqual(result.success, true);
		assert.deepStrictEqual(result.data, response);
	});

	test("should get an entity by id with options", async () => {
		const iri: EntityIri = "/entities/1";
		const response: Omit<Item<Entity, EntityIri>, "name"> = {
			"@context": "",
			"@type": "",
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
				} as unknown as ReturnType<typeof fetcher.get<Item<Entity, EntityIri>>>)
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
				getMocked.mock.calls[0].result!.withOptions as unknown as Mock<Function>
			).mock.callCount(),
			1
		);
		assert.strictEqual(
			(getMocked.mock.calls[0].result!.withOptions as unknown as Mock<Function>)
				.mock.calls[0].arguments[0],
			getOptions
		);
		assert.strictEqual(result.success, true);
		assert.deepStrictEqual(result.data, response);
	});

	test("should get all entities", async () => {
		const response: Collection<Entity, EntityIri> = {
			"@context": "",
			"@type": "hydra:Collection",
			"@id": "/entities/1",
			"hydra:member": [
				{
					"@context": "",
					"@type": "",
					"@id": "/entities/1",
					name: "Test Entity",
				},
			],
			"hydra:totalItems": 1,
		};

		const getMocked = mock.fn(fetcher.get<Item<Entity, EntityIri>>);
		getMocked.mock.mockImplementationOnce(
			() =>
				({
					fetch: async () => ({ success: true, data: response }),
				} as unknown as ReturnType<typeof fetcher.get<Item<Entity, EntityIri>>>)
		);
		fetcher.get = getMocked as unknown as typeof fetcher.get;

		const result = await entityService.getAll();

		assert.strictEqual(getMocked.mock.callCount(), 1);
		assert.strictEqual(getMocked.mock.calls[0].arguments[0], entityPath);
		assert.strictEqual(result.success, true);
		assert.deepStrictEqual(result.data, response);
	});

	test("should get all entities with options", async () => {
		const response: Collection<Entity, EntityIri> = {
			"@context": "",
			"@type": "hydra:Collection",
			"@id": "/entities/1",
			"hydra:member": [
				{
					"@context": "",
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
				} as unknown as ReturnType<typeof fetcher.get<Item<Entity, EntityIri>>>)
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
				getMocked.mock.calls[0].result!.withOptions as unknown as Mock<Function>
			).mock.callCount(),
			1
		);
		assert.strictEqual(
			(getMocked.mock.calls[0].result!.withOptions as unknown as Mock<Function>)
				.mock.calls[0].arguments[0],
			getOptions
		);
		assert.strictEqual(result.success, true);
		assert.deepStrictEqual(result.data, response);
	});

	test("should update an entity by Iri", async () => {
		const iri: EntityIri = "/entities/1";
		const body = { name: "Updated Entity" };
		const response: Item<Entity, EntityIri> = {
			"@context": "",
			"@type": "",
			"@id": iri,
			name: "Updated Entity",
		};

		const patchMocked = mock.fn(
			fetcher.patch<Item<Entity, EntityIri>, EntityBody>
		);
		patchMocked.mock.mockImplementationOnce(() => ({
			fetch: async () => ({ success: true, data: response }),
		}));
		fetcher.patch = patchMocked as unknown as typeof fetcher.patch;

		const result = await entityService.update(iri, body);

		assert.strictEqual(patchMocked.mock.callCount(), 1);
		assert.strictEqual(
			patchMocked.mock.calls[0].arguments[0],
			`${entityPath}/1`
		);
		assert.strictEqual(result.success, true);
		assert.deepStrictEqual(result.data, response);
	});

	test("should update an entity by id", async () => {
		const id = 1;
		const body = { name: "Updated Entity" };
		const response: Item<Entity, EntityIri> = {
			"@context": "",
			"@type": "",
			"@id": `/entities/${id}`,
			name: "Updated Entity",
		};

		const patchMocked = mock.fn(
			fetcher.patch<Item<Entity, EntityIri>, EntityBody>
		);
		patchMocked.mock.mockImplementationOnce(() => ({
			fetch: async () => ({ success: true, data: response }),
		}));
		fetcher.patch = patchMocked as unknown as typeof fetcher.patch;

		const result = await entityService.update(id, body);

		assert.strictEqual(patchMocked.mock.callCount(), 1);
		assert.strictEqual(
			patchMocked.mock.calls[0].arguments[0],
			`${entityPath}/${id}`
		);
		assert.strictEqual(result.success, true);
		assert.deepStrictEqual(result.data, response);
	});

	test("should update an entity by id in the body", async () => {
		const id = 1;
		const body = { "@id": `/entities/${id}`, name: "Updated Entity" } as const;
		const response: Item<Entity, EntityIri> = {
			"@context": "",
			"@type": "",
			"@id": `/entities/${id}`,
			name: "Updated Entity",
		};

		const patchMocked = mock.fn(
			fetcher.patch<Item<Entity, EntityIri>, EntityBody>
		);
		patchMocked.mock.mockImplementationOnce(() => ({
			fetch: async () => ({ success: true, data: response }),
		}));
		fetcher.patch = patchMocked as unknown as typeof fetcher.patch;

		const result = await entityService.update(body);

		assert.strictEqual(patchMocked.mock.callCount(), 1);
		assert.strictEqual(
			patchMocked.mock.calls[0].arguments[0],
			`${entityPath}/${id}`
		);
		assert.strictEqual(result.success, true);
		assert.deepStrictEqual(result.data, response);
	});

	test("should replace an entity by Iri", async () => {
		const iri: EntityIri = "/entities/1";
		const body = { name: "Updated Entity" };
		const response: Item<Entity, EntityIri> = {
			"@context": "",
			"@type": "",
			"@id": iri,
			name: "Updated Entity",
		};

		const putMocked = mock.fn(fetcher.put<Item<Entity, EntityIri>, EntityBody>);
		putMocked.mock.mockImplementationOnce(() => ({
			fetch: async () => ({ success: true, data: response }),
		}));
		fetcher.put = putMocked as unknown as typeof fetcher.put;

		const result = await entityService.replace(iri, body);

		assert.strictEqual(putMocked.mock.callCount(), 1);
		assert.strictEqual(putMocked.mock.calls[0].arguments[0], `${entityPath}/1`);
		assert.strictEqual(result.success, true);
		assert.deepStrictEqual(result.data, response);
	});

	test("should replace an entity by id", async () => {
		const id = 1;
		const body = { name: "Updated Entity" };
		const response: Item<Entity, EntityIri> = {
			"@context": "",
			"@type": "",
			"@id": `/entities/${id}`,
			name: "Updated Entity",
		};

		const putMocked = mock.fn(fetcher.put<Item<Entity, EntityIri>, EntityBody>);
		putMocked.mock.mockImplementationOnce(() => ({
			fetch: async () => ({ success: true, data: response }),
		}));
		fetcher.put = putMocked as unknown as typeof fetcher.put;

		const result = await entityService.replace(id, body);

		assert.strictEqual(putMocked.mock.callCount(), 1);
		assert.strictEqual(
			putMocked.mock.calls[0].arguments[0],
			`${entityPath}/${id}`
		);
		assert.strictEqual(result.success, true);
		assert.deepStrictEqual(result.data, response);
	});

	test("should replace an entity by id in the body", async () => {
		const id = 1;
		const body = { "@id": `/entities/${id}`, name: "Updated Entity" } as const;
		const response: Item<Entity, EntityIri> = {
			"@context": "",
			"@type": "",
			"@id": `/entities/${id}`,
			name: "Updated Entity",
		};

		const putMocked = mock.fn(fetcher.put<Item<Entity, EntityIri>, EntityBody>);
		putMocked.mock.mockImplementationOnce(() => ({
			fetch: async () => ({ success: true, data: response }),
		}));
		fetcher.put = putMocked as unknown as typeof fetcher.put;

		const result = await entityService.replace(body);

		assert.strictEqual(putMocked.mock.callCount(), 1);
		assert.strictEqual(
			putMocked.mock.calls[0].arguments[0],
			`${entityPath}/${id}`
		);
		assert.strictEqual(result.success, true);
		assert.deepStrictEqual(result.data, response);
	});

	test("should delete an entity by Iri", async () => {
		const iri: EntityIri = "/entities/1";

		const deleteMocked = mock.fn(fetcher.delete);
		deleteMocked.mock.mockImplementationOnce(() => ({
			fetch: async () => ({ success: true, data: null }),
		}));
		fetcher.delete = deleteMocked as unknown as typeof fetcher.delete;

		const result = await entityService.delete(iri);

		assert.strictEqual(deleteMocked.mock.callCount(), 1);
		assert.strictEqual(
			deleteMocked.mock.calls[0].arguments[0],
			`${entityPath}/1`
		);
		assert.strictEqual(result.success, true);
		assert.deepStrictEqual(result.data, null);
	});
});
