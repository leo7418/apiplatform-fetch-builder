import { test, describe } from "node:test";
import assert from "node:assert/strict";

import { generateTypes, type OpenApiDocument } from "./generate.ts";

const reference = (name: string) => ({ $ref: `#/components/schemas/${name}` });

const content = (name: string) => ({
	content: { "application/ld+json": { schema: reference(name) } },
});

const item = (name: string) => ({
	get: { responses: { "200": content(name) } },
});

const listed = (name: string) => ({
	get: {
		responses: {
			"200": {
				content: {
					"application/ld+json": {
						schema: {
							type: "object",
							properties: { member: { type: "array", items: reference(name) } },
						},
					},
				},
			},
		},
	},
});

const iri = { type: "string", format: "iri-reference" };

const openApi: OpenApiDocument = {
	paths: {
		"/api/articles": {
			get: { parameters: [{ name: "page" }, { name: "properties[]" }] },
			post: { requestBody: content("Article-article.write") },
		},
		"/api/articles/{id}": item("Article.jsonld-article.read"),
		"/api/authors/{id}": item("Author.jsonld"),
		"/api/authors/{id}/articles/{article}": item("Article.jsonld-article.read"),
		"/api/authors/{id}/notes/{note}": item("Note.jsonld"),
		"/api/books": {
			get: { parameters: [{ name: "properties[]" }] },
			post: { requestBody: content("Book.jsonld") },
		},
		"/api/books/{isbn}": item("Book.jsonld"),
		"/api/health": { get: { responses: { "200": {} } } },
		"/api/logs": {
			get: {
				responses: {
					"200": {
						content: {
							"application/ld+json": {
								schema: {
									allOf: [
										reference("HydraCollectionBaseSchema"),
										{
											type: "object",
											properties: {
												member: {
													type: "array",
													items: reference("Log.jsonld"),
												},
											},
										},
									],
								},
							},
						},
					},
				},
			},
		},
	},
	components: {
		schemas: {
			HydraItemBaseSchema: {
				type: "object",
				properties: { "@id": { type: "string" }, "@type": { type: "string" } },
			},
			"Article.jsonld-article.read": {
				allOf: [
					reference("HydraItemBaseSchema"),
					{
						type: "object",
						properties: {
							id: { readOnly: true, type: "integer" },
							title: { type: "string" },
							status: { type: "string", enum: ["draft", "published"] },
							publishedAt: { type: ["string", "null"], format: "date-time" },
							subtitle: { type: "string", nullable: true },
							tags: { type: "array", items: { type: "string" } },
							seo: reference("Seo.jsonld-article.read"),
							author: {
								anyOf: [
									reference("Author.jsonld-article.read"),
									{ type: "null" },
								],
							},
							company: { ...iri, type: ["string", "null"] },
							reviewers: { type: "array", items: iri },
							slug: { type: "string" },
						},
					},
				],
			},
			"Article-article.write": {
				type: "object",
				properties: {
					title: { type: "string" },
					status: { type: "string" },
					publishedAt: { type: "string" },
					subtitle: { type: "string" },
					tags: { type: "array" },
					seo: reference("Seo.jsonld-article.read"),
					author: iri,
					company: iri,
					reviewers: { type: "array", items: iri },
					plainSecret: { type: ["string", "null"] },
				},
			},
			"Author.jsonld-article.read": {
				allOf: [
					reference("HydraItemBaseSchema"),
					{ type: "object", properties: { name: { type: "string" } } },
				],
			},
			"Author.jsonld": {
				type: "object",
				properties: {
					"@id": { type: "string" },
					id: { readOnly: true, type: "integer" },
					name: { type: "string" },
					biography: { type: "string" },
				},
			},
			"Seo.jsonld-article.read": {
				type: "object",
				properties: {
					description: { type: ["string", "null"] },
					keywords: { type: "array", items: {} },
				},
			},
			"Book.jsonld": {
				type: "object",
				properties: {
					isbn: { type: "string" },
					title: { type: "string" },
					author: iri,
				},
			},
			"Note.jsonld": {
				type: "object",
				properties: { text: { type: "string" }, author: iri },
			},
			"Log.jsonld": {
				type: "object",
				properties: {
					id: { readOnly: true, type: "integer" },
					message: { type: "string" },
					author: reference("Author.jsonld"),
					readers: {
						type: "array",
						items: reference("Author.jsonld-article.read"),
					},
				},
			},
		},
	},
};

const hydraDocument = {
	supportedClass: [
		{
			"@id": "#Article",
			title: "Article",
			supportedProperty: [
				{ title: "title", property: { range: "xsd:string" } },
				{ title: "company", property: { "@type": "Link", range: "#Company" } },
				{ title: "reviewers", property: { "@type": "Link", range: "#Author" } },
			],
		},
		{ "@id": "#Author", title: "Author", supportedProperty: [] },
		{
			"@id": "#Book",
			title: "Book",
			supportedProperty: [{ title: "author", property: { range: "#Author" } }],
		},
		{
			"@id": "#Note",
			title: "Note",
			supportedProperty: [{ title: "author", property: { range: "#Author" } }],
		},
		{ "@id": "#Company", title: "Company", supportedProperty: [] },
	],
};

const EXPECTED = `// Generated by apiplatform-fetch-builder. Do not edit.

import type { AnyIri, Embedded, Iri, WriteBody } from "apiplatform-fetch-builder";

// As a service: entityServiceBuilder<ArticleIri, Article, { body: ArticleBody }>(api, "/api/articles")
export type ArticleIri =
	| Iri<"api/articles">
	| Iri<\`api/authors/\${string}/articles\`, string | number>;
export type Article = {
	readonly id: number;
	title: string;
	status: "draft" | "published";
	publishedAt?: string;
	subtitle?: string;
	tags: string[];
	seo: {
		description?: string;
		keywords: unknown[];
	};
	author?: Embedded<{ name: string }, AuthorIri>;
	company?: AnyIri;
	reviewers: AuthorIri[];
	readonly slug: string;
};
export type ArticleBody = WriteBody<Article> & {
	plainSecret?: string | null;
};

// As a service: entityServiceBuilder<AuthorIri, Author>(api, "/api/authors")
export type AuthorIri = Iri<"api/authors">;
export type Author = {
	readonly id: number;
	readonly name: string;
	readonly biography: string;
};

// As a service: entityServiceBuilder<BookIri, Book>(api, "/api/books")
export type BookIri = Iri<"api/books", string>;
export type Book = {
	isbn: string;
	title: string;
	author: Author | AuthorIri;
};

// As a service: entityServiceBuilder<LogIri, Log>(api, "/api/logs")
export type LogIri = Iri<string, string | number>;
export type Log = {
	readonly id: number;
	readonly message: string;
	readonly author: Embedded<
		{
			readonly id: number;
			name: string;
			biography: string;
		},
		AuthorIri
	>;
	readonly readers: (Embedded<{ name: string }, AuthorIri>)[];
};

// As a service: entityServiceBuilder<NoteIri, Note>(api, "/api/authors/{id}/notes")
export type NoteIri = Iri<\`api/authors/\${string}/notes\`, string | number>;
export type Note = {
	readonly text: string;
	readonly author: AuthorIri;
};
`;

describe("generateTypes", () => {
	test("should write the IRI type and the model of every resource", () => {
		assert.equal(generateTypes(openApi, hydraDocument), EXPECTED);
	});

	test("should type a relation as any IRI without the Hydra documentation", () => {
		const generated = generateTypes(openApi);

		assert.match(generated, /\treviewers: AnyIri\[\];/);
		assert.doesNotMatch(generated, /AuthorIri\[\]/);
	});

	test("should find the target of a relation to a class the Hydra documentation lists twice", () => {
		const twice = {
			supportedClass: [
				...hydraDocument.supportedClass,
				{ "@id": "#Author", title: "Author", supportedProperty: [] },
			],
		};

		assert.match(generateTypes(openApi, twice), /\treviewers: AuthorIri\[\];/);
	});

	test("should read the prefixed keys of an older Hydra documentation", () => {
		const prefixed = {
			"hydra:supportedClass": [
				{
					"@id": "#Article",
					"hydra:title": "Article",
					"hydra:supportedProperty": [
						{
							"hydra:title": "reviewers",
							"hydra:property": { "rdfs:range": "#Author" },
						},
					],
				},
				{ "@id": "#Author", "hydra:title": "Author" },
			],
		};

		assert.match(
			generateTypes(openApi, prefixed),
			/\treviewers: AuthorIri\[\];/,
		);
	});

	test("should find a resource that only has a collection in the older format", () => {
		const listed: OpenApiDocument = {
			paths: {
				"/events": {
					get: {
						responses: {
							"200": {
								content: {
									"application/ld+json": {
										schema: {
											type: "object",
											properties: {
												"hydra:member": {
													type: "array",
													items: reference("Event.jsonld"),
												},
											},
										},
									},
								},
							},
						},
					},
				},
			},
			components: {
				schemas: {
					"Event.jsonld": {
						type: "object",
						properties: { name: { type: "string" } },
					},
				},
			},
		};

		assert.match(
			generateTypes(listed),
			/export type EventIri = Iri<string, string \| number>;\nexport type Event = \{\n\treadonly name: string;\n\};/,
		);
	});

	test("should write a nullable property as null or left out on request", () => {
		const generated = generateTypes(openApi, hydraDocument, true);

		assert.match(generated, /^\/\/ Generated .+ with --keep-null-values\. /);
		assert.match(generated, /\tpublishedAt\?: string \| null;/);
		assert.match(generated, /\t\tdescription\?: string \| null;/);
		assert.match(
			generated,
			/\tauthor\?: Embedded<\{ name: string \}, AuthorIri> \| null;/,
		);
		assert.match(generated, /\tplainSecret\?: string \| null;/);
	});

	test("should keep its own types apart from the resources of the same name", () => {
		const secret = { writeOnly: true, type: "string" };
		const named: OpenApiDocument = {
			paths: {
				"/iris": { post: { requestBody: content("Iri.jsonld") } },
				"/iris/{id}": item("Iri.jsonld"),
				"/embeddeds/{id}": item("Embedded.jsonld"),
				"/messages": { post: { requestBody: content("Message.jsonld") } },
				"/messages/{id}": item("Message.jsonld"),
				"/message_bodies/{id}": item("MessageBody.jsonld"),
			},
			components: {
				schemas: {
					"Iri.jsonld": {
						type: "object",
						properties: { embedded: reference("Embedded.jsonld"), secret },
					},
					"Embedded.jsonld": {
						type: "object",
						properties: { name: { type: "string" } },
					},
					"Message.jsonld": {
						type: "object",
						properties: { text: { type: "string" }, secret },
					},
					"MessageBody.jsonld": {
						type: "object",
						properties: { text: { type: "string" } },
					},
				},
			},
		};
		const generated = generateTypes(named);

		assert.match(
			generated,
			/import type \{ Embedded as ApiEmbedded, Iri as ApiIri, WriteBody \} from/,
		);
		assert.match(generated, /export type IriIri = ApiIri<"iris", /);
		assert.match(
			generated,
			/\tembedded: ApiEmbedded<\{ name: string \}, EmbeddedIri>;/,
		);
		assert.match(generated, /export type IriBody = WriteBody<Iri> & \{/);
		assert.match(
			generated,
			/export type MessageWriteBody = WriteBody<Message> & \{/,
		);
		assert.match(generated, /export type MessageBody = \{/);
	});

	test("should write a model for each other serialization of a resource", () => {
		const id = { readOnly: true, type: "integer" };
		const title = { type: "string" };
		const serialized: OpenApiDocument = {
			paths: {
				"/blog_posts": {
					...listed("BlogPost.jsonld-blog_post.list"),
					post: {
						requestBody: content("BlogPost.jsonld-blog_post.write"),
						responses: {
							"201": content(
								"BlogPost.jsonld-blog_post.read_validation.Default",
							),
						},
					},
				},
				"/blog_posts/{id}": item("BlogPost.jsonld-blog_post.read"),
				"/me/blog_posts": listed("BlogPost.jsonld-blogPost.list_mine"),
				"/admin/blog_posts": listed("BlogPost.jsonld-admin.read"),
				"/drafts": listed("BlogPost.jsonld"),
			},
			components: {
				schemas: {
					"BlogPost.jsonld-blog_post.read": {
						type: "object",
						properties: { id, title, body: title },
					},
					"BlogPost.jsonld-blog_post.read_validation.Default": {
						type: "object",
						properties: { "@id": title, id, title, body: title },
					},
					"BlogPost.jsonld-blog_post.write": {
						type: "object",
						properties: { title, body: title },
					},
					"BlogPost.jsonld-blog_post.list": {
						type: "object",
						properties: { id, title },
					},
					"BlogPost.jsonld-blogPost.list_mine": {
						type: "object",
						properties: { id, title },
					},
					"BlogPost.jsonld-admin.read": {
						type: "object",
						properties: { id, title, views: { type: "integer" } },
					},
					"BlogPost.jsonld": {
						type: "object",
						properties: { id, title, secret: { type: ["string", "null"] } },
					},
				},
			},
		};

		assert.match(
			generateTypes(serialized, undefined, true),
			/export type BlogPostFull = \{\n\treadonly id: number;\n\treadonly title: string;\n\treadonly secret\?: string \| null;\n\};/,
		);
		assert.equal(
			generateTypes(serialized),
			`// Generated by apiplatform-fetch-builder. Do not edit.

import type { Iri } from "apiplatform-fetch-builder";

// As a service: entityServiceBuilder<BlogPostIri, BlogPost, { collection: BlogPostList }>(api, "/blog_posts")
export type BlogPostIri = Iri<"blog_posts">;
export type BlogPost = {
	readonly id: number;
	title: string;
	body: string;
};
/** Returned by GET /admin/blog_posts. */
export type BlogPostAdminRead = {
	readonly id: number;
	readonly title: string;
	readonly views: number;
};
/** Returned by GET /drafts. */
export type BlogPostFull = {
	readonly id: number;
	readonly title: string;
	readonly secret?: string;
};
/** Returned by GET /blog_posts, GET /me/blog_posts. */
export type BlogPostList = {
	readonly id: number;
	title: string;
};
`,
		);
	});

	test("should name a serialization after its groups only", () => {
		const named = (resource: string, schema: string) =>
			generateTypes({
				paths: {
					"/things": listed(schema),
					"/things/{id}": item(`${resource}.jsonld`),
				},
				components: {
					schemas: {
						[`${resource}.jsonld`]: {
							type: "object",
							properties: { name: { type: "string" } },
						},
						[schema]: { type: "object", properties: {} },
					},
				},
			}).match(/export type (\w+) = \{\};/)?.[1];

		assert.deepEqual(
			[
				named("User", "User.jsonld-users.list"),
				named("BlogPost", "BlogPost.jsonld-blogpost.list"),
				named("BlogPost", "BlogPost.jsonld-post.list"),
				named("User", "User.jsonld-user.list_user.list.company"),
				named("Product", "Product.jsonld-item.get_validation.Default_create"),
				named("User", "User.jsonld-user"),
				named("Thing", "Thing.jsonld-things.list"),
			],
			[
				"UserList",
				"BlogPostList",
				"BlogPostList",
				"UserListCompany",
				"ProductItemGet",
				"UserUser",
				"ThingList",
			],
		);
	});

	test("should take the shortest item route of a resource as its model, all its item routes as its IRI, and the writes of each route for the model it returns", () => {
		const id = { readOnly: true, type: "integer" };
		const name = { type: "string" };
		const cost = { type: "number" };
		const routed: OpenApiDocument = {
			paths: {
				"/admin/products": listed("Product.jsonld-admin.read"),
				"/admin/products/{id}": {
					...item("Product.jsonld-admin.read"),
					patch: { requestBody: content("Product.jsonld-admin.write") },
				},
				"/products/{id}": item("Product.jsonld-product.read"),
			},
			components: {
				schemas: {
					"Product.jsonld-product.read": {
						type: "object",
						properties: { id, name },
					},
					"Product.jsonld-admin.read": {
						type: "object",
						properties: { id, name, cost },
					},
					"Product.jsonld-admin.write": {
						type: "object",
						properties: { name, cost },
					},
				},
			},
		};

		assert.equal(
			generateTypes(routed),
			`// Generated by apiplatform-fetch-builder. Do not edit.

import type { Iri } from "apiplatform-fetch-builder";

// As a service: entityServiceBuilder<ProductIri, Product>(api, "/products")
export type ProductIri = Iri<"products"> | Iri<"admin/products">;
export type Product = {
	readonly id: number;
	readonly name: string;
};
/** Returned by GET /admin/products, GET /admin/products/{id}. */
export type ProductAdminRead = {
	readonly id: number;
	name: string;
	cost: number;
};
`,
		);
	});

	test("should name a serialization that embeds itself, and no model for a schema that has none", () => {
		const name = { type: "string" };
		const nested: OpenApiDocument = {
			paths: {
				"/categories/{id}": item("Category.jsonld"),
				"/employees": listed("Employee.jsonld-employee.list"),
				"/employees/{id}": item("Employee.jsonld-employee.read"),
			},
			components: {
				schemas: {
					"Category.jsonld": { type: "object", properties: { name } },
					"Category.jsonld-employee.read": {
						type: "object",
						properties: {
							parent: reference("Category.jsonld-employee.read"),
						},
					},
					"Employee.jsonld-employee.read": {
						type: "object",
						properties: {
							salary: { type: "number" },
							manager: reference("Employee.jsonld-employee.read"),
							category: reference("Category.jsonld-employee.read"),
						},
					},
					"Employee.jsonld-employee.list": {
						type: "object",
						properties: {
							manager: reference("Employee.jsonld-employee.list"),
						},
					},
				},
			},
		};
		const generated = generateTypes(nested);

		assert.match(
			generated,
			/\treadonly manager: Embedded<Employee, EmployeeIri>;\n\treadonly category: Embedded<\n\t\t\{\n\t\t\tparent: Embedded<\{ \[key: string\]: unknown \}, CategoryIri>;/,
		);
		assert.match(
			generated,
			/export type EmployeeList = \{\n\treadonly manager: Embedded<EmployeeList, EmployeeIri>;\n\};/,
		);
	});

	test("should tell apart the objects that are not resources and share a name", () => {
		const count = { type: "integer" };
		const shared: OpenApiDocument = {
			paths: {
				"/users/stats": item("User.Stats.jsonld"),
				"/users/statistics": item("User.Stats"),
				"/users/{id}": item("User.jsonld"),
				"/tasks/stats": item("Task2.Stats.jsonld"),
				"/tasks/{id}": item("Task.jsonld"),
				"/contact": { post: { requestBody: content("Contact.jsonld") } },
				"/reports/short": item("Summary.Report.jsonld-short"),
				"/reports/long": item("Summary.Report.jsonld-long"),
				"/dashboard": item("Dashboard.jsonld"),
			},
			components: {
				schemas: {
					"User.Stats.jsonld": { type: "object", properties: { users: count } },
					"User.Stats": { type: "object", properties: { users: count } },
					"Task2.Stats.jsonld": {
						type: "object",
						properties: { tasks: count },
					},
					"User.jsonld": { type: "object", properties: {} },
					"Task.jsonld": { type: "object", properties: {} },
					"Contact.jsonld": {
						type: "object",
						properties: { phone: { type: ["string", "null"] } },
					},
					"Summary.Report.jsonld-short": {
						type: "object",
						properties: { total: count },
					},
					"Summary.Report.jsonld-long": {
						type: "object",
						properties: { total: count, lines: { type: "array" } },
					},
					"Dashboard.jsonld": { type: "object", properties: { open: count } },
				},
			},
		};

		const generated = generateTypes(shared);

		assert.deepEqual(
			[...generated.matchAll(/export type (\w+) = /g)].map(([, name]) => name),
			[
				"TaskIri",
				"Task",
				"UserIri",
				"User",
				"Contact",
				"Dashboard",
				"SummaryReportLong",
				"SummaryReportShort",
				"TaskStats",
				"UserStats",
			],
		);
		assert.match(
			generated,
			/\/\*\* Taken by POST \/contact\. \*\/\nexport type Contact = \{\n\tphone\?: string \| null;\n\};/,
		);
		assert.match(
			generated,
			/\/\*\* Returned by GET \/users\/statistics, GET \/users\/stats\. \*\/\nexport type UserStats = /,
		);
	});

	test("should keep the null of an array item or of a map value", () => {
		const nullable: OpenApiDocument = {
			paths: { "/games/{id}": item("Game.jsonld") },
			components: {
				schemas: {
					"Game.jsonld": {
						type: "object",
						properties: {
							scores: {
								type: "array",
								items: { type: ["integer", "null"] },
							},
							labels: {
								type: "object",
								additionalProperties: { type: ["string", "null"] },
							},
						},
					},
				},
			},
		};
		const generated = generateTypes(nullable);

		assert.match(generated, /\treadonly scores: \(number \| null\)\[\];/);
		assert.match(
			generated,
			/\treadonly labels: \{ \[key: string\]: string \| null \};/,
		);
	});

	test("should read the base path of the API, and leave out one it cannot read", () => {
		const under = (url: string) =>
			generateTypes({
				servers: [{ url }],
				paths: { "/users/{id}": item("User.jsonld") },
				components: {
					schemas: { "User.jsonld": { type: "object", properties: {} } },
				},
			}).match(/Iri<"([^"]+)"/)?.[1];

		assert.deepEqual(
			[
				under("/index.php"),
				under("https://example.com/v2/"),
				under("v2"),
				under("/"),
				under("http://"),
				under("{scheme}://example.com/{base}"),
			],
			["index.php/users", "v2/users", "v2/users", "users", "users", "users"],
		);
	});

	test("should write the body of a write route that has groups of its own", () => {
		const text = { type: "string" };
		const patched = (name: string) => ({
			patch: {
				requestBody: {
					content: {
						"application/merge-patch+json": { schema: reference(name) },
					},
				},
			},
		});
		const custom: OpenApiDocument = {
			paths: {
				"/accounts/{id}": {
					...item("Account.jsonld"),
					...patched("Account-account.write.jsonMergePatch"),
				},
				"/accounts/{id}/email": patched("Account-account.email.jsonMergePatch"),
				"/register": {
					post: {
						requestBody: content(
							"Account.jsonld-account.register_validation.Default",
						),
					},
				},
				"/reviews": listed("Review.jsonld"),
				"/reviews/{id}": patched("Review-review.write.jsonMergePatch"),
			},
			components: {
				schemas: {
					"Account.jsonld": {
						type: "object",
						properties: { email: text, name: text },
					},
					"Account-account.write.jsonMergePatch": {
						type: "object",
						properties: { name: text },
					},
					"Account-account.email.jsonMergePatch": {
						type: "object",
						properties: { email: text },
					},
					"Account.jsonld-account.register_validation.Default": {
						type: "object",
						required: ["email"],
						properties: {
							id: { readOnly: true, type: "integer" },
							email: text,
							plainPassword: { type: ["string", "null"] },
							sponsor: iri,
						},
					},
					"Review.jsonld": { type: "object", properties: { body: text } },
					"Review-review.write.jsonMergePatch": {
						type: "object",
						properties: { body: text },
					},
				},
			},
		};

		assert.equal(
			generateTypes(custom),
			`// Generated by apiplatform-fetch-builder. Do not edit.

import type { AnyIri, Iri } from "apiplatform-fetch-builder";

// As a service: entityServiceBuilder<AccountIri, Account>(api, "/accounts")
export type AccountIri = Iri<"accounts", string | number>;
export type Account = {
	readonly email: string;
	name: string;
};
/** Taken by PATCH /accounts/{id}/email. */
export type AccountEmailBody = {
	email?: string;
};
/** Taken by POST /register. */
export type AccountRegisterBody = {
	email: string;
	plainPassword?: string | null;
	sponsor?: AnyIri;
};

// As a service: entityServiceBuilder<ReviewIri, Review>(api, "/reviews")
export type ReviewIri = Iri<string, string | number>;
export type Review = {
	body: string;
};
`,
		);
	});

	test("should take the IRI type of a class from all its item routes", () => {
		const id = { readOnly: true, type: "integer" };
		const routed = (first: string, second: string) =>
			generateTypes({
				paths: {
					"/admin/coupons/{id}": item(first),
					"/coupons/{id}": item(second),
				},
				components: {
					schemas: {
						[first]: { type: "object", properties: { id } },
						[second]: { type: "object", properties: { id } },
					},
				},
			}).match(/export type CouponIri = (.+);/)?.[1];

		assert.deepEqual(
			[
				routed("Coupon.jsonld", "Coupon3.jsonld"),
				routed("Coupon3.jsonld", "Coupon.jsonld"),
				routed("Coupon.jsonld-admin", "Coupon.jsonld"),
			],
			Array(3).fill('Iri<"coupons"> | Iri<"admin/coupons">'),
		);
	});

	test("should take serializations that only differ by their validation groups for one", () => {
		const text = { type: "string" };
		const validated: OpenApiDocument = {
			paths: {
				"/products": {
					post: {
						requestBody: content(
							"Product-product.create_validation.product.create",
						),
						responses: {
							"201": content("Product.jsonld-validation.product.create"),
						},
					},
				},
				"/products/{id}": {
					...item("Product.jsonld"),
					put: { requestBody: content("Product") },
				},
				"/products/import": {
					post: {
						requestBody: content("Product-validation.product.import"),
						responses: {
							"201": content("Product.jsonld-validation.product.import"),
						},
					},
				},
				"/admin/products": {
					...listed("Product.jsonld-admin.read"),
					post: {
						responses: {
							"201": content("Product.jsonld-admin.read_validation.admin"),
						},
					},
				},
			},
			components: {
				schemas: {
					"Product.jsonld": {
						type: "object",
						properties: { kind: text, name: text },
					},
					"Product.jsonld-validation.product.create": {
						type: "object",
						required: ["kind"],
						properties: { kind: { ...text, enum: ["a", "b"] }, name: text },
					},
					"Product.jsonld-validation.product.import": {
						type: "object",
						properties: { kind: { ...text, enum: ["c"] }, name: text },
					},
					"Product-product.create_validation.product.create": {
						type: "object",
						properties: { kind: { ...text, enum: ["a", "b"] } },
					},
					Product: { type: "object", properties: { kind: text, name: text } },
					"Product-validation.product.import": {
						type: "object",
						properties: { kind: { ...text, enum: ["c"] }, name: text },
					},
					"Product.jsonld-admin.read": {
						type: "object",
						properties: { kind: text, secret: text },
					},
					"Product.jsonld-admin.read_validation.admin": {
						type: "object",
						properties: { kind: { ...text, enum: ["a"] }, secret: text },
					},
				},
			},
		};
		const generated = generateTypes(validated);

		assert.deepEqual(
			[...generated.matchAll(/export type (\w+) = /g)].map(([, name]) => name),
			["ProductIri", "Product", "ProductAdminRead"],
		);
		assert.match(
			generated,
			/\/\*\* Returned by GET \/admin\/products, POST \/admin\/products\. \*\/\nexport type ProductAdminRead = /,
		);
	});

	test("should say what the service of a resource needs, and that its collections are prefixed", () => {
		const silent: OpenApiDocument = {
			paths: {
				"/webhooks": {
					get: {
						responses: {
							"200": {
								content: {
									"application/ld+json": {
										schema: {
											type: "object",
											properties: {
												"hydra:member": {
													type: "array",
													items: reference("Webhook.jsonld"),
												},
											},
										},
									},
								},
							},
						},
					},
					post: {
						requestBody: content("Webhook.jsonld"),
						responses: { "204": {} },
					},
				},
				"/webhooks/{id}": item("Webhook.jsonld"),
			},
			components: {
				schemas: {
					"Webhook.jsonld": {
						type: "object",
						properties: { url: { type: "string" } },
					},
				},
			},
		};
		const generated = generateTypes(silent);

		assert.match(
			generated,
			/\/\/ As a service: entityServiceBuilder<WebhookIri, Webhook, \{ output: false \}>\(api, "\/webhooks"\)\nexport type WebhookIri = /,
		);
		assert.match(
			generated,
			/\ndeclare module "apiplatform-fetch-builder" \{\n\tinterface Register \{\n\t\thydraPrefix: true;\n\t\}\n\}\n/,
		);
	});

	test("should not write a body for a route that takes what the standard writes take", () => {
		const subject = { type: "string" };
		const imported: OpenApiDocument = {
			paths: {
				"/tickets": {
					post: {
						requestBody: content(
							"Ticket.jsonld-ticket.write_validation.Default",
						),
					},
				},
				"/tickets/{id}": item("Ticket.jsonld"),
				"/tickets/import": {
					post: { requestBody: content("Ticket.jsonld-ticket.write") },
				},
			},
			components: {
				schemas: {
					"Ticket.jsonld": { type: "object", properties: { subject } },
					"Ticket.jsonld-ticket.write": {
						type: "object",
						properties: { subject },
					},
					"Ticket.jsonld-ticket.write_validation.Default": {
						type: "object",
						properties: { subject },
					},
				},
			},
		};

		assert.doesNotMatch(generateTypes(imported), /Taken by/);
	});

	test("should write what a body holds as it is sent", () => {
		const text = { type: "string" };
		const sent: OpenApiDocument = {
			paths: {
				"/users/{id}": item("User.jsonld"),
				"/companies/{id}": item("Company.jsonld"),
				"/register": {
					post: { requestBody: content("User.jsonld-user.register") },
				},
				"/login": { post: { requestBody: content("Credentials") } },
			},
			components: {
				schemas: {
					"User.jsonld": { type: "object", properties: { email: text } },
					"Company.jsonld": { type: "object", properties: { name: text } },
					"User.jsonld-user.register": {
						type: "object",
						required: ["email", "company", "nickname"],
						properties: {
							email: text,
							company: reference("Company.jsonld-user.register"),
							prefs: {
								type: "object",
								required: ["theme"],
								properties: { theme: text, lang: { type: ["string", "null"] } },
							},
							nickname: { type: ["string", "null"] },
						},
					},
					"Company.jsonld-user.register": {
						type: "object",
						required: ["name"],
						properties: {
							"@id": text,
							name: text,
							vat: { type: ["string", "null"] },
							code: { ...text, readOnly: true },
						},
					},
					Credentials: {
						type: "object",
						properties: {
							email: text,
							password: { ...text, writeOnly: true },
							token: { ...text, readOnly: true },
						},
					},
				},
			},
		};
		const generated = generateTypes(sent);

		assert.match(
			generated,
			/export type UserRegisterBody = \{\n\temail: string;\n\tcompany: CompanyIri \| \{\n\t\tname: string;\n\t\tvat\?: string \| null;\n\t\};\n\tprefs\?: \{\n\t\ttheme: string;\n\t\tlang\?: string \| null;\n\t\};\n\tnickname: string;\n\};/,
		);
		assert.match(
			generated,
			/export type Credentials = \{\n\temail: string;\n\tpassword: string;\n\};/,
		);
	});

	test("should keep apart the objects that only differ by what they take", () => {
		const text = { type: "string" };
		const secret = { ...text, writeOnly: true };
		const objects: OpenApiDocument = {
			paths: {
				"/settings": {
					get: {
						responses: { "200": content("Settings.jsonld-settings.read") },
					},
					put: { requestBody: content("Settings-settings.write") },
				},
				"/login": { post: { requestBody: content("Credentials-login") } },
				"/reset": { post: { requestBody: content("Credentials-reset") } },
			},
			components: {
				schemas: {
					"Settings.jsonld-settings.read": {
						type: "object",
						properties: { email: text },
					},
					"Settings-settings.write": {
						type: "object",
						properties: { email: text, currentPassword: secret },
					},
					"Credentials-login": {
						type: "object",
						properties: { email: text, password: secret },
					},
					"Credentials-reset": {
						type: "object",
						properties: { email: text, token: secret },
					},
				},
			},
		};
		const generated = generateTypes(objects);

		assert.deepEqual(
			[...generated.matchAll(/export type (\w+) = /g)].map(([, name]) => name),
			["CredentialsLogin", "CredentialsReset", "SettingsRead", "SettingsWrite"],
		);
		assert.match(
			generated,
			/export type SettingsWrite = \{\n\temail: string;\n\tcurrentPassword: string;\n\};/,
		);
		assert.match(
			generated,
			/export type CredentialsReset = \{\n\temail: string;\n\ttoken: string;\n\};/,
		);
	});

	test("should keep the model of a class named like another one followed by a number", () => {
		const text = { type: "string" };
		const named: OpenApiDocument = {
			paths: {
				"/oauths/{id}": item("Oauth.jsonld"),
				"/oauth2s/{id}": item("Oauth2.jsonld"),
				"/ipv4s/{id}": item("Ipv4.jsonld"),
				"/admin/ipv4s/{id}": item("Ipv42.jsonld"),
			},
			components: {
				schemas: {
					"Oauth.jsonld": { type: "object", properties: { clientId: text } },
					"Oauth2.jsonld": {
						type: "object",
						properties: { clientId: text, scopes: text },
					},
					"Ipv4.jsonld": { type: "object", properties: { address: text } },
					"Ipv42.jsonld": { type: "object", properties: { address: text } },
				},
			},
		};
		const generated = generateTypes(named);

		assert.match(
			generated,
			/\/\*\* Returned by GET \/oauth2s\/\{id\}\. \*\/\nexport type OauthFull = \{\n\treadonly clientId: string;\n\treadonly scopes: string;\n\};/,
		);
		assert.match(
			generated,
			/export type Ipv4Iri =\n\t\| Iri<"ipv4s", string \| number>\n\t\| Iri<"admin\/ipv4s", string \| number>;/,
		);
		assert.doesNotMatch(generated, /Ipv42/);
	});

	test("should write a route that answers plain JSON without the keys of JSON-LD", () => {
		const text = { type: "string" };
		const plain: OpenApiDocument = {
			paths: {
				"/books/{id}": item("Book.jsonld"),
				"/public/books/{id}": {
					get: {
						responses: {
							"200": {
								content: {
									"application/json": { schema: reference("Book-public") },
								},
							},
						},
					},
				},
				"/users/{id}": item("User.jsonld"),
			},
			components: {
				schemas: {
					"Book.jsonld": {
						type: "object",
						properties: { name: text, owner: reference("User.jsonld") },
					},
					"Book-public": {
						type: "object",
						properties: { name: text, owner: reference("User-public") },
					},
					"User.jsonld": { type: "object", properties: { name: text } },
					"User-public": { type: "object", properties: { name: text } },
				},
			},
		};

		assert.match(
			generateTypes(plain),
			/\/\*\* Returned in plain JSON by GET \/public\/books\/\{id\}\. \*\/\nexport type BookPublic = \{\n\treadonly name: string;\n\treadonly owner: \{\n\t\tname: string;\n\t\};\n\};/,
		);
	});

	test("should name a model that a later declaration refers to through the twin of its schema", () => {
		const text = { type: "string" };
		const twins: OpenApiDocument = {
			paths: {
				"/organizations/{id}": item("Organization.jsonld-org.read"),
				"/admin/organizations/{id}": item("Organization2.jsonld-org.admin"),
			},
			components: {
				schemas: {
					"Organization.jsonld-org.read": {
						type: "object",
						properties: { name: text },
					},
					"Organization2.jsonld-org.admin": {
						type: "object",
						properties: {
							name: text,
							parent: reference("Organization.jsonld-org.admin"),
						},
					},
					"Organization.jsonld-org.admin": {
						type: "object",
						properties: {
							name: text,
							parent: reference("Organization.jsonld-org.admin"),
						},
					},
				},
			},
		};

		assert.match(
			generateTypes(twins),
			/export type OrganizationOrgAdmin = \{\n\treadonly name: string;\n\treadonly parent: Embedded<OrganizationOrgAdmin, OrganizationIri>;\n\};/,
		);
	});

	test("should keep a route that holds the end of a comment inside the comment, and an enumeration of null only to its type", () => {
		const generated = generateTypes({
			paths: {
				"/stats*/x": item("Stats.jsonld"),
				"/things/{id}": item("Thing.jsonld"),
			},
			components: {
				schemas: {
					"Stats.jsonld": { type: "object", properties: {} },
					"Thing.jsonld": {
						type: "object",
						properties: { kind: { type: ["string", "null"], enum: [null] } },
					},
				},
			},
		});

		assert.match(generated, /\/\*\* Returned by GET \/stats\*\\\/x\. \*\//);
		assert.match(generated, /\treadonly kind\?: string;/);
	});

	test("should read a resource without an item route on its own collection, or else on a creation route, with an IRI of any path and a body for each other creation route", () => {
		const text = { type: "string" };
		const created = (body: string, returned = "Subscription.jsonld") => ({
			post: {
				requestBody: content(body),
				responses: { "201": content(returned) },
			},
		});
		const generated = generateTypes({
			paths: {
				"/authors/{id}/logs": listed("Log.jsonld"),
				"/imports/logs": created("Log-import", "Log.jsonld"),
				"/logs": listed("Log.jsonld"),
				"/logs/replay": created("Log-replay", "Log.jsonld"),
				"/subscriptions/open": created("Subscription-open"),
				"/subscriptions/renew": created("Subscription-renew"),
			},
			components: {
				schemas: {
					"Subscription.jsonld": {
						type: "object",
						properties: { email: text },
					},
					"Subscription-open": { type: "object", properties: { email: text } },
					"Subscription-renew": { type: "object", properties: { token: text } },
					"Log.jsonld": { type: "object", properties: { text } },
					"Log-import": { type: "object", properties: { file: text } },
					"Log-replay": { type: "object", properties: { since: text } },
				},
			},
		});

		assert.match(
			generated,
			/\/\/ As a service: entityServiceBuilder<LogIri, Log>\(api, "\/logs"\)\nexport type LogIri = Iri<string, string \| number>;/,
		);
		assert.match(
			generated,
			/\/\*\* Taken by POST \/imports\/logs\. \*\/\nexport type LogImportBody = \{\n\tfile\?: string;\n\};/,
		);
		assert.match(
			generated,
			/\/\*\* Taken by POST \/logs\/replay\. \*\/\nexport type LogReplayBody = \{\n\tsince\?: string;\n\};/,
		);
		assert.match(
			generated,
			/\/\/ As a service: entityServiceBuilder<SubscriptionIri, Subscription>\(api, "\/subscriptions\/open"\)\nexport type SubscriptionIri = Iri<string, string \| number>;/,
		);
		assert.match(
			generated,
			/\/\*\* Taken by POST \/subscriptions\/renew\. \*\/\nexport type SubscriptionRenewBody = \{\n\ttoken\?: string;\n\};/,
		);
	});

	test("should not take a route that returns another class for a resource of its own", () => {
		const text = { type: "string" };
		const action: OpenApiDocument = {
			paths: {
				"/users/{id}": item("User.jsonld"),
				"/visitors/register": {
					post: {
						requestBody: content("Visitor-visitor.register"),
						responses: { "201": content("Visitor.User.jsonld-user.read") },
					},
				},
			},
			components: {
				schemas: {
					"User.jsonld": {
						type: "object",
						properties: { email: text, name: text },
					},
					"Visitor-visitor.register": {
						type: "object",
						properties: { code: text, email: text },
					},
					"Visitor.User.jsonld-user.read": {
						type: "object",
						properties: { email: text },
					},
				},
			},
		};
		const generated = generateTypes(action);

		assert.doesNotMatch(generated, /VisitorIri/);
		assert.match(
			generated,
			/\/\*\* Returned by POST \/visitors\/register\. \*\/\nexport type UserRead = \{\n\treadonly email: string;\n\};/,
		);
		assert.match(
			generated,
			/\/\*\* Taken by POST \/visitors\/register\. \*\/\nexport type Visitor = \{\n\tcode: string;\n\temail: string;\n\};/,
		);
	});

	test("should find the target of a relation that a second declaration of a class exposes", () => {
		const declared: OpenApiDocument = {
			paths: {
				"/companies/{id}": item("Company.jsonld"),
				"/admin/company2s/{id}": item("Company2.jsonld-admin"),
				"/users/{id}": item("User.jsonld"),
			},
			components: {
				schemas: {
					"Company.jsonld": { type: "object", properties: {} },
					"Company2.jsonld-admin": {
						type: "object",
						properties: { auditor: iri },
					},
					"User.jsonld": { type: "object", properties: {} },
				},
			},
		};
		const hydra = {
			supportedClass: [
				{ "@id": "#Company", title: "Company" },
				{
					"@id": "#Company2",
					title: "Company2",
					supportedProperty: [
						{ title: "auditor", property: { range: "#User" } },
					],
				},
				{ "@id": "#User", title: "User" },
			],
		};

		assert.match(
			generateTypes(declared, hydra),
			/export type CompanyAdmin = \{\n\treadonly auditor: UserIri;\n\};/,
		);
	});

	test("should name a model wherever a schema leads back to it", () => {
		const looped: OpenApiDocument = {
			paths: {
				"/employees": listed("Employee.jsonld-list"),
				"/employees/{id}": item("Employee.jsonld-read"),
				"/stats": item("Stats.jsonld"),
			},
			components: {
				schemas: {
					"Employee.jsonld-read": {
						type: "object",
						properties: { buddy: reference("Employee.jsonld-list") },
					},
					"Employee.jsonld-list": {
						type: "object",
						properties: { manager: reference("Employee.jsonld-list") },
					},
					"Stats.jsonld": {
						type: "object",
						properties: { child: reference("Stats.jsonld") },
					},
				},
			},
		};
		const generated = generateTypes(looped);

		assert.match(
			generated,
			/\treadonly buddy: Embedded<\n\t\t\{\n\t\t\tmanager: Embedded<EmployeeList, EmployeeIri>;/,
		);
		assert.match(generated, /export type Stats = \{\n\tchild: Stats;\n\};/);
	});

	test("should write a valid file from an unusual document", () => {
		const unusual: OpenApiDocument = {
			paths: {
				"/users": { post: { requestBody: content("User.jsonld") } },
				"/users/{id}": item("User.jsonld"),
				'/a"b/{id}': item("Quote.jsonld"),
				"/bodies": item("Other.UserBody.jsonld"),
				"/write-bodies": item("Other.UserWriteBody.jsonld"),
			},
			components: {
				schemas: {
					"User.jsonld": {
						type: "object",
						properties: { secret: { type: "string", writeOnly: true } },
					},
					"Quote.jsonld": { type: "object", properties: {} },
					"Other.UserBody.jsonld": { type: "object", properties: {} },
					"Other.UserWriteBody.jsonld": { type: "object", properties: {} },
				},
			},
		};
		const generated = generateTypes(unusual);

		assert.match(generated, /export type QuoteIri = Iri<"a\\"b", /);
		assert.match(
			generated,
			/export type UserWriteBody2 = WriteBody<User> & \{/,
		);
	});

	test("should number the model of a serialization whose name is taken", () => {
		const taken: OpenApiDocument = {
			paths: {
				"/users": listed("User.jsonld-list"),
				"/users/{id}": item("User.jsonld"),
				"/user_lists/{id}": item("UserList.jsonld"),
			},
			components: {
				schemas: {
					"User.jsonld": {
						type: "object",
						properties: { name: { type: "string" } },
					},
					"User.jsonld-list": { type: "object", properties: {} },
					"UserList.jsonld": { type: "object", properties: {} },
				},
			},
		};

		assert.match(
			generateTypes(taken),
			/\/\*\* Returned by GET \/users\. \*\/\nexport type UserList2 = \{\};/,
		);
	});

	test("should alias the type of the library that a body is named like", () => {
		const written: OpenApiDocument = {
			paths: {
				"/writes": { post: { requestBody: content("Write.jsonld") } },
				"/writes/{id}": item("Write.jsonld"),
			},
			components: {
				schemas: {
					"Write.jsonld": {
						type: "object",
						properties: { secret: { writeOnly: true, type: "string" } },
					},
				},
			},
		};

		assert.match(
			generateTypes(written),
			/export type WriteBody = ApiWriteBody<Write> & \{/,
		);
	});

	test("should refuse to write two types under one name", () => {
		const twice: OpenApiDocument = {
			paths: {
				"/users/{id}": item("User.jsonld"),
				"/user_iris/{id}": item("UserIri.jsonld"),
			},
			components: {
				schemas: {
					"User.jsonld": { type: "object", properties: {} },
					"UserIri.jsonld": { type: "object", properties: {} },
				},
			},
		};

		assert.throws(() => generateTypes(twice), {
			message: "Two generated types are named UserIri",
		});
	});

	test("should name the model of a resource that embeds itself", () => {
		const cyclic: OpenApiDocument = {
			paths: {
				"/users/{id}": item("User.jsonld-user.read"),
				"/teams/{id}": item("Team.jsonld-team.read"),
			},
			components: {
				schemas: {
					"User.jsonld-user.read": {
						type: "object",
						properties: {
							name: { type: "string" },
							manager: {
								anyOf: [reference("User.jsonld-user.read"), { type: "null" }],
							},
							team: reference("Team.jsonld-team.read"),
						},
					},
					"Team.jsonld-team.read": {
						type: "object",
						properties: { lead: reference("User.jsonld-user.read") },
					},
				},
			},
		};
		const generated = generateTypes(cyclic);

		assert.match(generated, /\treadonly manager\?: Embedded<User, UserIri>;/);
		assert.match(
			generated,
			/\treadonly team: Embedded<\{ lead: Embedded<User, UserIri> \}, TeamIri>;/,
		);
		assert.match(generated, /\t\t\tteam: Embedded<Team, TeamIri>;/);
	});

	test("should read what every write accepts, from its JSON body only", () => {
		const written: OpenApiDocument = {
			paths: {
				"/customers": {
					post: { requestBody: content("Customer.RegisterInput") },
				},
				"/customers/{id}": {
					...item("Customer.jsonld"),
					patch: {
						requestBody: {
							content: {
								"application/merge-patch+json": {
									schema: reference("Customer-customer.update"),
								},
							},
						},
					},
				},
				"/media": {
					post: {
						requestBody: {
							content: {
								"multipart/form-data": {
									schema: {
										type: "object",
										properties: { file: { type: "string" } },
									},
								},
							},
						},
					},
				},
				"/media/{id}": {
					get: {
						responses: {
							"200": {
								content: {
									"application/json": { schema: reference("Other") },
									"application/ld+json": { schema: reference("Media.jsonld") },
								},
							},
						},
					},
				},
			},
			components: {
				schemas: {
					"Customer.jsonld": {
						type: "object",
						properties: {
							email: { type: "string" },
							displayName: { type: "string" },
							level: {
								type: ["string", "null"],
								enum: ["gold", "silver", null],
							},
						},
					},
					"Customer.RegisterInput": {
						type: "object",
						properties: { email: { type: "string" } },
					},
					"Customer-customer.update": {
						type: "object",
						properties: { displayName: { type: "string" } },
					},
					"Media.jsonld": {
						type: "object",
						properties: { contentUrl: { type: "string" } },
					},
					Other: { type: "object", properties: { other: { type: "string" } } },
				},
			},
		};
		const generated = generateTypes(written);

		assert.match(generated, /\n\temail: string;\n\tdisplayName: string;\n/);
		assert.match(generated, /\treadonly level\?: "gold" \| "silver";/);
		assert.match(
			generated,
			/export type Media = \{\n\treadonly contentUrl: string;\n\};/,
		);
		assert.doesNotMatch(generated, /MediaBody|OtherIri/);
	});

	test("should follow what the document says beyond the plain cases", () => {
		const detailed: OpenApiDocument = {
			servers: [{ url: "https://example.com/v2/" }],
			paths: {
				"/members": {
					post: {
						requestBody: content("Member.jsonld"),
						responses: { "201": content("Member.jsonld") },
					},
				},
				"/members/{id}": item("Member.jsonld"),
				"/messages": {
					post: {
						requestBody: content("Message.jsonld"),
						responses: { "201": content("Message.jsonld") },
					},
				},
			},
			components: {
				schemas: {
					"Member.jsonld": {
						type: "object",
						properties: {
							id: { readOnly: true, type: "integer" },
							plainPassword: { writeOnly: true, type: ["string", "null"] },
							"first-name": { type: "string" },
							toString: { type: "string" },
							labels: {
								type: "object",
								additionalProperties: { type: "string" },
							},
							level: reference("Level"),
							book: { ...iri },
							code: { type: ["string", "integer", "null"] },
							extras: {
								type: ["object", "array"],
								additionalProperties: { type: "string" },
								items: { type: ["integer", "boolean"] },
							},
							reference: {
								oneOf: [
									{ type: ["string", "null"] },
									{ type: ["integer", "null"] },
								],
							},
							kind: { const: "member" },
							nothing: { anyOf: [{ type: "string" }, { type: ["null"] }] },
							cover: {
								type: "object",
								properties: {
									width: { type: "integer" },
									credit: { type: "string" },
								},
								required: ["width"],
							},
							place: {
								allOf: [
									reference("Place"),
									{
										type: "object",
										properties: { floor: { type: "integer" } },
									},
								],
							},
							lone: { allOf: reference("Place") as never },
							spot: {
								allOf: [reference("Place"), { nullable: true }],
							},
							badges: {
								anyOf: [
									{ type: "object", additionalProperties: { type: "string" } },
									{ type: "array", maxItems: 0 },
								],
							},
						},
					},
					"Message.jsonld": {
						type: "object",
						properties: { text: { type: "string" } },
					},
					Level: { type: "string", enum: ["gold", "silver"] },
					Place: { type: "object", properties: { street: { type: "string" } } },
				},
			},
		};
		const typed = {
			"hydra:supportedClass": [
				{
					"@id": "#Member",
					"hydra:title": "Member",
					"hydra:supportedProperty": [
						{
							"hydra:title": "book",
							"hydra:property": { "rdfs:range": "https://schema.org/Message" },
						},
					],
				},
				{ "@id": "https://schema.org/Message", "hydra:title": "Message" },
			],
		};

		assert.equal(
			generateTypes(detailed, typed),
			`// Generated by apiplatform-fetch-builder. Do not edit.

import type { Iri, WriteBody } from "apiplatform-fetch-builder";

// As a service: entityServiceBuilder<MemberIri, Member, { body: MemberBody }>(api, "/v2/members")
export type MemberIri = Iri<"v2/members">;
export type Member = {
	readonly id: number;
	"first-name": string;
	toString: string;
	labels: { [key: string]: string };
	level: "gold" | "silver";
	book: MessageIri;
	code?: string | number;
	extras: { [key: string]: string } | (number | boolean)[];
	reference?: string | number;
	kind: "member";
	nothing?: string;
	cover: {
		width: number;
		credit?: string;
	};
	place: {
		street: string;
	} & {
		floor: number;
	};
	lone: {
		street: string;
	};
	spot?: {
		street: string;
	};
	badges: { [key: string]: string } | [];
};
export type MemberBody = WriteBody<Member> & {
	plainPassword?: string | null;
};

// As a service: entityServiceBuilder<MessageIri, Message>(api, "/v2/messages")
export type MessageIri = Iri<string, string | number>;
export type Message = {
	text: string;
};
`,
		);
	});

	test("should write a plain type for what an operation takes or returns outside the resources", () => {
		const custom: OpenApiDocument = {
			paths: {
				"/users": {
					get: {
						responses: {
							"200": {
								content: {
									"application/ld+json": {
										schema: {
											type: "object",
											properties: {
												member: {
													type: "array",
													items: reference("User.jsonld-user.read"),
												},
											},
										},
									},
								},
							},
						},
					},
				},
				"/users/{id}": item("User.jsonld-user.read"),
				"/users/{id}/reset-password": {
					post: { requestBody: content("User.ResetPasswordInput-user.write") },
				},
				"/dashboard": item("Dashboard.jsonld"),
				"/tasks/stats": {
					get: {
						responses: {
							"200": {
								content: {
									"application/ld+json": {
										schema: {
											type: "object",
											properties: {
												member: {
													type: "array",
													items: reference("User.TaskStats.jsonld"),
												},
											},
										},
									},
								},
							},
						},
					},
				},
			},
			components: {
				schemas: {
					"User.jsonld-user.read": {
						type: "object",
						properties: { name: { type: "string" } },
					},
					"User.ResetPasswordInput-user.write": {
						type: "object",
						properties: { email: { type: "string" } },
					},
					"Dashboard.jsonld": {
						type: "object",
						properties: {
							"@id": { type: "string" },
							open: { type: "integer" },
						},
					},
					"User.TaskStats.jsonld": {
						type: "object",
						properties: { count: { type: "integer" } },
					},
				},
			},
		};

		assert.equal(
			generateTypes(custom),
			`// Generated by apiplatform-fetch-builder. Do not edit.

import type { Iri } from "apiplatform-fetch-builder";

// As a service: entityServiceBuilder<UserIri, User>(api, "/users")
export type UserIri = Iri<"users", string | number>;
export type User = {
	readonly name: string;
};

/** Returned by GET /dashboard. */
export type Dashboard = {
	open: number;
};

/** Taken by POST /users/{id}/reset-password. */
export type ResetPasswordInput = {
	email: string;
};

/** Returned by GET /tasks/stats. */
export type TaskStats = {
	count: number;
};
`,
		);
	});

	test("should keep one model for a class exposed as a second resource", () => {
		const twice: OpenApiDocument = {
			paths: {
				"/users/{id}": item("User.jsonld"),
				"/companies/{companyId}/employees/{id}": item("User2.jsonld"),
			},
			components: {
				schemas: {
					"User.jsonld": {
						type: "object",
						properties: { boss: reference("User2.jsonld") },
					},
					"User2.jsonld": { type: "object", properties: {} },
				},
			},
		};
		const generated = generateTypes(twice);

		assert.doesNotMatch(generated, /User2/);
		assert.match(generated, /\treadonly boss: Embedded<\{\}, UserIri>;/);
	});

	test("should accept both kinds of identifier when the API does not expose it, or gives it both types", () => {
		const hidden: OpenApiDocument = {
			paths: {
				"/logs/{id}": item("Log.jsonld"),
				"/entries/{id}": item("Entry.jsonld"),
			},
			components: {
				schemas: {
					"Log.jsonld": { type: "object" },
					"Entry.jsonld": {
						type: "object",
						properties: { id: { type: ["integer", "string"] } },
					},
				},
			},
		};
		const generated = generateTypes(hidden);

		assert.match(
			generated,
			/export type LogIri = Iri<"logs", string \| number>;\nexport type Log = \{\};/,
		);
		assert.match(
			generated,
			/export type EntryIri = Iri<"entries", string \| number>;/,
		);
	});

	test("should rename a type everywhere the file uses it", () => {
		const generated = generateTypes(openApi, hydraDocument, false, {
			rename: { Author: "Writer", AuthorIri: "WriterIri" },
		});

		assert.equal(
			generated,
			EXPECTED.replace(/\bAuthor\b/g, "Writer").replace(
				/\bAuthorIri\b/g,
				"WriterIri",
			),
		);
		assert.match(generated, /export type WriterIri = Iri<"api\/authors">;/);
	});

	test("should write the names that hold other letters than plain ones, or a dollar sign", () => {
		const generated = generateTypes(
			{
				paths: {
					"/cafés/{id}": item("Café.jsonld"),
					"/tables/{id}": item("Table.jsonld"),
				},
				components: {
					schemas: {
						"Café.jsonld": { type: "object", properties: { Café$ref: iri } },
						"Table.jsonld": { type: "object", properties: { café: iri } },
					},
				},
			},
			{
				supportedClass: [
					{
						"@id": "#Table",
						title: "Table",
						supportedProperty: [
							{ title: "café", property: { range: "#Café" } },
						],
					},
					{ "@id": "#Café", title: "Café" },
				],
			},
			false,
			{ rename: { Café: "Bistrot$" } },
		);

		assert.match(
			generated,
			/export type CaféIri = Iri<"cafés", string \| number>;\nexport type Bistrot\$ = \{\n\treadonly "Café\$ref": AnyIri;\n\};/,
		);
		assert.match(generated, /\treadonly "café": CaféIri;\n/);
	});

	test("should write the type given for a type or a property, the new names included", () => {
		const generated = generateTypes(openApi, hydraDocument, false, {
			rename: { Note: "Memo", NoteIri: "MemoIri" },
			types: {
				"Article.company": "string",
				"Article.status": "'Note' | 'draft'",
				"Article.seo.keywords?": "string[]",
				"Log.readers.name": "string | null",
				MemoIri: "Iri<'api/memos'>",
				"Memo.text": "string | null",
			},
		});

		assert.match(
			generated,
			/import type \{ Embedded, Iri, WriteBody \} from "apiplatform-fetch-builder";/,
		);
		assert.match(generated, /\tcompany\?: string;\n/);
		assert.match(generated, /\tstatus: 'Note' \| 'draft';\n/);
		assert.match(generated, /\t\tkeywords\?: string\[\];\n/);
		assert.match(
			generated,
			/\treadonly readers: \(Embedded<\{ name: string \| null \}, AuthorIri>\)\[\];/,
		);
		assert.match(
			generated,
			/export type MemoIri = Iri<'api\/memos'>;\nexport type Memo = \{\n\treadonly text: string \| null;\n/,
		);
	});

	test("should leave out the types and properties to skip, and the options of a service that names them", () => {
		const generated = generateTypes(openApi, hydraDocument, false, {
			skip: ["Note", "NoteIri", "ArticleBody", "Article.slug"],
		});

		assert.doesNotMatch(generated, /Note|ArticleBody|slug|WriteBody/);
		assert.equal(
			generateTypes(openApi, hydraDocument, false, {
				skip: ["Note", "NoteIri", "ArticleBody", "Article.slug", "Note.text"],
			}),
			generated,
		);
		assert.match(
			generated,
			/\/\/ As a service: entityServiceBuilder<ArticleIri, Article>\(api, "\/api\/articles"\)\n/,
		);
		assert.throws(
			() =>
				generateTypes(openApi, hydraDocument, false, { skip: ["AuthorIri"] }),
			{
				message:
					"Kept types use skipped ones: Article.author uses AuthorIri, Article.reviewers uses AuthorIri, Book.author uses AuthorIri, Log.author uses AuthorIri, Log.readers uses AuthorIri, Note.author uses AuthorIri",
			},
		);
	});

	test("should read a name that a generated type and a new name share as the generated one", () => {
		const generated = generateTypes(openApi, hydraDocument, false, {
			rename: { Note: "Book", NoteIri: "BookIri" },
			types: { "Note.text": "'memo'" },
			skip: ["Book", "BookIri"],
		});

		assert.doesNotMatch(generated, /isbn|Note/);
		assert.match(
			generated,
			/\/\/ As a service: entityServiceBuilder<BookIri, Book>\(api, "\/api\/authors\/\{id\}\/notes"\)\nexport type BookIri = Iri<`api\/authors\/\$\{string\}\/notes`, string \| number>;\nexport type Book = \{\n\treadonly text: 'memo';\n\treadonly author: AuthorIri;\n\};/,
		);
	});

	test("should read the names a hand-written type holds in a template, and none in a comment or after a dot", () => {
		const types = {
			"Article.slug": "`${NoteIri}/slug`",
			"Log.message": "string /* not NoteIri */",
			"Log.author.name": "string // not NoteIri, it doesn't count",
			"Book.title": 'import("./notes").NoteIri | [...Author[]]',
		};

		assert.match(
			generateTypes(openApi, hydraDocument, false, {
				rename: { NoteIri: "MemoIri" },
				types,
			}),
			/\treadonly slug: `\$\{MemoIri\}\/slug`;\n[^]*\treadonly message: string \/\* not NoteIri \*\/;\n/,
		);
		assert.match(
			generateTypes(openApi, hydraDocument, false, {
				rename: { NoteIri: "MemoIri", Author: "Writer" },
				types,
			}),
			/\ttitle: import\("\.\/notes"\)\.NoteIri \| \[\.\.\.Writer\[\]\];\n/,
		);
		assert.throws(
			() =>
				generateTypes(openApi, hydraDocument, false, {
					types,
					skip: ["Note", "NoteIri"],
				}),
			{ message: "Kept types use skipped ones: Article.slug uses NoteIri" },
		);
		assert.match(
			generateTypes(openApi, hydraDocument, false, {
				types: { Author: "{\n// not NoteIri\n\tname: string;\n}" },
				skip: ["Note", "NoteIri"],
			}),
			/export type Author = \{\n\/\/ not NoteIri\n\tname: string;\n\};/,
		);
	});

	test("should keep a value that ends like an object in a relation written on one line, and name the property of that relation that uses a skipped type", () => {
		const pets: OpenApiDocument = {
			paths: {
				"/pets/{id}": item("Pet.jsonld"),
				"/owners/{id}": item("Owner.jsonld"),
				"/towns/{id}": item("Town.jsonld"),
			},
			components: {
				schemas: {
					"Pet.jsonld": {
						type: "object",
						properties: {
							owner: reference("Owner.jsonld"),
							home: {
								anyOf: [
									{ properties: { town: reference("Town.jsonld") } },
									{ properties: { town: reference("Town.jsonld"), floor: {} } },
								],
							},
						},
					},
					"Owner.jsonld": {
						type: "object",
						properties: {
							mood: { type: "string", enum: ["a; }", "b"] },
							town: reference("Town.jsonld"),
							friend: iri,
						},
					},
					"Town.jsonld": { type: "object", properties: {} },
				},
			},
		};

		const friends = {
			supportedClass: [
				{
					"@id": "#Owner",
					title: "Owner",
					supportedProperty: [
						{ title: "friend", property: { range: "#Owner" } },
					],
				},
			],
		};

		assert.match(
			generateTypes(pets, friends, false, {
				skip: ["Pet.owner.town", "Pet.owner.friend"],
			}),
			/\treadonly owner: Embedded<\{ mood: "a; \}" \| "b" \}, OwnerIri>;\n/,
		);
		assert.throws(
			() => generateTypes(pets, friends, false, { skip: ["TownIri"] }),
			{
				message:
					"Kept types use skipped ones: Owner.town uses TownIri, Pet.owner.town uses TownIri, Pet.home.town uses TownIri",
			},
		);
		assert.throws(
			() =>
				generateTypes(pets, friends, false, { skip: ["Owner", "OwnerIri"] }),
			{ message: "Kept types use skipped ones: Pet.owner uses OwnerIri" },
		);
		assert.throws(
			() =>
				generateTypes(pets, friends, false, {
					skip: ["Owner", "OwnerIri", "Town", "TownIri"],
				}),
			{
				message:
					"Kept types use skipped ones: Pet.home.town uses TownIri, Pet.owner uses OwnerIri",
			},
		);
	});

	test("should read the required list of an object that is only taken, and leave out one that is not a list", () => {
		const size = { width: { type: "integer" }, credit: { type: "string" } };
		const generated = generateTypes({
			paths: {
				"/reports/{id}": item("Report.jsonld"),
				"/reports/run": { post: { requestBody: content("ReportInput") } },
			},
			components: {
				schemas: {
					"Report.jsonld": {
						type: "object",
						properties: {
							cover: {
								type: "object",
								properties: size,
								required: true as unknown as string[],
							},
						},
					},
					ReportInput: {
						type: "object",
						properties: {
							cover: { type: "object", properties: size, required: ["width"] },
						},
					},
				},
			},
		});

		assert.match(
			generated,
			/export type ReportInput = \{\n\tcover: \{\n\t\twidth: number;\n\t\tcredit\?: string;\n\t\};\n\};/,
		);
		assert.match(
			generated,
			/export type Report = \{\n\treadonly cover: \{\n\t\twidth: number;\n\t\tcredit: string;\n\t\};\n\};/,
		);
	});

	test("should refuse a change that matches nothing in the generated file, is empty or is made twice", () => {
		const refused = (config: Parameters<typeof generateTypes>[3]) => {
			try {
				generateTypes(openApi, hydraDocument, false, config);
			} catch (error) {
				return error instanceof Error ? error.message : String(error);
			}
		};

		assert.deepEqual(
			[
				refused({ rename: { Autor: "Writer" } }),
				refused({ rename: { Note: "Memo" }, skip: ["Note", "NoteIri"] }),
				refused({
					types: { "Article.titel": "string" },
					skip: ["Article.seo.keyword"],
				}),
				refused({ types: { Note: "{}", "Note.text": "string" } }),
				refused({ skip: ["Article.seo.keyword"] }),
				refused({ rename: { Note: "my note" } }),
				refused({ rename: { Note: "Book" } }),
				refused({ types: { "Note.text": " " } }),
				refused({ types: { "Note.text": "string", "Note.text?": "string" } }),
				refused({ types: { "Note.text": "string" }, skip: ["Note.text"] }),
			],
			[
				"The generated file has no type or property named Autor",
				"The config changes Note more than once",
				"The generated file has no type or property named Article.titel, Article.seo.keyword",
				"The generated file has no type or property named Note.text",
				"The generated file has no type or property named Article.seo.keyword",
				'"my note" is not a valid type name',
				"Two generated types are named Book",
				"The type of Note.text is empty",
				"The config changes Note.text more than once",
				"The config changes Note.text more than once",
			],
		);
	});
});
