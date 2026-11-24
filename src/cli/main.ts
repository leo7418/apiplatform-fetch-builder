#!/usr/bin/env node
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";

import { generateTypes } from "./generate.ts";

const USAGE =
	'Usage: apiplatform-fetch-builder generate <api-url | openapi.json> <output> [--hydra docs.jsonld] [--header "Name: value"] [--keep-null-values]';

const HELP = `${USAGE}

  <api-url>               Entrypoint of a running API, such as https://api.example.com/api
  <openapi.json>          OpenAPI document of an API, from bin/console api:openapi:export
  <output>                Folder that receives api-types.ts, or a file ending with .ts, .mts or .cts
  --hydra <file | url>    Hydra documentation of the API, which names the target of its relations
  --header "Name: value"  Header sent with every request to the API, repeatable
  --keep-null-values      For an API that returns null values instead of leaving them out`;

const parse = (text: string, source: string): Record<string, unknown> => {
	try {
		const document: unknown = JSON.parse(text, (_, value: unknown) =>
			value === null
				? undefined
				: Array.isArray(value)
					? value.filter((item) => item !== undefined)
					: value,
		);
		if (typeof document === "object" && document !== null) {
			return { ...document };
		}
	} catch {
		// Reported below, like a document that is not an object
	}
	throw new Error(`${source} is not a JSON document`);
};

const fetchDocument = async (url: string, headers: Record<string, string>) => {
	const response = await fetch(url, { headers }).catch((error: unknown) => {
		const code =
			error instanceof Error &&
			error.cause instanceof Error &&
			"code" in error.cause
				? String(error.cause.code)
				: "";
		throw /^(?:SELF_SIGNED_CERT_IN_CHAIN|DEPTH_ZERO_SELF_SIGNED_CERT|UNABLE_TO_VERIFY_LEAF_SIGNATURE|UNABLE_TO_GET_ISSUER_CERT(?:_LOCALLY)?)$/.test(
			code,
		)
			? new Error(
					`${url} has a certificate that Node does not trust (${code}): run the command with NODE_OPTIONS=--use-system-ca (Node 22.15 or later), or give NODE_EXTRA_CA_CERTS the certificate of its authority`,
				)
			: error;
	});
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
		console.log(HELP);
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

	const isUrl = (source: string) => /^https?:\/\//i.test(source);
	const docs = `${input.replace(/\/+$/, "").replace(/\/docs$/, "")}/docs`;
	const hydraHeaders = { ...headers, Accept: "application/ld+json" };
	const openApi = isUrl(input)
		? await fetchDocument(docs, {
				...headers,
				Accept: "application/vnd.openapi+json",
			}).catch((error: unknown) => {
				throw error instanceof Error && error.message.endsWith(" 404")
					? new Error(
							`${error.message}: give the entrypoint of the API, such as https://api.example.com/api`,
						)
					: error;
			})
		: await readDocument(input);
	const hydraDocument = hydraFile
		? await (isUrl(hydraFile)
				? fetchDocument(hydraFile, hydraHeaders)
				: readDocument(hydraFile))
		: isUrl(input)
			? await fetchDocument(docs, hydraHeaders)
			: undefined;
	if (
		hydraDocument &&
		!("supportedClass" in hydraDocument) &&
		!("hydra:supportedClass" in hydraDocument)
	) {
		throw new Error(
			hydraFile && isUrl(hydraFile)
				? `${hydraFile} holds no Hydra documentation: give its own URL, such as ${hydraFile.replace(/\/+$/, "")}/docs.jsonld`
				: `${hydraFile ?? input} holds no Hydra documentation`,
		);
	}
	const generated = generateTypes(openApi, hydraDocument, keepNullValues);
	const resources =
		generated.match(/^export type \w+Iri =\s*\|? ?\w*Iri</gm) ?? [];
	if (!resources.length) {
		throw new Error(`No resource found in ${input}`);
	}

	const file = /\.[cm]?ts$/.test(output)
		? output
		: join(output, "api-types.ts");
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
