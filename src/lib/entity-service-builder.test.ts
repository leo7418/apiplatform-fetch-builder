import { test, describe, mock, type Mock } from "node:test";
import assert from "node:assert/strict";

import entityServiceBuilder from "./entity-service-builder.ts";
import fetchBuilder from "./fetch-builder.ts";
import type { Iri } from "../types/iri.ts";
import type { Embedded, Item } from "../types/item.ts";
import type { Collection } from "../types/collection.ts";

type EntityIri = Iri<"entities">;
type EntityBody = { name: string };
type Entity = { name: string; readonly calculatedName?: string };

const entityPath = "/entities";

const makeService = () => {
	const fetcher = fetchBuilder("https://example.com", {
		headers: { Authorization: "Bearer some-complex-token" },
		onUnauthorized: mock.fn() as () => void,
	});
	const entityService = entityServiceBuilder<EntityIri, Entity>(
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

	test("should create an entity with its own id but without JSON-LD keys", async () => {
		const { entityService } = makeService();
		const item = makeItem(1, "Test Entity");

		global.fetch = async (_input, init) => {
			assert.deepEqual(JSON.parse(init?.body as string), {
				id: "f47ac10b",
				name: "Copy",
			});
			return new Response(JSON.stringify(item), { status: 201 });
		};

		const body = { ...item, id: "f47ac10b", name: "Copy" };
		await entityService.create(body);
	});

	test("should send a FormData body as it is", async () => {
		const mediaService = entityServiceBuilder<
			Iri<"media">,
			Entity,
			{ body: FormData }
		>("https://example.com", "/media");
		const form = new FormData();
		form.append("file", new Blob(["abc"]), "a.txt");
		const sent: unknown[] = [];

		global.fetch = async (_input, init) => {
			sent.push(init?.body);
			return new Response(JSON.stringify({}), { status: 201 });
		};

		await mediaService.create(form);
		await mediaService.upsert(form);

		assert.deepStrictEqual(sent, [form, form]);
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

	test("should get an entity by id with a query", async () => {
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
					withQuery: mock.fn(() => ({
						fetch: async () => response,
					})),
				}) as unknown as ReturnType<
					typeof fetcher.get<Item<Entity, EntityIri>>
				>,
		);
		fetcher.get = getMocked as unknown as typeof fetcher.get;

		const query = { properties: ["calculatedName"] } as NonNullable<
			Parameters<typeof entityService.get>[1]
		>;
		const result = await entityService.get(iri, query);

		assert.strictEqual(getMocked.mock.callCount(), 1);
		assert.strictEqual(getMocked.mock.calls[0].arguments[0], iri);
		assert.strictEqual(
			(
				getMocked.mock.calls[0].result!.withQuery as unknown as Mock<
					(...args: unknown[]) => unknown
				>
			).mock.callCount(),
			1,
		);
		assert.strictEqual(
			(
				getMocked.mock.calls[0].result!.withQuery as unknown as Mock<
					(...args: unknown[]) => unknown
				>
			).mock.calls[0].arguments[0],
			query,
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

	test("should get all entities with a query", async () => {
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
					withQuery: mock.fn(() => ({
						fetch: async () => response,
					})),
				}) as unknown as ReturnType<
					typeof fetcher.get<Item<Entity, EntityIri>>
				>,
		);
		fetcher.get = getMocked as unknown as typeof fetcher.get;

		const query = { properties: ["calculatedName"] } as NonNullable<
			Parameters<typeof entityService.get>[1]
		>;
		const result = await entityService.getAll(query);

		assert.strictEqual(getMocked.mock.callCount(), 1);
		assert.strictEqual(getMocked.mock.calls[0].arguments[0], entityPath);
		assert.strictEqual(
			(
				getMocked.mock.calls[0].result!.withQuery as unknown as Mock<
					(...args: unknown[]) => unknown
				>
			).mock.callCount(),
			1,
		);
		assert.strictEqual(
			(
				getMocked.mock.calls[0].result!.withQuery as unknown as Mock<
					(...args: unknown[]) => unknown
				>
			).mock.calls[0].arguments[0],
			query,
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

	test("should update an entity without its identity keys", async () => {
		const { entityService } = makeService();
		const item = makeItem(1, "Entity");

		global.fetch = async (_input, init) => {
			assert.deepEqual(JSON.parse(init?.body as string), {
				name: "Updated Entity",
			});
			return new Response(JSON.stringify(item), { status: 200 });
		};

		await entityService.update(item["@id"], {
			...item,
			name: "Updated Entity",
		});
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
			assert.deepEqual(JSON.parse(init?.body as string), {
				name: "Updated Entity",
			});
			return new Response(JSON.stringify(response), { status: 200 });
		};

		const result = await entityService.update(bodyWithId);

		assert.deepStrictEqual(result, response);
	});

	test("should send an embedded resource as its IRI", async () => {
		type CompanyIri = Iri<"companies">;
		type Company = Embedded<{ name: string }, CompanyIri>;
		type Article = {
			title: string;
			company: Company | CompanyIri;
			reviewers: (Company | CompanyIri)[];
			seo: { "@id": string; "@type": string; title: string; author: Company };
		};
		const articles = entityServiceBuilder<Iri<"articles">, Article>(
			"https://example.com",
			"/articles",
		);
		const company: Company = {
			"@id": "/companies/1",
			"@type": "Company",
			name: "Acme",
		};
		const seo = {
			"@id": "/.well-known/genid/abc",
			"@type": "Seo",
			title: "Hello",
			author: company,
		};
		const sent: unknown[] = [];
		global.fetch = async (_input, init) => {
			sent.push(JSON.parse(init?.body as string));
			return new Response(JSON.stringify({}), { status: 200 });
		};

		await articles.create({ title: "Hello", company });
		await articles.update(1, {
			company,
			reviewers: [company, "/companies/2"],
			seo,
		});

		assert.deepEqual(sent, [
			{ title: "Hello", company: "/companies/1" },
			{
				company: "/companies/1",
				reviewers: ["/companies/1", "/companies/2"],
				seo: { title: "Hello", author: "/companies/1" },
			},
		]);
	});

	test("should send an item back as it was read", async () => {
		type CompanyIri = Iri<"companies">;
		type Company = Embedded<{ name: string }, CompanyIri>;
		type Article = {
			readonly id: number;
			title: string;
			company: Company | CompanyIri;
			readonly slug: string;
		};
		const articles = entityServiceBuilder<Iri<"articles">, Article>(
			"https://example.com",
			"/articles",
		);
		const article: Item<Article, Iri<"articles">> = {
			"@context": "/contexts/Article",
			"@id": "/articles/7",
			"@type": "Article",
			id: 7,
			title: "Hello",
			company: { "@id": "/companies/1", "@type": "Company", name: "Acme" },
			slug: "hello",
		};
		const sent: unknown[] = [];
		global.fetch = async (input, init) => {
			sent.push([
				init?.method,
				String(input),
				JSON.parse(init?.body as string),
			]);
			return new Response(JSON.stringify(article), { status: 200 });
		};
		const body = { title: "Hello", company: "/companies/1", slug: "hello" };

		await articles.update(article);
		await articles.replace(article);
		await articles.upsert(article);
		await articles.create({ ...article, title: "Copy" });

		assert.deepEqual(sent, [
			["PATCH", "https://example.com/articles/7", body],
			["PUT", "https://example.com/articles/7", body],
			["PATCH", "https://example.com/articles/7", body],
			["POST", "https://example.com/articles", { ...body, title: "Copy" }],
		]);
	});

	test("should only replace an embedded resource of the API by its IRI", async () => {
		class Money {
			amount = 5;
		}
		type Loose = Record<string, unknown>;
		type Article = {
			schema: Loose;
			meta: Loose;
			draft: Loose;
			node: Loose;
			prefixed: Loose;
			price: unknown;
			publishedAt: unknown;
			matrix: unknown[][];
			company: Loose;
			partner: Loose;
			author: Loose;
			person: Loose;
			absolute: Loose;
			vocabulary: Loose;
		};
		const articles = entityServiceBuilder<Iri<"articles">, Article>(
			"https://example.com",
			"/articles",
		);
		const schema = {
			"@context": "https://schema.org",
			"@id": "https://example.org/people/1",
			"@type": "Person",
			worksFor: { "@id": "https://example.org/org/2", name: "X" },
			"@graph": [{ "@id": "/.well-known/genid/a", "@type": "Thing" }],
		};
		const person = {
			"@context": "https://json-ld.org/contexts/person.jsonld",
			"@id": "http://dbpedia.org/resource/John_Lennon",
			name: "John Lennon",
		};
		const vocabulary = { "@context": "/contexts/v1/terms", "@id": "/terms/1" };
		let sent: unknown;
		global.fetch = async (_input, init) => {
			sent = JSON.parse(init?.body as string);
			return new Response(JSON.stringify({}), { status: 200 });
		};

		await articles.update(1, {
			schema,
			meta: { "@id": "urn:isbn:1", note: "n" },
			draft: { "@id": "", name: "x" },
			node: { "@id": "_:b0", "@type": "Seo", title: "t" },
			prefixed: { "@id": "/api/.well-known/genid/abc", "@type": "Seo" },
			price: new Money(),
			publishedAt: new Date(0),
			matrix: [[{ "@id": "/companies/1" }], [1]],
			company: Object.assign(Object.create(null), { "@id": "/companies/2" }),
			partner: { "@id": "https://example.com/companies/3", name: "Acme" },
			author: { "@context": "/contexts/User", "@id": "/users/2", name: "A" },
			person,
			absolute: {
				"@context": "https://example.com/contexts/User",
				"@id": "https://example.com/users/3",
			},
			vocabulary,
		});

		assert.deepEqual(sent, {
			schema,
			meta: { "@id": "urn:isbn:1", note: "n" },
			draft: { "@id": "", name: "x" },
			node: { title: "t" },
			prefixed: {},
			price: { amount: 5 },
			publishedAt: "1970-01-01T00:00:00.000Z",
			matrix: [["/companies/1"], [1]],
			company: "/companies/2",
			partner: "https://example.com/companies/3",
			author: "/users/2",
			person,
			absolute: "https://example.com/users/3",
			vocabulary,
		});
	});

	test("should treat an array body and a body without prototype like any other", async () => {
		type Tag = { id: string; name: string };
		const tags = entityServiceBuilder<
			Iri<"tags", string>,
			Tag,
			{ body: { name: string }[] | { name: string } }
		>("https://example.com", "/tags");
		const copied = [
			{ "@id": "/tags/a%20b", "@type": "Tag", id: "a b", name: "a" },
		];
		const bare: { name: string } = Object.assign(Object.create(null), {
			"@type": "Tag",
			id: "new",
			name: "b",
		});
		const sent: unknown[] = [];
		global.fetch = async (_input, init) => {
			sent.push(JSON.parse(init?.body as string));
			return new Response(JSON.stringify({}), { status: 201 });
		};

		const other = { "@id": "/tags/17", id: "7", name: "c" };
		const encoded = { "@id": "/tags/a@b.c", id: "a@b.c", name: "d" };
		const cyclic: { name: string; self?: unknown } = { name: "e" };
		cyclic.self = cyclic;

		await tags.create(copied);
		await tags.create(bare);
		await tags.create(other);
		await tags.create(encoded);
		await assert.rejects(tags.create(cyclic));

		assert.deepEqual(sent, [
			[{ name: "a" }],
			{ id: "new", name: "b" },
			{ id: "7", name: "c" },
			{ name: "d" },
		]);
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
			assert.deepEqual(JSON.parse(init?.body as string), {
				name: "Updated Entity",
			});
			return new Response(JSON.stringify(response), { status: 200 });
		};

		const result = await entityService.replace(bodyWithId);

		assert.deepStrictEqual(result, response);
	});

	test("should replace an entity by body with id", async () => {
		const { entityService } = makeService();
		const response = makeItem(1, "Updated Entity");

		global.fetch = async (input, init) => {
			assert.equal(input, `https://example.com${entityPath}/1`);
			assert.equal(init?.method, "PUT");
			assert.deepEqual(JSON.parse(init?.body as string), {
				name: "Updated Entity",
			});
			return new Response(JSON.stringify(response), { status: 200 });
		};

		const result = await entityService.replace({
			id: 1,
			name: "Updated Entity",
		});

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
			assert.deepEqual(JSON.parse(init?.body as string), {
				name: "Updated Entity",
			});
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

	test("upsert: should call create when body has a null id", async () => {
		const { entityService } = makeService();
		const response = makeItem(1, "New Entity");

		global.fetch = async (input, init) => {
			assert.equal(input, `https://example.com${entityPath}`);
			assert.equal(init?.method, "POST");
			assert.deepEqual(JSON.parse(init?.body as string), {
				name: "New Entity",
			});
			return new Response(JSON.stringify(response), { status: 201 });
		};

		const result = await entityService.upsert({
			id: null,
			name: "New Entity",
		} as unknown as EntityBody);

		assert.deepStrictEqual(result, response);
	});

	test("upsert: should call create when body has an empty id", async () => {
		const { entityService } = makeService();
		const response = makeItem(1, "New Entity");

		global.fetch = async (input, init) => {
			assert.equal(input, `https://example.com${entityPath}`);
			assert.equal(init?.method, "POST");
			assert.deepEqual(JSON.parse(init?.body as string), {
				name: "New Entity",
			});
			return new Response(JSON.stringify(response), { status: 201 });
		};

		const result = await entityService.upsert({
			id: "",
			name: "New Entity",
		} as unknown as EntityBody);

		assert.deepStrictEqual(result, response);
	});

	test("getAllPages: should return an empty collection", async () => {
		const { entityService } = makeService();
		let callCount = 0;

		global.fetch = async () => {
			callCount++;
			return new Response(
				JSON.stringify({
					"@context": "",
					"@type": "Collection",
					"@id": entityPath,
					member: [],
					totalItems: 0,
				} satisfies Collection<Entity, EntityIri>),
				{ status: 200 },
			);
		};

		const result = await entityService.getAllPages();

		assert.deepStrictEqual(result.member, []);
		assert.strictEqual(result.totalItems, 0);
		assert.strictEqual(callCount, 1);
	});

	test("getAllPages: should ask for pages of 100 items unless a size is given", async () => {
		const { entityService } = makeService();
		const urls: string[] = [];

		global.fetch = async (input) => {
			urls.push(input.toString());
			return new Response(
				JSON.stringify({ member: [makeItem(1, "A")], totalItems: 1 }),
				{ status: 200 },
			);
		};

		await entityService.getAllPages();
		await entityService.getAllPages({
			pageSize: 50,
			filters: [{ id: "name", value: "A" }],
		});

		assert.deepStrictEqual(urls, [
			"https://example.com/entities?itemsPerPage=100",
			"https://example.com/entities?itemsPerPage=50&name=A",
		]);
	});

	test("getAllPages: should use the page size of a resource that refuses the parameter", async () => {
		const { entityService } = makeService();
		const urls: string[] = [];

		global.fetch = async (input) => {
			urls.push(input.toString());
			return input.toString().includes("itemsPerPage")
				? new Response(JSON.stringify({ detail: "Parameter not supported" }), {
						status: 400,
					})
				: new Response(
						JSON.stringify({ member: [makeItem(1, "A")], totalItems: 1 }),
						{ status: 200 },
					);
		};

		const result = await entityService.getAllPages();

		assert.strictEqual(result.member.length, 1);
		assert.deepStrictEqual(urls, [
			"https://example.com/entities?itemsPerPage=100",
			"https://example.com/entities",
		]);
		await assert.rejects(() => entityService.getAllPages({ pageSize: 50 }), {
			name: "ApiError",
			status: 400,
		});
	});

	test("getAllPages: should not ask again when the first page fails for another reason", async () => {
		const { entityService } = makeService();
		let callCount = 0;

		global.fetch = async () => {
			callCount++;
			return new Response(JSON.stringify({ detail: "Server error" }), {
				status: 500,
			});
		};

		await assert.rejects(() => entityService.getAllPages(), {
			name: "ApiError",
			status: 500,
		});
		assert.strictEqual(callCount, 1);
	});

	test("getAllPages: should refuse a response that is not a collection", async () => {
		const { entityService } = makeService();

		global.fetch = async () =>
			new Response(JSON.stringify([makeItem(1, "A")]), { status: 200 });

		const refusal = {
			name: "TypeError",
			message: '"/entities" did not return a collection',
		};
		await assert.rejects(() => entityService.getAllPages(), refusal);
		await assert.rejects(() => entityService.getAllPages(() => false), refusal);

		global.fetch = async () => new Response("null", { status: 200 });
		await assert.rejects(() => entityService.getAllPages(), refusal);
	});

	test("should ignore a trailing slash in the path of the resource", async () => {
		const service = entityServiceBuilder<EntityIri, Entity>(
			"https://example.com",
			"/entities/",
		);
		const urls: string[] = [];

		global.fetch = async (input) => {
			urls.push(input.toString());
			return new Response(JSON.stringify({ member: [] }), { status: 200 });
		};

		await service.get(1);
		await service.getAll();

		assert.deepStrictEqual(urls, [
			"https://example.com/entities/1",
			"https://example.com/entities",
		]);
	});

	test("getAllPages: should follow the next link of each page", async () => {
		const { entityService } = makeService();
		const allMembers = [1, 2, 3, 4, 5].map((id) =>
			makeItem(id, `Entity ${id}`),
		);
		const urls: string[] = [];

		global.fetch = async (input) => {
			urls.push(input.toString());
			const page =
				Number(new URL(input.toString()).searchParams.get("page")) || 1;
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
						...(page < 3 && { next: `${entityPath}?page=${page + 1}` }),
					},
				} satisfies Collection<Entity, EntityIri>),
				{ status: 200 },
			);
		};

		const result = await entityService.getAllPages();

		assert.deepStrictEqual(result.member, allMembers);
		assert.strictEqual(result.totalItems, 5);
		assert.strictEqual(result.view, undefined);
		assert.deepStrictEqual(urls, [
			"https://example.com/entities?itemsPerPage=100",
			"https://example.com/entities?page=2",
			"https://example.com/entities?page=3",
		]);
	});

	test("getAllPages: should ask for the next page number when there is no next link", async () => {
		const { entityService } = makeService();
		const allMembers = [1, 2, 3, 4, 5].map((id) =>
			makeItem(id, `Entity ${id}`),
		);
		const urls: string[] = [];

		global.fetch = async (input) => {
			urls.push(input.toString());
			const page =
				Number(new URL(input.toString()).searchParams.get("page")) || 1;
			return new Response(
				JSON.stringify({
					member: allMembers.slice((page - 1) * 2, page * 2),
					totalItems: 5,
				}),
				{ status: 200 },
			);
		};

		const result = await entityService.getAllPages({ pageSize: 2 });

		assert.deepStrictEqual(result.member, allMembers);
		assert.deepStrictEqual(urls, [
			"https://example.com/entities?itemsPerPage=2",
			"https://example.com/entities?page=2&itemsPerPage=2",
			"https://example.com/entities?page=3&itemsPerPage=2",
		]);
	});

	test("getAllPages: should read nothing when onProgress returns false on page 0", async () => {
		const { entityService } = makeService();
		let callCount = 0;

		global.fetch = async () => {
			callCount++;
			return new Response(
				JSON.stringify({ member: [makeItem(1, "A")], totalItems: 10 }),
				{ status: 200 },
			);
		};

		const result = await entityService.getAllPages(({ page }) =>
			page === 0 ? false : undefined,
		);

		assert.strictEqual(result.member.length, 0);
		assert.strictEqual(callCount, 1);
	});

	test("getAllPages: should stop after the first page when onProgress returns false", async () => {
		const { entityService } = makeService();
		let callCount = 0;

		global.fetch = async () => {
			callCount++;
			return new Response(
				JSON.stringify({
					member: [makeItem(1, "A"), makeItem(2, "B")],
					totalItems: 10,
				}),
				{ status: 200 },
			);
		};

		const result = await entityService.getAllPages(({ page }) =>
			page >= 1 ? false : undefined,
		);

		assert.strictEqual(result.member.length, 2);
		assert.strictEqual(callCount, 1);
	});

	test("getAllPages: should report its progress after each page", async () => {
		const { entityService } = makeService();
		const progress: object[] = [];

		global.fetch = async (input) => {
			const page =
				Number(new URL(input.toString()).searchParams.get("page")) || 1;
			return new Response(
				JSON.stringify({
					member: [makeItem(page * 2 - 1, "A"), makeItem(page * 2, "B")],
					totalItems: 4,
				}),
				{ status: 200 },
			);
		};

		await entityService.getAllPages((step) => {
			progress.push(step);
		});

		assert.deepStrictEqual(progress, [
			{ page: 0, fetchedItems: 0, totalItems: 4, progressPercent: 0 },
			{ page: 1, fetchedItems: 2, totalItems: 4, progressPercent: 50 },
			{ page: 2, fetchedItems: 4, totalItems: 4, progressPercent: 100 },
		]);
	});

	test("getAllPages: should read a page of any size", async () => {
		const { entityService } = makeService();
		const member = Array.from({ length: 200_000 }, (_, id) => ({ id }));

		global.fetch = async () =>
			new Response(JSON.stringify({ member, totalItems: member.length }), {
				status: 200,
			});

		const result = await entityService.getAllPages();

		assert.equal(result.member.length, 200_000);
	});

	test("getAllPages: should follow the next page when the collection has no total", async () => {
		const { entityService } = makeService();
		const allMembers = [1, 2, 3, 4, 5].map((id) =>
			makeItem(id, `Entity ${id}`),
		);
		let callCount = 0;

		global.fetch = async (input) => {
			callCount++;
			const page =
				Number(new URL(input.toString()).searchParams.get("page")) || 1;
			return new Response(
				JSON.stringify({
					member: allMembers.slice((page - 1) * 2, page * 2),
					view: page < 3 ? { next: `${entityPath}?page=${page + 1}` } : {},
				}),
				{ status: 200 },
			);
		};

		const result = await entityService.getAllPages();

		assert.deepStrictEqual(result.member, allMembers);
		assert.strictEqual(result.totalItems, 5);
		assert.strictEqual(callCount, 3);
	});

	test("getAllPages: should follow the cursor of each page", async () => {
		const { entityService } = makeService();
		const pages: Record<string, { ids: number[]; next?: string }> = {
			"/entities?itemsPerPage=2": {
				ids: [9, 8],
				next: "/entities?itemsPerPage=2&id%5Blt%5D=8",
			},
			"/entities?itemsPerPage=2&id%5Blt%5D=8": {
				ids: [7, 6],
				next: "/entities?itemsPerPage=2&id%5Blt%5D=6",
			},
			"/entities?itemsPerPage=2&id%5Blt%5D=6": { ids: [5] },
		};
		const urls: string[] = [];

		global.fetch = async (input) => {
			const url = input.toString().replace("https://example.com", "");
			urls.push(url);
			const { ids, next } = pages[url];
			return new Response(
				JSON.stringify({
					member: ids.map((id) => makeItem(id, `Entity ${id}`)),
					view: next ? { next } : {},
				}),
				{ status: 200 },
			);
		};

		const result = await entityService.getAllPages({ pageSize: 2 });

		assert.deepStrictEqual(
			result.member.map((member) => member["@id"]),
			[9, 8, 7, 6, 5].map((id) => `/entities/${id}`),
		);
		assert.deepStrictEqual(urls, Object.keys(pages));
	});

	test("getAllPages: should stop when a collection without total has no next page", async () => {
		const { entityService } = makeService();
		let callCount = 0;

		global.fetch = async () => {
			callCount++;
			return new Response(JSON.stringify({ member: [makeItem(1, "A")] }), {
				status: 200,
			});
		};

		const result = await entityService.getAllPages();

		assert.strictEqual(result.member.length, 1);
		assert.strictEqual(callCount, 1);
	});

	test("getAllPages: should stop when the next page was already followed", async () => {
		const { entityService } = makeService();
		let callCount = 0;

		global.fetch = async () => {
			callCount++;
			return new Response(
				JSON.stringify({
					member: [makeItem(callCount, "A")],
					view: { next: `${entityPath}?page=2` },
				}),
				{ status: 200 },
			);
		};

		const result = await entityService.getAllPages();

		assert.strictEqual(result.member.length, 2);
		assert.strictEqual(callCount, 2);
	});

	test("getAllPages: should not read a page twice when a next link loops back", async () => {
		const { entityService } = makeService();
		const pages = [
			`${entityPath}?page=1`,
			`${entityPath}?page=2`,
			`${entityPath}?page=1`,
		];
		let callCount = 0;

		global.fetch = async () => {
			const index = callCount++;
			return new Response(
				JSON.stringify({
					member: [makeItem(index + 1, "A")],
					view: { "@id": pages[index], next: pages[index + 1] },
				}),
				{ status: 200 },
			);
		};

		const result = await entityService.getAllPages();

		assert.deepStrictEqual(
			result.member.map((member) => member["@id"]),
			["/entities/1", "/entities/2"],
		);
		assert.strictEqual(callCount, 2);
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
		const bookService = entityServiceBuilder<BookIri, Entity>(
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
		await bookService.update({
			"@id": "/books/the-hobbit",
			id: "the-hobbit",
			name: "The Hobbit",
		});

		assert.deepStrictEqual(urls, [
			"https://example.com/books/f47ac10b-58cc-4372-a567-0e02b2c3d479",
			"https://example.com/books/f47ac10b-58cc-4372-a567-0e02b2c3d479",
			"https://example.com/books/the-hobbit",
			"https://example.com/books/the-hobbit",
		]);
	});

	test("should encode a string identifier", async () => {
		const bookService = entityServiceBuilder<Iri<"books", string>, Entity>(
			"https://example.com/api",
			"/books",
		);
		const urls: string[] = [];

		global.fetch = async (input) => {
			urls.push(input.toString());
			return new Response(JSON.stringify({}), { status: 200 });
		};

		await bookService.get("c#");
		await bookService.get("what?");
		await bookService.delete("../users/1");

		assert.deepStrictEqual(urls, [
			"https://example.com/api/books/c%23",
			"https://example.com/api/books/what%3F",
			"https://example.com/api/books/..%2Fusers%2F1",
		]);
	});

	test("should reject an identifier that cannot be a path segment", async () => {
		const bookService = entityServiceBuilder<Iri<"books", string>, Entity>(
			"https://example.com/api",
			"/books",
		);
		const fetchMock = mock.fn(async () => new Response("{}"));
		global.fetch = fetchMock;

		await assert.rejects(() => bookService.get(""), TypeError);
		await assert.rejects(
			() => bookService.get(undefined as unknown as string),
			TypeError,
		);
		await assert.rejects(() => bookService.delete("."), TypeError);
		await assert.rejects(() => bookService.delete(".."), TypeError);
		await assert.rejects(
			() => bookService.update("", { name: "The Hobbit" }),
			TypeError,
		);
		assert.equal(fetchMock.mock.callCount(), 0);
	});
});
