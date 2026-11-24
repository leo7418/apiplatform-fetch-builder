import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { once } from "node:events";
import { mkdtemp, readFile, writeFile } from "node:fs/promises";
import { createServer } from "node:http";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const command = fileURLToPath(import.meta.url).replace(".test.", ".");

const flags = command.endsWith(".ts")
	? ["--experimental-strip-types", "--disable-warning=ExperimentalWarning"]
	: [];

const run = (...args: string[]) =>
	new Promise<{ failed: boolean; stdout: string; stderr: string }>((resolve) =>
		execFile(
			process.execPath,
			[...flags, command, ...args],
			(error, stdout, stderr) => resolve({ failed: !!error, stdout, stderr }),
		),
	);

const openApi = {
	paths: {
		"/users/{id}": {
			get: {
				responses: {
					"200": {
						content: {
							"application/ld+json": {
								schema: { $ref: "#/components/schemas/User.jsonld" },
							},
						},
					},
				},
			},
		},
	},
	components: {
		schemas: {
			"User.jsonld": {
				type: "object",
				properties: {
					name: { type: "string" },
					note: { type: ["string", "null"] },
				},
			},
		},
	},
};

describe("generate command", () => {
	test("should write the types of an OpenAPI file and say what it did", async () => {
		const folder = await mkdtemp(join(tmpdir(), "generate-"));
		const input = join(folder, "openapi.json");
		await writeFile(input, JSON.stringify(openApi));

		const { failed, stdout, stderr } = await run("generate", input, folder);

		const typed = await run("generate", input, join(folder, "types.mts"));

		assert.deepEqual([failed, typed.failed], [false, false]);
		assert.match(typed.stdout, /types\.mts written: 1 resources/);
		assert.match(stdout, /api-types\.ts written: 1 resources/);
		assert.match(stderr, /Without the Hydra documentation/);
		assert.match(
			await readFile(join(folder, "api-types.ts"), "utf8"),
			/export type User = \{\n\treadonly name: string;\n\treadonly note\?: string;\n\};/,
		);
	});

	test("should count a resource whose IRI type spans several lines", async () => {
		const folder = await mkdtemp(join(tmpdir(), "generate-"));
		const input = join(folder, "openapi.json");
		const admin = "/an_administration_area_with_a_long_name/users/{id}";
		await writeFile(
			input,
			JSON.stringify({
				...openApi,
				paths: { ...openApi.paths, [admin]: openApi.paths["/users/{id}"] },
			}),
		);

		const { failed, stdout } = await run("generate", input, folder);

		assert.equal(failed, false);
		assert.match(stdout, /written: 1 resources/);
		assert.match(
			await readFile(join(folder, "api-types.ts"), "utf8"),
			/export type UserIri =\n\t\| Iri<"users", string \| number>\n\t\| Iri<"an_administration_area_with_a_long_name\/users", string \| number>;/,
		);
	});

	test("should keep the null values when the API does", async () => {
		const folder = await mkdtemp(join(tmpdir(), "generate-"));
		const input = join(folder, "openapi.json");
		await writeFile(input, JSON.stringify(openApi));

		const { failed } = await run(
			"generate",
			input,
			"--keep-null-values",
			folder,
		);

		assert.equal(failed, false);
		assert.match(
			await readFile(join(folder, "api-types.ts"), "utf8"),
			/\treadonly note\?: string \| null;/,
		);
	});

	test("should read both documents of an API with the headers it is given", async () => {
		const requests: string[] = [];
		const server = createServer((request, response) => {
			requests.push(
				`${request.url} ${request.headers.accept} ${request.headers.authorization}`,
			);
			response.end(JSON.stringify({ ...openApi, supportedClass: [] }));
		}).listen(0, "127.0.0.1");
		await once(server, "listening");
		const address = server.address();
		const port = typeof address === "object" ? address?.port : undefined;
		const folder = await mkdtemp(join(tmpdir(), "generate-"));

		const { failed, stderr } = await run(
			"generate",
			`http://127.0.0.1:${port}/api/docs`,
			join(folder, "types.ts"),
			"--header",
			"Authorization: Bearer a:b",
		);
		server.close();

		assert.equal(failed, false);
		assert.equal(stderr, "");
		assert.deepEqual(requests, [
			"/api/docs application/vnd.openapi+json Bearer a:b",
			"/api/docs application/ld+json Bearer a:b",
		]);
		assert.match(await readFile(join(folder, "types.ts"), "utf8"), /UserIri/);
	});

	test("should read the Hydra documentation it is given, from a file or a URL", async () => {
		const requests: (string | undefined)[] = [];
		const server = createServer((request, response) => {
			requests.push(request.headers.accept);
			response.end(JSON.stringify({ ...openApi, supportedClass: [] }));
		}).listen(0, "127.0.0.1");
		await once(server, "listening");
		const address = server.address();
		const port = typeof address === "object" ? address?.port : undefined;
		const folder = await mkdtemp(join(tmpdir(), "generate-"));
		const hydra = join(folder, "docs.jsonld");
		const input = join(folder, "openapi.json");
		await writeFile(hydra, '{ "supportedClass": [] }');
		await writeFile(input, JSON.stringify(openApi));

		const fromFile = await run(
			"generate",
			`http://127.0.0.1:${port}/api`,
			folder,
			"--hydra",
			hydra,
		);
		const fromUrl = await run(
			"generate",
			input,
			folder,
			"--hydra",
			`http://127.0.0.1:${port}/docs.jsonld`,
		);
		server.close();

		assert.deepEqual([fromFile.failed, fromUrl.failed], [false, false]);
		assert.deepEqual(requests, [
			"application/vnd.openapi+json",
			"application/ld+json",
		]);
	});

	test("should refuse a Hydra documentation that is not one", async () => {
		const folder = await mkdtemp(join(tmpdir(), "generate-"));
		const input = join(folder, "openapi.json");
		await writeFile(input, JSON.stringify(openApi));

		const { failed, stderr } = await run(
			"generate",
			input,
			folder,
			"--hydra",
			input,
		);

		assert.equal(failed, true);
		assert.equal(stderr.trim(), `${input} holds no Hydra documentation`);
	});

	test("should say where the Hydra documentation of an API is when given its entrypoint", async () => {
		const server = createServer((_request, response) => {
			response.end("{}");
		}).listen(0, "127.0.0.1");
		await once(server, "listening");
		const address = server.address();
		const port = typeof address === "object" ? address?.port : undefined;
		const folder = await mkdtemp(join(tmpdir(), "generate-"));
		const input = join(folder, "openapi.json");
		await writeFile(input, JSON.stringify(openApi));

		const { failed, stderr } = await run(
			"generate",
			input,
			folder,
			"--hydra",
			`http://127.0.0.1:${port}/api`,
		);
		server.close();

		assert.equal(failed, true);
		assert.equal(
			stderr.trim(),
			`http://127.0.0.1:${port}/api holds no Hydra documentation: give its own URL, such as http://127.0.0.1:${port}/api/docs.jsonld`,
		);
	});

	test("should leave out the null values a document holds in its arrays", async () => {
		const folder = await mkdtemp(join(tmpdir(), "generate-"));
		const input = join(folder, "openapi.json");
		const hydra = join(folder, "docs.jsonld");
		await writeFile(
			input,
			JSON.stringify({
				...openApi,
				components: {
					schemas: {
						"User.jsonld": {
							type: "object",
							properties: {
								name: { anyOf: [null, { type: "string" }] },
								kind: { type: "string", enum: [null] },
							},
						},
					},
				},
			}),
		);
		await writeFile(
			hydra,
			JSON.stringify({
				supportedClass: [null, { "@id": "#User", title: "User" }],
			}),
		);

		const { failed, stderr } = await run(
			"generate",
			input,
			folder,
			"--hydra",
			hydra,
		);

		assert.equal(stderr, "");
		assert.equal(failed, false);
		assert.match(
			await readFile(join(folder, "api-types.ts"), "utf8"),
			/\treadonly name: string;\n\treadonly kind: string;/,
		);
	});

	test("should refuse an option given twice or without its value", async () => {
		const twice = await run(
			"generate",
			"in.json",
			"out",
			"--hydra",
			"a.jsonld",
			"--hydra",
			"b.jsonld",
		);
		const header = await run("generate", "in.json", "out", "--header", "Name");

		assert.deepEqual([twice.failed, header.failed], [true, true]);
		assert.match(twice.stderr + header.stderr, /^Usage: .+\nUsage: /);
	});

	test("should say how an API answered when it refuses its documentation", async () => {
		const server = createServer((request, response) => {
			response.statusCode = request.url === "/api/docs" ? 401 : 404;
			response.end();
		}).listen(0, "127.0.0.1");
		await once(server, "listening");
		const address = server.address();
		const port = typeof address === "object" ? address?.port : undefined;

		const refused = await run(
			"generate",
			`http://127.0.0.1:${port}/api`,
			"out",
		);
		const missing = await run("generate", `http://127.0.0.1:${port}`, "out");
		server.close();

		assert.deepEqual([refused.failed, missing.failed], [true, true]);
		assert.equal(
			refused.stderr.trim(),
			`http://127.0.0.1:${port}/api/docs answered 401`,
		);
		assert.equal(
			missing.stderr.trim(),
			`http://127.0.0.1:${port}/docs answered 404: give the entrypoint of the API, such as https://api.example.com/api`,
		);
	});

	test("should leave out what a document holds that it cannot read", async () => {
		const folder = await mkdtemp(join(tmpdir(), "generate-"));
		const input = join(folder, "openapi.json");
		await writeFile(
			input,
			JSON.stringify({
				...openApi,
				servers: [{ url: 42 }],
				paths: { ...openApi.paths, "/broken": null },
			}),
		);

		const { failed } = await run("generate", input, folder);

		assert.equal(failed, false);
		assert.match(
			await readFile(join(folder, "api-types.ts"), "utf8"),
			/export type UserIri = Iri<"users", /,
		);
	});

	test("should refuse an option it does not know", async () => {
		const { failed, stderr } = await run(
			"generate",
			"in.json",
			"out",
			"--check",
		);

		assert.equal(failed, true);
		assert.match(stderr, /^Usage: /);
	});

	test("should fail in one line when the input holds no resource", async () => {
		const folder = await mkdtemp(join(tmpdir(), "generate-"));
		const input = join(folder, "empty.json");
		await writeFile(input, "{}");

		const { failed, stderr } = await run("generate", input, folder);

		assert.equal(failed, true);
		assert.equal(stderr.trim(), `No resource found in ${input}`);
	});

	test("should print its usage on request", async () => {
		const { failed, stdout } = await run("--help");

		assert.equal(failed, false);
		assert.match(
			stdout,
			/^Usage: .+\n\n {2}<api-url> +Entrypoint of a running API/,
		);
	});
});
