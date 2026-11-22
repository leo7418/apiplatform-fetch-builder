import { test, describe } from "node:test";
import assert from "node:assert/strict";

import entityServiceBuilder from "../lib/entity-service-builder.ts";
import fetchBuilder from "../lib/fetch-builder.ts";
import type { Collection, PartialCollection } from "./collection.ts";
import type { AbsoluteIri, GetIri, Iri, IriId } from "./iri.ts";
import type { Embedded, Item } from "./item.ts";
import type { PropertyPath } from "./property-path.ts";
import type { PropertyValue } from "./property-value.ts";

type Equal<A, B> =
	(<T>() => T extends A ? 1 : 2) extends <T>() => T extends B ? 1 : 2
		? true
		: false;

type Alike<A, B> = [A] extends [B] ? ([B] extends [A] ? true : false) : false;

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

type CustomerIri = AbsoluteIri<"api/customers", string>;
type Customer = Item<{ name: string; city: string }, CustomerIri>;
type OrderIri = AbsoluteIri<"api/orders">;
type Order = { reference: string; customer: Customer | CustomerIri };
type Orders = Collection<Order, OrderIri>;

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
			Equal<IriId<OrderIri>, number>,
			Equal<IriId<CustomerIri>, string>,
			Equal<GetIri<OrderIri | Customer>, OrderIri>,
		] = [true, true, true, true, true, true, true, true];

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

	test("filters should accept any name and sorting only property paths", async () => {
		const urls: string[] = [];
		global.fetch = async (input) => {
			urls.push(input.toString());
			return new Response(JSON.stringify({}), { status: 200 });
		};

		await api
			.get<Users>("/users")
			.withOptions({
				sortBy: [{ id: "company.name", desc: false }],
				filters: [
					{ id: "name", value: "Alice" },
					{ id: "exists", value: { email: true } },
				],
			})
			.fetch();
		await api
			.get<Users>("/users")
			// @ts-expect-error sorting takes a property path
			.withOptions({ sortBy: [{ id: "unknown", desc: false }] })
			.fetch();

		assert.equal(
			urls[0],
			"https://example.com/api/users?order%5Bcompany.name%5D=ASC&name=Alice&exists%5Bemail%5D=true",
		);
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

	test("a relation declared as an item or an IRI should be an IRI when selected as a whole", async () => {
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
		const company: CompanyIri = users.member[0].company;

		assert.equal(company, "/api/companies/acme");
	});

	test("selected properties should keep null and unrelated values", () => {
		type Task = {
			manager: UserIri | null;
			company: Company | CompanyIri | null;
			owner: Company;
			partners: (Company | CompanyIri)[];
			route: "/" | "/users" | "/users/list";
		};
		type Tasks = Collection<Task, Iri<"api/tasks">>;
		type Selected<P extends PropertyPath<Tasks>> = PropertyValue<
			Tasks,
			P
		>["member"][number];

		const checks: [
			Equal<Selected<"manager">["manager"], UserIri | null>,
			Equal<Selected<"company">["company"], CompanyIri | null>,
			Alike<Selected<"owner">["owner"], Company>,
			Equal<Selected<"partners">["partners"], CompanyIri[]>,
			Equal<Selected<"route">["route"], "/" | "/users" | "/users/list">,
			null extends Selected<"company.name">["company"] ? true : false,
			Equal<NonNullable<Selected<"company.name">["company"]>["name"], string>,
			"@context" extends keyof NonNullable<Selected<"company.name">["company"]>
				? false
				: true,
		] = [true, true, true, true, true, true, true, true];

		assert.ok(checks.every(Boolean));
	});

	test("an embedded relation should keep its identity keys and any should stay any", () => {
		type Task = {
			name: string;
			owner: Company;
			payload: ReturnType<typeof JSON.parse>;
		};
		type Tasks = Collection<Task, Iri<"api/tasks">>;
		type Selected<P extends PropertyPath<Tasks>> = PropertyValue<
			Tasks,
			P
		>["member"][number];

		const checks: [
			Equal<Selected<"owner.name">["owner"]["@id"], CompanyIri>,
			Equal<Selected<"owner.name">["owner"]["@type"], string>,
			Equal<Selected<"owner.name">["owner"]["name"], string>,
			0 extends 1 & Selected<"payload">["payload"] ? true : false,
			0 extends 1 & Selected<PropertyPath<Tasks>>["payload"] ? true : false,
		] = [true, true, true, true, true];

		assert.ok(checks.every(Boolean));
	});

	test("a relation back to a resource being read may come as its IRI", () => {
		type MemberIri = Iri<"api/members">;
		type TeamIri = Iri<"api/teams">;
		type Member = { name: string; team: Team | TeamIri };
		type Team = Item<
			{
				name: string;
				lead: Item<Member, MemberIri> | MemberIri;
				members: (Item<Member, MemberIri> | MemberIri)[];
			},
			TeamIri
		>;
		type Selected<P extends PropertyPath<Item<Member, MemberIri>>> =
			PropertyValue<Item<Member, MemberIri>, P>;
		type Lead = Selected<"team.lead.name">["team"]["lead"];
		type Listed = Selected<"team.members.name">["team"]["members"][number];

		const checks: [
			MemberIri extends Lead ? true : false,
			MemberIri extends Listed ? true : false,
			Equal<Exclude<Lead, string>["name"], string>,
			Equal<Exclude<Listed, string>["@id"], MemberIri>,
			TeamIri extends Selected<"team.name">["team"] ? false : true,
		] = [true, true, true, true, true];

		assert.ok(checks.every(Boolean));
	});

	test("a relation to the same kind of resource should stay embedded one level down", () => {
		type CategoryIri = Iri<"api/categories", string>;
		type Category = { label: string; parent: Parent | CategoryIri | null };
		type Parent = Embedded<Category, CategoryIri>;
		type Selected<P extends PropertyPath<Item<Category, CategoryIri>>> =
			PropertyValue<Item<Category, CategoryIri>, P>;

		const checks: [
			CategoryIri extends Selected<"parent.label">["parent"] ? false : true,
			CategoryIri extends NonNullable<
				Selected<"parent.parent.label">["parent"]
			>["parent"]
				? true
				: false,
		] = [true, true];

		assert.ok(checks.every(Boolean));
	});

	test("an embedded relation can be declared without a context", () => {
		type Owner = Embedded<{ name: string; city: string }, CompanyIri>;
		type Task = { name: string; owner: Owner; company: Owner | CompanyIri };
		type Tasks = Collection<Task, Iri<"api/tasks">>;
		type Selected<P extends PropertyPath<Tasks>> = PropertyValue<
			Tasks,
			P
		>["member"][number];
		const paths: PropertyPath<Tasks>[] = ["owner.name", "company.city"];

		const checks: [
			"@context" extends keyof Owner ? false : true,
			Equal<Selected<"owner.name">["owner"]["name"], string>,
			Equal<Selected<"company">["company"], CompanyIri>,
			Alike<Selected<"owner">["owner"], Owner>,
		] = [true, true, true, true];

		assert.equal(paths.length, 2);
		assert.ok(checks.every(Boolean));
	});

	test("a response without selected properties should keep its declared type", async () => {
		respond({ member: [], totalItems: 0 });

		const users = await api
			.get<Users>("/users")
			.withOptions({ sortBy: [{ id: "name", desc: false }] })
			.fetch();
		const check: Equal<
			(typeof users.member)[number]["company"],
			Company | CompanyIri
		> = true;

		assert.deepEqual(users.member, []);
		assert.ok(check);
	});

	test("a partial collection should have no total", () => {
		type Logs = PartialCollection<User, UserIri>;
		const paths: PropertyPath<Logs>[] = ["name", "company.name"];
		const checks: [
			"totalItems" extends keyof Logs ? false : true,
			"totalItems" extends keyof PropertyValue<Logs, "name"> ? false : true,
			Equal<PropertyValue<Logs, "name">["member"][number]["name"], string>,
			Equal<PropertyValue<Users, "name">["totalItems"], number>,
		] = [true, true, true, true];

		assert.equal(paths.length, 2);
		assert.ok(checks.every(Boolean));
	});

	test("a service on a partially paginated resource should have no total", async () => {
		respond({ member: [], view: { next: "/api/users?page=2" } });
		const logs = entityServiceBuilder<
			UserIri,
			{ name: string },
			User,
			{ pagination: "partial" }
		>(api, "/users");

		const page = await logs.getAll();
		const selected = await logs.getAll({ properties: ["name"] });
		const all = await logs.getAllPages();
		const total: number = all.totalItems;

		// @ts-expect-error a partial collection has no total
		assert.equal(page.totalItems, undefined);
		// @ts-expect-error a partial collection has no total
		assert.equal(selected.totalItems, undefined);
		assert.equal(total, 0);
	});

	test("a service without output should resolve its writes with null", async () => {
		global.fetch = async () => new Response(null, { status: 204 });
		const settings = entityServiceBuilder<
			UserIri,
			{ name: string },
			User,
			{ output: false }
		>(api, "/settings");

		const created: null = await settings.create({ name: "Dark" });
		const updated: null = await settings.update(1, { name: "Light" });

		assert.deepEqual([created, updated], [null, null]);
	});

	test("upsert should accept a body without an identifier yet", async () => {
		respond({ "@id": "/api/users/1", "@type": "User", name: "Alice" });
		const users = entityServiceBuilder<UserIri, { name: string }, User>(
			api,
			"/users",
		);

		await users.upsert({ name: "Alice" });
		await users.upsert({ id: null, name: "Alice" });
		await users.upsert({ id: "", name: "Alice" });
		await users.upsert({ id: 1, name: "Alice" });
		// @ts-expect-error an identifier is a number or is left out
		await users.upsert({ id: "one", name: "Alice" });
	});

	test("properties should narrow a response typed without an item or a collection", async () => {
		type Address = { city: string; street: string };
		type Account = {
			name: string;
			email: string;
			address: Address;
			createdAt: Date;
			company: Company | CompanyIri;
		};
		const paths: PropertyPath<Account>[] = [
			"name",
			"address",
			"address.city",
			"createdAt",
			"company.name",
			// @ts-expect-error a date is not walked
			"createdAt.getTime",
			// @ts-expect-error unknown nested property
			"address.country",
		];

		respond({ name: "Alice", address: { city: "Paris" } });
		const account = await api
			.get<Account>("/accounts/1")
			.withOptions({ properties: ["name", "address.city", "company"] })
			.fetch();
		const name: string = account.name;
		const city: string = account.address.city;
		const company: CompanyIri = account.company;

		respond([{ name: "Alice" }]);
		const accounts = await api
			.get<Account[]>("/accounts")
			.withOptions({
				properties: ["name"],
				sortBy: [
					{ id: "name", desc: false },
					{ id: "balance", desc: true },
				],
			})
			.fetch();
		const first: string = accounts[0].name;

		assert.equal(paths.length, 7);
		assert.deepEqual(
			[name, city, company, first],
			["Alice", "Paris", undefined, "Alice"],
		);
		// @ts-expect-error email was not selected
		assert.equal(account.email, undefined);
		// @ts-expect-error street was not selected
		assert.equal(account.address.street, undefined);
		// @ts-expect-error email was not selected
		assert.equal(accounts[0].email, undefined);
	});

	test("dates, branded values and records should be left as they are", () => {
		type Uuid = string & { readonly brand: "uuid" };
		type Event = {
			uuid: Uuid;
			startsAt: Date;
			meta: Record<string, string>;
			owner: { name: string } | CompanyIri;
		};
		type Events = Collection<Event, Iri<"api/events">>;
		type Selected<P extends PropertyPath<Events>> = PropertyValue<
			Events,
			P
		>["member"][number];
		const paths: PropertyPath<Events>[] = [
			"uuid",
			"startsAt",
			"meta",
			"meta.color",
			"owner.name",
			// @ts-expect-error a branded string is not walked
			"uuid.length",
			// @ts-expect-error a record takes a dotted name
			"metaTYPO",
		];
		type Rows = PropertyValue<readonly Event[], "uuid" | "startsAt">;

		const checks: [
			Equal<Selected<"uuid">["uuid"], Uuid>,
			Equal<Selected<"startsAt">["startsAt"], Date>,
			Equal<Rows[number]["startsAt"], Date>,
			CompanyIri extends Selected<"owner.name">["owner"] ? false : true,
		] = [true, true, true, true];

		assert.equal(paths.length, 7);
		assert.ok(checks.every(Boolean));
	});

	test("a relation declared as a plain object or an IRI may come back as that IRI", () => {
		type MemberIri = Iri<"api/members">;
		type TeamIri = Iri<"api/teams">;
		type Member = { name: string; team: Team | TeamIri };
		type Team = { name: string; lead: Member | MemberIri };
		type Selected<P extends PropertyPath<Item<Member, MemberIri>>> =
			PropertyValue<Item<Member, MemberIri>, P>;
		type Lead = Exclude<Selected<"team.lead.name">["team"], string>["lead"];

		const checks: [
			MemberIri extends Lead ? true : false,
			Equal<Exclude<Lead, string>["name"], string>,
		] = [true, true];

		assert.ok(checks.every(Boolean));
	});

	test("a date filter should take its dates in a record", async () => {
		respond({ member: [], totalItems: 0 });
		const date = new Date("2020-01-01T00:00:00Z");

		await api
			.get<Users>("/users")
			.withOptions({ filters: [{ id: "createdAt", value: { after: date } }] })
			.fetch();
		await assert.rejects(
			() =>
				api
					.get<Users>("/users")
					// @ts-expect-error a date on its own is not a filter value
					.withOptions({ filters: [{ id: "createdAt", value: date }] })
					.fetch(),
			TypeError,
		);
	});

	test("absolute IRIs should behave like path IRIs", async () => {
		const urls: string[] = [];
		global.fetch = async (input) => {
			urls.push(input.toString());
			return new Response(
				JSON.stringify({
					member: [
						{
							"@id": "https://example.com/api/orders/1",
							"@type": "Order",
							customer: {
								"@id": "https://example.com/api/customers/acme",
								"@type": "Customer",
								name: "Acme",
							},
						},
					],
					totalItems: 1,
				}),
				{ status: 200 },
			);
		};

		const orders = await api
			.get<Orders>("/orders")
			.withOptions({ properties: ["customer.name"] })
			.fetch();
		const [order] = orders.member;
		const orderIri: OrderIri = order["@id"];
		const customerName: string = order.customer.name;
		// @ts-expect-error city was not selected
		assert.equal(order.customer.city, undefined);

		const networkPathIri: OrderIri = "//example.com/api/orders/1";
		// @ts-expect-error a path is not an absolute IRI
		const pathIri: OrderIri = "/api/orders/1";

		const service = entityServiceBuilder<OrderIri, Order, Order>(
			api,
			"/orders",
		);
		await service.get(1);
		await service.get(orderIri);
		await service.get(networkPathIri);
		await service.get(pathIri);
		// @ts-expect-error a numeric-id service takes a number or its IRI
		await service.get("acme");

		assert.equal(customerName, "Acme");
		assert.deepEqual(
			urls.slice(1, 5),
			Array(4).fill("https://example.com/api/orders/1"),
		);
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
