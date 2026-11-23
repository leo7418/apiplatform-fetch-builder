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

export type ArticleIri = Iri<"api/articles">;
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

export type AuthorIri = Iri<"api/authors">;
export type Author = {
	readonly id: number;
	readonly name: string;
	readonly biography: string;
};

export type BookIri = Iri<"api/books", string>;
export type Book = {
	isbn: string;
	title: string;
	author: Author | AuthorIri;
};

export type LogIri = Iri<"api/logs">;
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
			/export type EventIri = Iri<"events", string \| number>;\nexport type Event = \{\n\treadonly name: string;\n\};/,
		);
	});

	test("should keep a nullable property and its null on request", () => {
		const generated = generateTypes(openApi, hydraDocument, true);

		assert.match(generated, /\tpublishedAt: string \| null;/);
		assert.match(generated, /\t\tdescription: string \| null;/);
		assert.match(
			generated,
			/\tauthor: Embedded<\{ name: string \}, AuthorIri> \| null;/,
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

		assert.equal(
			generateTypes(serialized),
			`// Generated by apiplatform-fetch-builder. Do not edit.

import type { Iri } from "apiplatform-fetch-builder";

export type BlogPostIri = Iri<"blog_posts">;
export type BlogPost = {
	readonly id: number;
	title: string;
	body: string;
};

/** Returned by GET /admin/blog_posts. */
export type BlogPostAdminRead = {
	readonly id: number;
	title: string;
	readonly views: number;
};

/** Returned by GET /drafts. */
export type BlogPostFull = {
	readonly id: number;
	title: string;
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
						},
					},
					"Message.jsonld": {
						type: "object",
						properties: { text: { type: "string" } },
					},
					Level: { type: "string", enum: ["gold", "silver"] },
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

export type MemberIri = Iri<"v2/members">;
export type Member = {
	readonly id: number;
	"first-name": string;
	toString: string;
	labels: { [key: string]: string };
	level: "gold" | "silver";
	book: MessageIri;
};

export type MemberBody = WriteBody<Member> & {
	plainPassword?: string | null;
};

export type MessageIri = Iri<"v2/messages", string | number>;
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

export type UserIri = Iri<"users", string | number>;
export type User = {
	readonly name: string;
};

export type Dashboard = {
	open: number;
};

export type ResetPasswordInput = {
	email: string;
};

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

	test("should accept both kinds of identifier when the API does not expose it", () => {
		const hidden: OpenApiDocument = {
			paths: { "/logs/{id}": item("Log.jsonld") },
			components: { schemas: { "Log.jsonld": { type: "object" } } },
		};

		assert.match(
			generateTypes(hidden),
			/export type LogIri = Iri<"logs", string \| number>;\nexport type Log = \{\};/,
		);
	});
});
