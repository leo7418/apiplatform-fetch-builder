import { test, describe } from "node:test";
import assert from "node:assert/strict";

import type { Collection, GetAllPagesProgress } from "../../src/index.ts";

import { api, hydraPrefix, unprefixed, users } from "./api.ts";
import type { User, UserIri } from "./api.ts";

const names = (members: { name: string }[]) => members.map(({ name }) => name);

describe("reading a collection", () => {
	test("should read one page and the total of the collection", async () => {
		const page = unprefixed(await users.getAll({ pageIndex: 1, pageSize: 10 }));

		assert.equal(page.totalItems, 25);
		assert.equal(page.member.length, 10);
		assert.equal(page.member[0].name, "User 11");
	});

	test("should sort a collection", async () => {
		const page = unprefixed(
			await users.getAll({
				pageSize: 3,
				sortBy: [{ id: "name", desc: true }],
			}),
		);

		assert.deepEqual(names(page.member), ["User 25", "User 24", "User 23"]);
	});

	test("should filter a collection", async () => {
		const page = unprefixed(
			await users.getAll({ filters: [{ id: "name", value: "User 2" }] }),
		);

		assert.equal(page.totalItems, 6);
		assert.equal(page.member[0].name, "User 20");
	});

	test("should filter a collection on several values", async () => {
		const page = unprefixed(
			await users.getAll({
				filters: [
					{ id: "company", value: ["/api/companies/1", "/api/companies/2"] },
				],
			}),
		);

		assert.equal(page.totalItems, 8);
	});

	test("should select the properties of a collection", async () => {
		const page = unprefixed(
			await users.getAll({ pageSize: 1, properties: ["name"] }),
		);

		assert.deepEqual(page.member, [
			{ "@id": "/api/users/1", "@type": "User", name: "User 01" },
		]);
	});

	test("should embed a relation when one of its properties is selected", async () => {
		const page = unprefixed(
			await users.getAll({
				pageSize: 1,
				properties: ["name", "company.name"],
			}),
		);

		assert.deepEqual(page.member[0].company, {
			"@id": "/api/companies/1",
			"@type": "Company",
			name: "Acme",
		});
	});

	test("should combine every option of a query through the fetcher", async () => {
		const page = unprefixed(
			await api
				.get<Collection<User, UserIri>>("/users")
				.withQuery({
					pageIndex: 1,
					pageSize: 2,
					sortBy: [{ id: "name", desc: true }],
					filters: [{ id: "company", value: "/api/companies/1" }],
					properties: ["name"],
				})
				.fetch(),
		);

		assert.equal(page.totalItems, 5);
		assert.deepEqual(page.member, [
			{ "@id": "/api/users/3", "@type": "User", name: "User 03" },
			{ "@id": "/api/users/2", "@type": "User", name: "User 02" },
		]);
	});

	test("should keep the hydra: prefix of API Platform 3.4", async () => {
		const page = await users.getAll({ pageSize: 1 });

		assert.equal("hydra:member" in page, hydraPrefix);
		assert.equal("member" in page, !hydraPrefix);
	});
});

describe("reading an item", () => {
	test("should read an item by id and by IRI", async () => {
		const user = await users.get(1);

		assert.deepEqual(user, {
			"@context": "/api/contexts/User",
			"@id": "/api/users/1",
			"@type": "User",
			id: 1,
			name: "User 01",
			email: "user01@example.com",
			company: "/api/companies/1",
		});
		assert.deepEqual(await users.get("/api/users/1"), user);
	});

	test("should leave out a property that is null", async () => {
		const user = await users.get(9);

		assert.equal("company" in user, false);
	});

	test("should select the properties of an item", async () => {
		const user = await users.get(6, {
			properties: ["email", "company.name"],
		});

		assert.deepEqual(user, {
			"@context": "/api/contexts/User",
			"@id": "/api/users/6",
			"@type": "User",
			email: "user06@example.com",
			company: {
				"@id": "/api/companies/2",
				"@type": "Company",
				name: "Globex",
			},
		});
	});
});

describe("reading every page", () => {
	test("getAllPages: should follow the pages and report its progress", async () => {
		const progress: GetAllPagesProgress[] = [];

		const all = unprefixed(
			await users.getAllPages({ pageSize: 10 }, (step) => {
				progress.push(step);
			}),
		);

		assert.equal(all.totalItems, 25);
		assert.deepEqual(
			all.member.map(({ id }) => id),
			Array.from({ length: 25 }, (_, index) => index + 1),
		);
		assert.deepEqual(
			progress.map(({ fetchedItems }) => fetchedItems),
			[0, 10, 20, 25],
		);
	});

	test("getAllPages: should keep the hydra: prefix of API Platform 3.4", async () => {
		const all = await users.getAllPages({ pageSize: 10 });

		assert.equal("hydra:member" in all, hydraPrefix);
		assert.equal("member" in all, !hydraPrefix);
	});

	test("getAllPages: should keep the sorting and the filters on every page", async () => {
		const all = unprefixed(
			await users.getAllPages({
				pageSize: 2,
				sortBy: [{ id: "name", desc: true }],
				filters: [{ id: "company", value: "/api/companies/1" }],
			}),
		);

		assert.deepEqual(names(all.member), [
			"User 05",
			"User 04",
			"User 03",
			"User 02",
			"User 01",
		]);
	});
});
