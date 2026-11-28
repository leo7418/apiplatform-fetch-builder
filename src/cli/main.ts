#!/usr/bin/env node
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";

import { generateTypes, type Config } from "./generate.ts";

const USAGE =
	'Usage: apiplatform-fetch-builder generate <api-url | openapi.json> <output> [--hydra docs.jsonld] [--header "Name: value"] [--keep-null-values] [--config config.json]';

const HELP = `${USAGE}

  <api-url>               Entrypoint of a running API, such as https://api.example.com/api
  <openapi.json>          OpenAPI document of an API, from bin/console api:openapi:export
  <output>                Folder that receives api-types.ts, or a file ending with .ts, .mts or .cts
  --hydra <file | url>    Hydra documentation of the API, which names the target of its relations
  --header "Name: value"  Header sent with every request to the API, repeatable
  --keep-null-values      For an API that returns null values instead of leaving them out
  --config <file>         JSON file of the types to rename, to write by hand or to leave out`;

const parse = (
	text: string,
	source: string,
	keepNulls = false,
): Record<string, unknown> => {
	let document: unknown;
	try {
		document = JSON.parse(
			text.replace(/^\uFEFF/, ""),
			keepNulls
				? undefined
				: (_, value: unknown) =>
						value === null
							? undefined
							: Array.isArray(value)
								? value.filter((item) => item !== undefined)
								: value,
		);
	} catch (cause) {
		throw new Error(`${source} is not a JSON document`, { cause });
	}
	if (
		typeof document !== "object" ||
		document === null ||
		Array.isArray(document)
	) {
		throw new Error(`${source} is not a JSON document`);
	}
	return { ...document };
};

const hidden = (source: string, whole = false) =>
	source.replace(
		whole
			? /^([a-z][a-z\d+.-]*:\/\/).*@/i
			: /^([a-z][a-z\d+.-]*:\/\/)[^/?#]*@/i,
		"$1",
	);

const decoded = (text: string) => {
	try {
		return decodeURIComponent(text);
	} catch {
		return text;
	}
};

const credentialsOf = (source: string) => {
	try {
		const { username, password } = new URL(source);
		return username || password
			? `${decoded(username)}:${decoded(password)}`
			: undefined;
	} catch {
		const url = hidden(source, true);
		throw new Error(
			`${url} is not a valid URL${url === source ? "" : ": a user and a password have to be URL-encoded"}`,
		);
	}
};

const fetchDocument = async (source: string, given: Record<string, string>) => {
	const url = hidden(source);
	const credentials = credentialsOf(source);
	const headers = new Headers(
		credentials === undefined
			? {}
			: {
					Authorization: `Basic ${Buffer.from(credentials).toString("base64")}`,
				},
	);
	Object.entries(given).forEach(([name, value]) => headers.set(name, value));
	const response = await fetch(url, { headers }).catch((error: unknown) => {
		const cause = error instanceof Error ? error.cause : undefined;
		const code =
			cause instanceof Error && "code" in cause ? String(cause.code) : "";
		if (cause === undefined) {
			throw error;
		}
		throw /^(?:SELF_SIGNED_CERT_IN_CHAIN|DEPTH_ZERO_SELF_SIGNED_CERT|UNABLE_TO_VERIFY_LEAF_SIGNATURE|UNABLE_TO_GET_ISSUER_CERT(?:_LOCALLY)?)$/.test(
			code,
		)
			? new Error(
					`${url} has a certificate that Node does not trust (${code}): run the command with NODE_OPTIONS=--use-system-ca (Node 22.15 or later), or give NODE_EXTRA_CA_CERTS the certificate of its authority`,
				)
			: new Error(`${url} cannot be reached${code && ` (${code})`}`, { cause });
	});
	if (!response.ok) {
		throw new Error(`${url} answered ${response.status}`);
	}
	return parse(await response.text(), url);
};

const readDocument = async (file: string) =>
	parse(await readFile(file, "utf8"), file);

const isTexts = (value: unknown): value is Record<string, string> =>
	typeof value === "object" &&
	value !== null &&
	!Array.isArray(value) &&
	Object.values(value).every((item) => typeof item === "string");

const readConfig = async (file: string): Promise<Config> => {
	const {
		rename = {},
		types = {},
		skip = [],
		...others
	} = parse(await readFile(file, "utf8"), file, true);
	const unknown = Object.keys(others);
	if (unknown.length > 0) {
		throw new Error(
			`${file} holds ${unknown.join(", ")}: only "rename", "types" and "skip" are read`,
		);
	}
	if (
		!isTexts(rename) ||
		!isTexts(types) ||
		!Array.isArray(skip) ||
		!skip.every((item): item is string => typeof item === "string")
	) {
		throw new Error(
			`${file} must hold "rename" and "types" as objects of texts, and "skip" as a list of texts`,
		);
	}
	return { rename, types, skip };
};

const takeOption = (args: string[], option: string) => {
	const values: string[] = [];
	while (args.includes(option)) {
		const [, value] = args.splice(args.indexOf(option), 2);
		if (!value || value.startsWith("--")) {
			throw new Error(USAGE);
		}
		values.push(value);
	}
	return values;
};

const run = async (given: string[]) => {
	const args = given.flatMap((argument) => {
		const [, option, value] =
			/^(--(?:hydra|header|config))=(.*)$/s.exec(argument) ?? [];
		return option === undefined ? [argument] : [option, value];
	});
	if (args.includes("--help")) {
		console.log(HELP);
		return;
	}
	const [hydraFile, ...repeated] = takeOption(args, "--hydra");
	const [configFile, ...configs] = takeOption(args, "--config");
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
		configs.length > 0 ||
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
				? `${hidden(hydraFile)} holds no Hydra documentation: give its own URL, such as ${hidden(hydraFile).replace(/\/+$/, "")}/docs.jsonld`
				: `${hidden(hydraFile ?? input)} holds no Hydra documentation`,
		);
	}
	const generated = generateTypes(
		openApi,
		hydraDocument,
		keepNullValues,
		configFile ? await readConfig(configFile) : {},
	);
	const count = (text: string) =>
		text.match(/^\/\/ As a service: /gm)?.length ?? 0;
	const resources = count(generated);
	const documented =
		resources ||
		(configFile &&
			count(generateTypes(openApi, hydraDocument, keepNullValues)));
	if (!documented) {
		throw new Error(`No resource found in ${hidden(input)}`);
	}

	const file = /\.[cm]?ts$/.test(output)
		? output
		: join(output, "api-types.ts");
	await mkdir(dirname(file), { recursive: true });
	await writeFile(file, generated);
	console.log(`${file} written: ${resources} resources`);
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
		cause instanceof Error && cause.message
			? `${message}: ${cause.message}`
			: message,
	);
	process.exitCode = 1;
});
