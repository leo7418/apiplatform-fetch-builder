#!/usr/bin/env node
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";

import { generateTypes } from "./generate.ts";

const USAGE =
	'Usage: apiplatform-fetch-builder generate <api-url | openapi.json> <output> [--hydra docs.jsonld] [--header "Name: value"] [--keep-null-values]';

const parse = (text: string, source: string): Record<string, unknown> => {
	try {
		const document: unknown = JSON.parse(text);
		if (typeof document === "object" && document !== null) {
			return { ...document };
		}
	} catch {
		// Reported below, like a document that is not an object
	}
	throw new Error(`${source} is not a JSON document`);
};

const fetchDocument = async (
	entrypoint: string,
	headers: Record<string, string>,
) => {
	const url = `${entrypoint.replace(/\/+$/, "").replace(/\/docs$/, "")}/docs`;
	const response = await fetch(url, { headers });
	if (!response.ok) {
		throw new Error(`${url} answered ${response.status}`);
	}
	return parse(await response.text(), url);
};

const readDocument = async (file: string) =>
	parse(await readFile(file, "utf8"), file);

const takeOption = (args: string[], option: string) => {
	const values: string[] = [];
	while (args.includes(option)) {
		const [, value] = args.splice(args.indexOf(option), 2);
		if (value === undefined || value.startsWith("--")) {
			throw new Error(USAGE);
		}
		values.push(value);
	}
	return values;
};

const run = async (args: string[]) => {
	if (args.includes("--help")) {
		console.log(USAGE);
		return;
	}
	const [hydraFile, ...repeated] = takeOption(args, "--hydra");
	const headers = Object.fromEntries(
		takeOption(args, "--header").map((header) => {
			const [name, ...value] = header.split(":");
			return [name.trim(), value.join(":").trim()];
		}),
	);
	const keepNullValues = args.includes("--keep-null-values");
	const positional = args.filter(
		(argument) => argument !== "--keep-null-values",
	);
	const [command, input, output] = positional;
	const unexpected =
		positional.length !== 3 ||
		repeated.length > 0 ||
		positional.some((argument) => argument.startsWith("-")) ||
		Object.entries(headers).some(([name, value]) => !name || !value);
	if (command !== "generate" || !input || !output || unexpected) {
		throw new Error(USAGE);
	}

	const fromApi = /^https?:\/\//i.test(input);
	const openApi = fromApi
		? await fetchDocument(input, {
				...headers,
				Accept: "application/vnd.openapi+json",
			})
		: await readDocument(input);
	const hydraDocument = hydraFile
		? await readDocument(hydraFile)
		: fromApi
			? await fetchDocument(input, {
					...headers,
					Accept: "application/ld+json",
				})
			: undefined;
	const generated = generateTypes(openApi, hydraDocument, keepNullValues);
	const resources = generated.match(/^export type \w+Iri = \w*Iri</gm) ?? [];
	if (!resources.length) {
		throw new Error(`No resource found in ${input}`);
	}

	const file = output.endsWith(".ts") ? output : join(output, "api-types.ts");
	await mkdir(dirname(file), { recursive: true });
	await writeFile(file, generated);
	console.log(`${file} written: ${resources.length} resources`);
	if (!hydraDocument) {
		console.warn(
			"Without the Hydra documentation (--hydra), a relation returned as an IRI is typed AnyIri",
		);
	}
};

run(process.argv.slice(2)).catch((error: unknown) => {
	const { message, cause } =
		error instanceof Error ? error : new Error(String(error));
	console.error(
		cause instanceof Error ? `${message}: ${cause.message}` : message,
	);
	process.exitCode = 1;
});
