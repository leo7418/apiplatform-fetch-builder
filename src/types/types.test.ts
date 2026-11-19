import { test, describe } from "node:test";
import assert from "node:assert/strict";

import entityServiceBuilder from "../lib/entity-service-builder.ts";
import fetchBuilder from "../lib/fetch-builder.ts";
import type { Collection } from "./collection.ts";
import type { GetIri, Iri, IriId } from "./iri.ts";
import type { Item } from "./item.ts";
import type { PropertyPath } from "./property-path.ts";
import type { PropertyValue } from "./property-value.ts";

type Equal<A, B> =
	(<T>() => T extends A ? 1 : 2) extends <T>() => T extends B ? 1 : 2
		? true
		: false;

type CompanyIri = Iri<"api/companies", string>;
type Company = Item<{ name: string; city: string }, CompanyIri>;
type UserIri = Iri<"api/users">;
type User = {
	name: string;
	email: string;
	company: Company | CompanyIri;
	tags: string[];
};
type Users = Collection<User, UserIri>;

const api = fetchBuilder("https://example.com/api");

const respond = (body: unknown) => {
	global.fetch = async () =>
		new Response(JSON.stringify(body), { status: 200 });
};

describe("types", () => {
	test("IRI helpers should read the identifier and recognise IRIs", () => {
		const checks: [
			Equal<IriId<Iri<"users">>, number>,
			Equal<IriId<UserIri>, number>,
			Equal<IriId<CompanyIri>, string>,
			Equal<GetIri<UserIri | Company>, UserIri>,
			Equal<GetIri<string>, never>,
		] = [true, true, true, true, true];

		assert.ok(checks.every(Boolean));
	});

	test("PropertyPath should accept the paths of the resource only", () => {
		const paths: PropertyPath<Users>[] = [
			"name",
			"email",
			"tags",
			"company",
			"company.name",
			"company.city",
			// @ts-expect-error unknown nested property
			"company.unknown",
		];

		assert.equal(paths.length, 7);
	});

	test("selected properties should narrow the response", async () => {
		respond({
			member: [
				{
					"@id": "/api/users/1",
					"@type": "User",
					name: "Alice",
					company: {
						"@id": "/api/companies/acme",
						"@type": "Company",
						name: "Acme",
					},
				},
			],
			totalItems: 1,
		});

		const users = await api
			.get<Users>("/users")
			.withOptions({ properties: ["name", "company.name"] })
			.fetch();
		const [user] = users.member;
		const name: string = user.name;
		const companyName: string = user.company.name;

		assert.deepEqual([name, companyName], ["Alice", "Acme"]);
		// @ts-expect-error email was not selected
		assert.equal(user.email, undefined);
		// @ts-expect-error city was not selected
		assert.equal(user.company.city, undefined);
		// @ts-expect-error the hydra: prefix is not declared
		assert.equal(users["hydra:member"], undefined);
	});

	test("a relation selected as a whole should stay an item or an IRI", async () => {
		respond({
			member: [
				{
					"@id": "/api/users/1",
					"@type": "User",
					company: "/api/companies/acme",
				},
			],
			totalItems: 1,
		});

		const users = await api
			.get<Users>("/users")
			.withOptions({ properties: ["company"] })
			.fetch();
		const company: Company | CompanyIri = users.member[0].company;

		assert.equal(company, "/api/companies/acme");
	});

	test("a wrapper should narrow the response of a custom search endpoint", async () => {
		const search =
			<Out extends object>(url: string) =>
			<P extends PropertyPath<Out>[]>(body: { properties: P }) =>
				api
					.post<PropertyValue<Out, P[number]>, { properties: P }>(url)
					.fetch(body);

		respond({
			member: [{ "@id": "/api/users/1", "@type": "User", name: "Alice" }],
			totalItems: 1,
		});

		const users = await search<Users>("/users/search")({
			properties: ["name"],
		});
		const name: string = users.member[0].name;

		assert.equal(name, "Alice");
		// @ts-expect-error email was not selected
		assert.equal(users.member[0].email, undefined);
	});

	test("entity service identifiers should follow the IRI", async () => {
		const urls: string[] = [];
		global.fetch = async (input) => {
			urls.push(input.toString());
			return new Response(JSON.stringify({}), { status: 200 });
		};

		const users = entityServiceBuilder<UserIri, { name: string }, User>(
			api,
			"/users",
		);
		const companies = entityServiceBuilder<
			CompanyIri,
			{ name: string },
			{ name: string; city: string }
		>(api, "/companies");

		await users.get(1);
		await users.get("/api/users/1");
		await companies.get("acme");
		// @ts-expect-error a numeric-id service takes a number or its IRI
		await users.get("acme");
		// @ts-expect-error a string-id service does not take a number
		await companies.get(1);

		assert.deepEqual(urls.slice(0, 3), [
			"https://example.com/api/users/1",
			"https://example.com/api/users/1",
			"https://example.com/api/companies/acme",
		]);
	});
});
