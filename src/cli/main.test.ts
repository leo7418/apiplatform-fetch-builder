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

		assert.equal(failed, false);
		assert.match(stdout, /api-types\.ts written: 1 resources/);
		assert.match(stderr, /Without the Hydra documentation/);
		assert.match(
			await readFile(join(folder, "api-types.ts"), "utf8"),
			/export type User = \{\n\treadonly name: string;\n\treadonly note\?: string;\n\};/,
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
			/\treadonly note: string \| null;/,
		);
	});

	test("should read both documents of an API with the headers it is given", async () => {
		const requests: string[] = [];
		const server = createServer((request, response) => {
			requests.push(
				`${request.url} ${request.headers.accept} ${request.headers.authorization}`,
			);
			response.end(JSON.stringify(openApi));
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

	test("should read the Hydra documentation it is given rather than the one of the API", async () => {
		const requests: (string | undefined)[] = [];
		const server = createServer((request, response) => {
			requests.push(request.headers.accept);
			response.end(JSON.stringify(openApi));
		}).listen(0, "127.0.0.1");
		await once(server, "listening");
		const address = server.address();
		const port = typeof address === "object" ? address?.port : undefined;
		const folder = await mkdtemp(join(tmpdir(), "generate-"));
		const hydra = join(folder, "docs.jsonld");
		await writeFile(hydra, "{}");

		const { failed } = await run(
			"generate",
			`http://127.0.0.1:${port}/api`,
			folder,
			"--hydra",
			hydra,
		);
		server.close();

		assert.equal(failed, false);
		assert.deepEqual(requests, ["application/vnd.openapi+json"]);
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
		assert.match(stdout, /^Usage: /);
	});
});
