import { test, describe } from "node:test";
import assert from "node:assert/strict";

import entityServiceBuilder, {
	type EntityService,
} from "../lib/entity-service-builder.ts";
import fetchBuilder, { type QueryOptions } from "../lib/fetch-builder.ts";
import type { ReplaceBody, WriteBody } from "./body.ts";
import type { Collection, PartialCollection } from "./collection.ts";
import type { AbsoluteIri, AnyIri, GetIri, Iri, IriId } from "./iri.ts";
import type { Embedded, Item } from "./item.ts";
import type { PropertyPath } from "./property-path.ts";
import type { PropertyValue, Read } from "./property-value.ts";

type Equal<A, B> =
	(<T>() => T extends A ? 1 : 2) extends <T>() => T extends B ? 1 : 2
		? true
		: false;

type Alike<A, B> = [A] extends [B] ? ([B] extends [A] ? true : false) : false;

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Loose = any;

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

	test("an IRI of any path should take a path of several segments, in a service and in a collection typed without its IRI", () => {
		type TagIri = Iri<string, string | number>;
		const tags = entityServiceBuilder<TagIri, { name: string }>(api, "/tags");
		const read = () => [tags.get(1), tags.get("/api/v2/tags/1")];
		const first = (list: Collection<{ name: string }>) =>
			list.member[0]["@id"] === "/api/v2/tags/1";
		const checks: [
			Equal<"/api/v2/tags/1" extends TagIri ? true : false, true>,
			Equal<IriId<TagIri>, string | number>,
			Equal<Collection<{ name: string }>["member"][number]["@id"], AnyIri>,
		] = [true, true, true];

		assert.ok(checks.every(Boolean));
		assert.equal(typeof read, typeof first);
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
			.withQuery({
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
			.withQuery({ sortBy: [{ id: "unknown", desc: false }] })
			.fetch();

		assert.equal(
			urls[0],
			"https://example.com/api/users?order%5Bcompany.name%5D=ASC&name=Alice&exists%5Bemail%5D=true",
		);
	});

	test("generic code should use what a service or a fetcher reads", async () => {
		respond({ name: "Alice", member: [{ name: "Bob" }], totalItems: 1 });
		type Named = { name: string };
		const nameOf = async <I extends AnyIri, T extends Named>(
			service: EntityService<I, T>,
			id: IriId<I>,
		): Promise<string> => (await service.get(id)).name;
		const listed = async <I extends AnyIri, T extends Named>(
			service: EntityService<I, T>,
		): Promise<[number, string[]]> => {
			const page = await service.getAll({ pageIndex: 1, pageSize: 20 });
			const all = await service.getAllPages();
			return [
				page.totalItems,
				[...page.member, ...all.member].map((member) => member.name),
			];
		};
		const getJson = <T extends object>(url: string): Promise<T> =>
			api.get<T>(url).fetch();
		const members = async <I extends AnyIri, T extends Named>(
			url: string,
		): Promise<string[]> =>
			(await api.get<Collection<T, I>>(url).fetch()).member.map(
				(member) => member.name,
			);
		const users = entityServiceBuilder<UserIri, User>(api, "/users");

		assert.deepEqual(
			[
				await nameOf(users, 1),
				await listed(users),
				(await getJson<Named>("/users/1")).name,
				await members<UserIri, User>("/users"),
			],
			["Alice", [1, ["Bob", "Bob"]], "Alice", ["Bob"]],
		);
	});

	test("generic code should forward a selection to a service", async () => {
		respond({
			"@id": "/api/users/1",
			name: "Alice",
			member: [],
			totalItems: 0,
		});
		const select = <
			I extends AnyIri,
			T extends object,
			P extends PropertyPath<Item<T, I>>[],
		>(
			service: EntityService<I, T>,
			id: IriId<I>,
			query: QueryOptions<Item<T, I>, P>,
		): Promise<PropertyValue<Item<T, I>, P[number]>> => service.get(id, query);
		const list = <
			I extends AnyIri,
			T extends object,
			P extends PropertyPath<Collection<T, I>>[],
		>(
			service: EntityService<I, T>,
			query: QueryOptions<Collection<T, I>, P>,
		): Promise<PropertyValue<Collection<T, I>, P[number]>> =>
			service.getAll(query);
		const users = entityServiceBuilder<UserIri, User>(api, "/users");

		const one = await select(users, 1, { properties: ["name"] });
		const page = await list(users, { properties: ["name"] });
		const name: string = one.name;

		assert.deepEqual([name, page.member], ["Alice", []]);
	});

	test("a model without a writable property should refuse every property in a write", async () => {
		respond({ "@id": "/api/pages/1", "@type": "Page" });
		type Page = { readonly id: number; readonly title: string };
		const pages = entityServiceBuilder<Iri<"api/pages">, Page>(api, "/pages");

		const empty: WriteBody<Page> = {};
		// @ts-expect-error a readonly property cannot be written
		const named: WriteBody<Page> = { title: "Home" };
		// @ts-expect-error nor a property the model does not have
		const stranger: WriteBody<Page> = { nonsense: true };
		const extended: WriteBody<Page> & { secret?: string } = { secret: "x" };
		// @ts-expect-error a service refuses them as well
		await pages.update(1, { title: "Home" });

		assert.deepEqual(
			[empty, named, stranger, extended],
			[{}, { title: "Home" }, { nonsense: true }, { secret: "x" }],
		);
	});

	test("generic code should name what a read resolves with", async () => {
		respond({ "@id": "/api/users/1", name: "Alice" });
		const load = <I extends AnyIri, T extends object>(
			service: EntityService<I, T>,
			id: IriId<I>,
		): Promise<Item<Read<T>, I>> => service.get(id);

		const user = await load(
			entityServiceBuilder<UserIri, User>(api, "/users"),
			1,
		);
		const company: CompanyIri = user.company;

		assert.deepEqual([user.name, company], ["Alice", undefined]);
	});

	test("a model typed any should stay any", async () => {
		respond({ member: [{ name: "Alice" }], totalItems: 1 });
		const loose = entityServiceBuilder<UserIri, Loose>(api, "/users");

		const page = await api
			.get<Collection<Loose>>("/users")
			.withQuery({ sortBy: [{ id: "name", desc: false }] })
			.fetch();
		const members: User[] = page.member;
		const item: User = await api.get<Item<Loose, UserIri>>("/users/1").fetch();
		const listed = await loose.getAll();
		const names: string[] = listed.member.map((user: User) => user.name);
		const read: User = await loose.get(1);
		const checks: [Equal<Item<Loose, UserIri>, Loose>] = [true];

		assert.deepEqual([members.length, names], [1, ["Alice"]]);
		assert.ok(item && read && checks.every(Boolean));
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
			.withQuery({ properties: ["name", "company.name"] })
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
			.withQuery({ properties: ["company"] })
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
			Equal<Selected<"owner.name">["owner"]["@type"], string | string[]>,
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

	test("a service should read a relation as its IRI without selected properties, and a fetcher keep the type it is given", async () => {
		respond({ "@id": "/api/tasks/1", member: [], totalItems: 0 });
		type Task = {
			title: string;
			owner?: User | UserIri;
			watchers: (User | UserIri)[];
			reviewer: Embedded<{ name: string }, UserIri> | null;
			company: Company | CompanyIri | null;
			position: [number, number];
			path: [string, ...number[]];
			tags: readonly string[];
		};
		type TaskIri = Iri<"api/tasks">;
		const tasks = entityServiceBuilder<TaskIri, Task>(api, "/tasks");

		const users = await api
			.get<Users>("/users")
			.withQuery({ sortBy: [{ id: "name", desc: false }] })
			.fetch();
		const page = await api.get<Collection<Task, TaskIri>>("/tasks").fetch();
		const task = await tasks.get(1);
		const created = await tasks.create({ title: "Review" });
		const all = await tasks.getAllPages();
		const selected = await tasks.get(1, { properties: ["owner.name"] });
		const sorted = await tasks.getAll({
			sortBy: [{ id: "title", desc: true }],
		});
		const read = await api.get<Item<Read<Task>, TaskIri>>("/tasks/1").fetch();
		const checks: [
			Equal<(typeof users.member)[number]["company"], Company | CompanyIri>,
			Equal<(typeof page.member)[number]["owner"], User | UserIri | undefined>,
			Equal<(typeof read)["owner"], UserIri | undefined>,
			Equal<(typeof sorted.member)[number]["owner"], UserIri | undefined>,
			Equal<(typeof task)["position"], [number, number]>,
			Equal<(typeof task)["path"], [string, ...number[]]>,
			Equal<(typeof task)["tags"], readonly string[]>,
			Equal<(typeof task)["owner"], UserIri | undefined>,
			Equal<(typeof task)["watchers"], UserIri[]>,
			Equal<
				(typeof task)["reviewer"],
				Embedded<{ name: string }, UserIri> | null
			>,
			Equal<(typeof task)["company"], CompanyIri | null>,
			Equal<(typeof task)["@id"], TaskIri>,
			Equal<(typeof created)["owner"], UserIri | undefined>,
			Equal<(typeof all.member)[number]["watchers"], UserIri[]>,
			Equal<NonNullable<(typeof selected)["owner"]>["name"], string>,
		] = [
			true,
			true,
			true,
			true,
			true,
			true,
			true,
			true,
			true,
			true,
			true,
			true,
			true,
			true,
			true,
		];
		await tasks.update({ ...task, title: "Sent back" });

		assert.deepEqual(
			[users.member, page.member, all.member, sorted.member],
			[[], [], [], []],
		);
		assert.ok(created && selected && read && checks.every(Boolean));
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
		const logs = entityServiceBuilder<UserIri, User, { pagination: "partial" }>(
			api,
			"/users",
		);

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

	test("the body of a write should follow the model of the resource", async () => {
		type Article = {
			readonly id: number;
			title: string;
			subtitle?: string;
			summary: string | null;
			readonly slug: string;
			author: Company | CompanyIri;
			reviewers: (Company | CompanyIri)[];
			owner: { name: string };
			address: { city: string; readonly formatted: string };
			tags: readonly string[];
		};
		type Sent = WriteBody<Article>;
		const checks: [
			Equal<
				keyof Sent,
				| "title"
				| "subtitle"
				| "summary"
				| "author"
				| "reviewers"
				| "owner"
				| "address"
				| "tags"
			>,
			Equal<Sent["title"], string | undefined>,
			Equal<Sent["subtitle"], string | null | undefined>,
			Equal<Sent["summary"], string | null | undefined>,
			Equal<Extract<Sent["author"], string>, CompanyIri>,
			Equal<
				Sent["owner"],
				| AnyIri
				| { "@id": AnyIri; "@type"?: string | string[] }
				| ({ name?: string } & object)
				| undefined
			>,
			Equal<
				Sent["address"],
				| AnyIri
				| { "@id": AnyIri; "@type"?: string | string[] }
				| ({ city?: string } & object)
				| undefined
			>,
			Equal<Sent["tags"], readonly string[] | undefined>,
			Equal<
				WriteBody<{ id: string; name: string }>,
				{ id?: string; name?: string }
			>,
			Equal<WriteBody<{ sentAt: Date }>, { sentAt?: Date }>,
		] = [true, true, true, true, true, true, true, true, true, true];
		respond({ "@id": "/api/articles/1", "@type": "Article", slug: "hello" });
		const articles = entityServiceBuilder<Iri<"api/articles">, Article>(
			api,
			"/articles",
		);

		await articles.create({
			title: "Hello",
			author: "/api/companies/acme",
			reviewers: ["/api/companies/acme"],
			owner: "/api/users/1",
			address: { city: "Paris" },
		});
		await articles.update(1, { summary: null, owner: { name: "Alice" } });
		await articles.update(1, { author: { "@id": "/api/companies/acme" } });
		await articles.update(1, {
			author: { "@id": "/api/companies/acme", "@type": "Company" },
		});
		const user = {} as Item<User, UserIri>;
		// @ts-expect-error a relation does not take the item of another resource
		await articles.update(1, { author: user });
		// @ts-expect-error a relation does not take an unrelated object
		await articles.update(1, { author: new Date(0) });
		const slug: string = (await articles.get(1)).slug;
		// @ts-expect-error a computed property is not sent
		await articles.update(1, { slug: "hello" });
		// @ts-expect-error a relation that names its IRI does not take another one
		await articles.update(1, { author: "/api/users/1" });
		// @ts-expect-error a property that is not nullable does not take null
		await articles.create({ title: null });
		// @ts-expect-error a property the resource does not have is not sent
		await articles.create({ title: "Hello", missing: true });

		assert.ok(checks.every(Boolean));
		assert.equal(slug, "hello");
	});

	test("a property the API fills by default should not have to be sent", async () => {
		type Article = { title: string; status: string; subtitle?: string };
		respond({ "@id": "/api/articles/1", "@type": "Article", title: "Hello" });
		const articles = entityServiceBuilder<Iri<"api/articles">, Article>(
			api,
			"/articles",
		);
		const strict = entityServiceBuilder<
			Iri<"api/articles">,
			Article,
			{ body: WriteBody<Article> & { title: string } }
		>(api, "/articles");

		await articles.create({ title: "Hello" });
		await articles.upsert({ title: "Hello" });
		// @ts-expect-error a given body can require a property
		await strict.create({ status: "published" });
	});

	test("replace should take every property that is not nullable", async () => {
		type Article = {
			title: string;
			status: string;
			subtitle?: string;
			summary: string | null;
			address: { city: string; zip?: string };
			readonly slug: string;
		};
		type Expected = {
			title: string;
			status: string;
			address:
				| AnyIri
				| { "@id": AnyIri; "@type"?: string | string[] }
				| ({ city: string; zip?: string | null } & object);
			subtitle?: string | null;
			summary?: string | null;
		};
		const check: Equal<ReplaceBody<Article>, Expected> = true;
		respond({ "@id": "/api/articles/1", "@type": "Article", slug: "hello" });
		const articles = entityServiceBuilder<Iri<"api/articles">, Article>(
			api,
			"/articles",
		);
		const address = { city: "Paris" };

		await articles.replace(1, { title: "Hello", status: "published", address });
		// @ts-expect-error a PUT resets the properties that are left out
		await articles.replace(1, { title: "Hello", address });
		// @ts-expect-error a PUT resets the properties of a nested object too
		await articles.replace(1, { title: "Hello", status: "draft", address: {} });

		const partial: ReplaceBody<{ company: Company | CompanyIri }> = {
			// @ts-expect-error a relation written as an object is whole
			company: { name: "Acme" },
		};

		assert.ok(check && partial);
	});

	test("an item should be sent back as it was read", async () => {
		type Article = {
			readonly id: number;
			title: string;
			subtitle?: string;
			author: Company | CompanyIri;
			reviewers: (Company | CompanyIri)[];
			readonly slug: string;
		};
		respond({
			"@id": "/api/articles/1",
			"@type": "Article",
			id: 1,
			title: "Hello",
			author: "/api/companies/acme",
			reviewers: [],
			slug: "hello",
		});
		const articles = entityServiceBuilder<Iri<"api/articles">, Article>(
			api,
			"/articles",
		);
		const article = await articles.get(1);
		const selected = await articles.get(1, {
			properties: ["title", "author.name"],
		});

		await articles.update({ ...article, title: "Bye" });
		await articles.update(article["@id"], article);
		await articles.update(selected);
		await articles.replace(article);
		await articles.upsert(article);
		await articles.create({ ...article, title: "Copy" });
	});

	test("the body should keep what a loose model declares", () => {
		type Loose = {
			name: string;
			metadata: Record<string, unknown>;
			payload: unknown;
			position: readonly [string, number];
			[key: string]: unknown;
		};
		type Polymorphic = { owner: Embedded<User, UserIri> | CompanyIri };
		type Profile = Item<{ name: string; manager?: User | UserIri }, UserIri>;
		const metadata: Record<string, unknown> = { views: 1 };
		const loose: WriteBody<Loose> = {
			metadata,
			payload: metadata.views,
			position: ["a", 1],
			extra: true,
		};
		// @ts-expect-error a declared property keeps its type next to an index signature
		const mistyped: WriteBody<Loose> = { name: 1 };
		// @ts-expect-error a tuple keeps its length
		const longer: WriteBody<Loose> = { position: ["a", 1, 2] };
		const owners: WriteBody<Polymorphic>[] = [
			{ owner: "/api/users/1" },
			{ owner: "/api/companies/acme" },
		];
		const checks: [
			Equal<keyof WriteBody<Profile>, "name" | "manager">,
			Equal<Extract<WriteBody<Profile>["manager"], string>, UserIri>,
			null extends WriteBody<Profile>["manager"] ? true : false,
		] = [true, true, true];

		assert.ok(loose && mistyped && longer && owners);
		assert.ok(checks.every(Boolean));
	});

	test("a recursive JSON property should be written without a depth error", async () => {
		type Json =
			| string
			| number
			| boolean
			| null
			| { [key: string]: Json | undefined }
			| Json[];
		type Doc = { readonly id: number; title: string; data: Json };
		respond({
			"@id": "/api/docs/1",
			"@type": "Doc",
			id: 1,
			title: "a",
			data: {},
		});
		const docs = entityServiceBuilder<Iri<"api/docs">, Doc>(api, "/docs");
		const doc = await docs.get(1);

		await docs.create({ title: "a", data: { list: [1, { deep: null }] } });
		await docs.update({ ...doc, title: "b" });
		await docs.upsert(doc);
		await docs.replace(doc);
		// @ts-expect-error the property keeps its type
		await docs.update(1, { data: Symbol("no") });
	});

	test("a relation narrowed to what cannot be written should be sent back", async () => {
		type Owner = { readonly id: number; readonly slug: string; name: string };
		type Project = {
			readonly id: number;
			name: string;
			owner: Owner | UserIri;
			members: (Owner | UserIri)[];
		};
		respond({ "@id": "/api/projects/1", "@type": "Project", name: "a" });
		const projects = entityServiceBuilder<Iri<"api/projects">, Project>(
			api,
			"/projects",
		);
		const narrowed = await projects.get(1, {
			properties: ["name", "owner.slug", "members.id"],
		});

		await projects.update(narrowed);
		await projects.upsert(narrowed);
		await projects.replace(narrowed);
	});

	test("the identifier of a resource should not be part of the body of an update", async () => {
		type Shape =
			| { readonly id: number; kind: "circle"; radius: number }
			| { readonly id: number; kind: "square"; side: number };
		type Tag = { id: string; label: string };
		respond({ "@id": "/api/tags/a", "@type": "Tag", id: "a", label: "A" });
		const shapes = entityServiceBuilder<Iri<"api/shapes">, Shape>(
			api,
			"/shapes",
		);
		const tags = entityServiceBuilder<Iri<"api/tags", string>, Tag>(
			api,
			"/tags",
		);
		const many: WriteBody<Tag[]> = [{ label: "A" }, { id: "b" }];
		const whole: ReplaceBody<Tag[]> = [{ id: "a", label: "A" }];
		const order: ReplaceBody<{ lines: { sku: string; quantity: number }[] }> = {
			// @ts-expect-error every item of a nested list is whole too
			lines: [{ sku: "a" }],
		};
		// @ts-expect-error every item of a replaced list is whole
		const partial: ReplaceBody<Tag[]> = [{ id: "a" }];

		await shapes.upsert({ id: null, kind: "square", side: 2 });
		await tags.create({ id: "a", label: "A" });
		await tags.upsert({ id: null, label: "A" });
		await tags.upsert({ "@id": null, label: "A" });
		await tags.replace("a", { label: "B" });
		await tags.update({ id: "a", label: "B" });
		// @ts-expect-error the identifier is in the path, not in the body
		await tags.update("a", { id: "b" });

		assert.equal(many.length + whole.length + partial.length, 4);
		assert.equal(order.lines.length, 1);
	});

	test("an item should be sent back when its IRI is not built from its id", async () => {
		type Article = {
			readonly id: number;
			readonly slug: string;
			title: string;
		};
		respond({
			"@id": "/api/articles/hello",
			"@type": "Article",
			title: "Hello",
		});
		const articles = entityServiceBuilder<Iri<"api/articles", string>, Article>(
			api,
			"/articles",
		);
		const article = await articles.get("hello");

		await articles.update(article);
		await articles.update({ ...article, title: "Bye" });
		await articles.replace(article);
		await articles.upsert(article);
		// @ts-expect-error the numeric id does not identify the article
		await articles.upsert({ id: 1, title: "Bye" });
		// @ts-expect-error an identifier given alone has the type of the IRI
		await articles.update({ id: 1, title: "Bye" });
	});

	test("a nested object narrowed to what cannot be written should be sent back", async () => {
		type Venue = {
			readonly id: number;
			name: string;
			address: { city: string; readonly formatted: string };
			owner: { readonly slug: string; name: string };
		};
		respond({ "@id": "/api/venues/1", "@type": "Venue", name: "a" });
		const venues = entityServiceBuilder<Iri<"api/venues">, Venue>(
			api,
			"/venues",
		);
		const narrowed = await venues.get(1, {
			properties: ["name", "address.formatted", "owner.slug"],
		});

		await venues.update(narrowed);
		await venues.upsert(narrowed);
		await venues.update(1, {
			owner: { "@id": "/api/users/1", "@type": "User" },
		});
		// @ts-expect-error a nested literal does not name a computed property
		await venues.update(1, { address: { formatted: "x" } });
	});

	test("the members of a collection of items should have no context", () => {
		type Member = Collection<Item<User, UserIri>, UserIri>["member"][number];
		const check: Equal<
			"@context" extends keyof Member ? true : false,
			false
		> = true;

		assert.ok(check);
	});

	test("a union entity should keep its members when it is read", async () => {
		type Shape =
			| { readonly id: number; kind: "circle"; radius: number }
			| { readonly id: number; kind: "square"; side: number };
		respond({
			member: [
				{ "@id": "/api/shapes/1", "@type": "Shape", kind: "circle", radius: 2 },
			],
		});
		const shapes = entityServiceBuilder<Iri<"api/shapes">, Shape>(
			api,
			"/shapes",
		);
		const [shape] = (await shapes.getAll()).member;
		const selected = await shapes.getAll({ properties: ["kind", "radius"] });
		const radius = shape?.kind === "circle" ? shape.radius : undefined;
		const kinds: ("circle" | "square")[] = selected.member.map(
			({ kind }) => kind,
		);

		const check: Equal<
			(typeof selected.member)[number]["kind"],
			"circle" | "square"
		> = true;

		if (shape) {
			await shapes.replace(shape);
		}
		await shapes.update(1, { kind: "square", side: 2 });
		await shapes.replace(1, { kind: "square", side: 2 });

		assert.ok(check);
		assert.equal(radius, 2);
		assert.deepEqual(kinds, ["circle"]);
	});

	test("a JSON-LD document typed with its keywords should be written in place", async () => {
		type Page = {
			title: string;
			schema: { "@context": string; "@type": string; name: string };
		};
		respond({ "@id": "/api/pages/1", "@type": "Page", title: "a" });
		const pages = entityServiceBuilder<Iri<"api/pages">, Page>(api, "/pages");

		await pages.update(1, {
			schema: {
				"@context": "https://schema.org",
				"@type": "Person",
				name: "A",
			},
		});
		// @ts-expect-error the keywords of the item itself are not part of its body
		await pages.update(1, { "@type": "Page", title: "b" });
	});

	test("generic code should take its bodies from the type of the service", async () => {
		const patch = <I extends AnyIri, T extends object>(
			service: EntityService<I, T>,
			id: IriId<I>,
			body: Parameters<EntityService<I, T>["update"]>[1],
		) => service.update(id, body);
		respond({ "@id": "/api/users/1", "@type": "User", name: "Bob" });
		const users = entityServiceBuilder<UserIri, User>(api, "/users");

		const updated = await patch(users, 1, { name: "Bob" });
		// @ts-expect-error the body is still the one of the resource
		await patch(users, 1, { missing: true });

		assert.equal(updated.name, "Bob");
	});

	test("the body of a union should keep the properties of each member", () => {
		type Shape =
			| { kind: "circle"; radius: number }
			| { kind: "square"; side: number };
		const circle: WriteBody<Shape> = { kind: "circle", radius: 2 };
		// @ts-expect-error a circle has no side
		const mixed: WriteBody<Shape> = { kind: "circle", side: 2 };

		assert.ok(circle && mixed);
	});

	test("a service should take another body when it is given one", async () => {
		respond({ "@id": "/api/users/1", "@type": "User", name: "Alice" });
		const accounts = entityServiceBuilder<
			UserIri,
			User,
			{ body: { name: string; plainPassword: string } }
		>(api, "/users");

		await accounts.create({ name: "Alice", plainPassword: "secret" });
		await accounts.update(1, { name: "Alice" });
		// @ts-expect-error the given body replaces the deduced one
		await accounts.create({ name: "Alice", email: "alice@example.com" });
	});

	test("a service without output should resolve its writes with null", async () => {
		global.fetch = async () => new Response(null, { status: 204 });
		const settings = entityServiceBuilder<
			UserIri,
			User,
			{ output: false; body: { name: string } }
		>(api, "/settings");

		const created: null = await settings.create({ name: "Dark" });
		const updated: null = await settings.update(1, { name: "Light" });

		assert.deepEqual([created, updated], [null, null]);
	});

	test("a service should list its collection in the serialization it is given", async () => {
		respond({ member: [], totalItems: 0 });
		type Listed = { readonly id: number; name: string };
		const users = entityServiceBuilder<UserIri, User, { collection: Listed }>(
			api,
			"/users",
		);

		const page = await users.getAll();
		const selected = await users.getAll({ properties: ["name"] });
		const all = await users.getAllPages({ pageSize: 10 });
		const checks: [
			Equal<(typeof page)["member"][number]["name"], string>,
			"email" extends keyof (typeof page)["member"][number] ? false : true,
			"id" extends keyof (typeof selected)["member"][number] ? false : true,
			"email" extends keyof (typeof all)["member"][number] ? false : true,
		] = [true, true, true, true];
		const email: string = (await users.get(1)).email;
		// @ts-expect-error the collection does not return the email
		await users.getAll({ properties: ["email"] });
		await users.getAll({ sortBy: [{ id: "email", desc: true }] });
		await users.getAllPages({ sortBy: [{ id: "company.name", desc: false }] });
		// @ts-expect-error sorting takes a property of the entity or of the collection
		await users.getAll({ sortBy: [{ id: "unknown", desc: true }] });
		await users.create({ name: "Alice", email: "alice@example.com" });

		assert.ok(checks.every(Boolean));
		assert.deepEqual([page.member, selected.member, all.member], [[], [], []]);
		assert.equal(email, undefined);
	});

	test("an option of the service should count when its key is optional", async () => {
		global.fetch = async () => new Response(null, { status: 204 });
		const settings = entityServiceBuilder<
			UserIri,
			User,
			{ body?: { secret: string }; output?: false; pagination?: "partial" }
		>(api, "/settings");
		const total = async () => {
			const page = await settings.getAll();
			// @ts-expect-error a partial collection has no total
			return page.totalItems;
		};

		const created: null = await settings.create({ secret: "x" });
		// @ts-expect-error the given body replaces the deduced one
		await settings.create({ name: "Alice" });
		// @ts-expect-error an optional key does not make the body optional
		await settings.create(undefined);

		assert.equal(created, null);
		assert.equal(typeof total, "function");
	});

	test("upsert should accept a body without an identifier yet", async () => {
		respond({ "@id": "/api/users/1", "@type": "User", name: "Alice" });
		const users = entityServiceBuilder<
			UserIri,
			User,
			{ body: { name: string } }
		>(api, "/users");

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
			.withQuery({ properties: ["name", "address.city", "company"] })
			.fetch();
		const name: string = account.name;
		const city: string = account.address.city;
		const company: CompanyIri = account.company;

		respond([{ name: "Alice" }]);
		const accounts = await api
			.get<Account[]>("/accounts")
			.withQuery({
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

	test("a request should take its headers and its body in one place", async () => {
		respond({ "@id": "/api/users/1", "@type": "User", name: "Alice" });
		const headers = { "X-Tenant": "acme" };

		await api.get<object>("/users/1").withHeaders(headers).fetch({ headers });
		await api
			.post<object, { name: string }>("/users")
			.fetch({ name: "Alice" }, { headers });
		// @ts-expect-error headers are given with withHeaders or to fetch
		api.get<object>("/users/1", headers);
		// @ts-expect-error the body is the first argument
		await api.post<object, object>("/users").fetch({}, { body: {} });
		await api
			.post<object, { name: string }>("/users")
			.withBody({ name: "Alice" })
			// @ts-expect-error the body was already given
			.fetch({ name: "Bob" }, {});
	});

	test("a date filter should take its dates in a record", async () => {
		respond({ member: [], totalItems: 0 });
		const date = new Date("2020-01-01T00:00:00Z");

		await api
			.get<Users>("/users")
			.withQuery({ filters: [{ id: "createdAt", value: { after: date } }] })
			.fetch();
		await assert.rejects(
			() =>
				api
					.get<Users>("/users")
					// @ts-expect-error a date on its own is not a filter value
					.withQuery({ filters: [{ id: "createdAt", value: date }] })
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
			.withQuery({ properties: ["customer.name"] })
			.fetch();
		const [order] = orders.member;
		const orderIri: OrderIri = order["@id"];
		const customerName: string = order.customer.name;
		// @ts-expect-error city was not selected
		assert.equal(order.customer.city, undefined);

		const networkPathIri: OrderIri = "//example.com/api/orders/1";
		// @ts-expect-error a path is not an absolute IRI
		const pathIri: OrderIri = "/api/orders/1";

		const service = entityServiceBuilder<OrderIri, Order>(api, "/orders");
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

		const users = entityServiceBuilder<UserIri, User>(api, "/users");
		const companies = entityServiceBuilder<
			CompanyIri,
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
