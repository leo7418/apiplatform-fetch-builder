import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { mkdtemp, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";

import fetchBuilder from "../../src/index.ts";

const { API_URL } = process.env;
assert.ok(API_URL, "Run the suite with integration/run.sh");

const command = fileURLToPath(
	new URL("../../src/cli/main.ts", import.meta.url),
);

const generate = async (url: string) => {
	const output = await mkdtemp(join(tmpdir(), "generated-"));
	await promisify(execFile)(process.execPath, [
		"--experimental-strip-types",
		"--disable-warning=ExperimentalWarning",
		command,
		"generate",
		url,
		output,
	]);
	return readFile(join(output, "api-types.ts"), "utf8");
};
const example = new URL(
	"../../examples/generated/api-types.ts",
	import.meta.url,
);

test("the generate command should write the models the example relies on", async () => {
	assert.equal(await generate(API_URL), await readFile(example, "utf8"));
});

test("the generate command should write the IRIs of an API served under a base path", async () => {
	const url = API_URL.replace(/\/api$/, "/index.php/api");
	const company = await fetchBuilder(url)
		.get<{ "@id": string }>("/companies/1")
		.fetch();

	const [, path] =
		(await generate(url)).match(/CompanyIri = Iri<"(.+)">/) ?? [];

	assert.equal(company["@id"], `/${path}/1`);
});
