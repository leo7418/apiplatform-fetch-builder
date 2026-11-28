type Schema = {
	$ref?: string;
	allOf?: Schema[];
	anyOf?: Schema[];
	oneOf?: Schema[];
	type?: string | string[];
	format?: string;
	enum?: unknown[];
	const?: unknown;
	items?: Schema;
	maxItems?: number;
	properties?: Record<string, Schema>;
	additionalProperties?: Schema | boolean;
	required?: string[];
	readOnly?: boolean;
	writeOnly?: boolean;
	nullable?: boolean;
};

type Content = { content?: Record<string, { schema?: Schema }> };

type Operation = {
	parameters?: { name?: string }[];
	requestBody?: Content;
	responses?: Record<string, Content>;
};

type PathItem = Partial<
	Record<"get" | "post" | "put" | "patch" | "delete", Operation>
>;

export type OpenApiDocument = {
	servers?: { url?: string }[];
	paths?: Record<string, PathItem>;
	components?: { schemas?: Record<string, Schema> };
};

export type HydraDocument = Record<string, unknown>;

type Route = {
	path: string;
	item?: string;
	collection: string;
	identifier: string;
	read: Schema;
	writes: Schema[];
	selectable: boolean;
	output: boolean;
};

type Resource = Route & { name: string; routes: Route[] };

type Variant = { resource: Resource; schema: Schema; routes: string[] };

/** Changes to the generated file, for an API whose documentation cannot change. */
export type Config = {
	/** New name of a generated type, by the name the command gives it */
	rename?: Record<string, string>;
	/** Type written by hand for a generated type or a property, such as `User.settings.locale`, which a final `?` makes optional */
	types?: Record<string, string>;
	/** Generated types and properties to leave out */
	skip?: string[];
};

type Context = {
	schemas: Record<string, Schema>;
	resources: Map<string, Resource>;
	targets: Map<string, string>;
	aliases: Map<string, string>;
	taken: Set<string>;
	keepNullValues: boolean;
	selectable: boolean;
	stack: string[];
	names: Map<string, string>;
	given: Map<string, { type: string; optional: boolean }>;
	skipped: Set<string>;
	used: Set<string>;
	uses: Map<string, Map<string, number>>;
	path?: string;
	self?: string;
	sent?: "partial" | "required" | "typed";
};

type Declaration = { name: string; comment?: string; type: () => string };

const ITEM_PATH = /^\/(.+)\/\{([^/{}]+)\}$/;

const NAMES =
	/\/\*[\s\S]*?\*\/|\/\/(?! As a service: )[^\n]*|"(?:[^"\\]|\\.)*"|'(?:[^'\\]|\\.)*'|`(?:[^`\\]|\\.)*`|(?<![\p{ID_Continue}$]|(?<!\.)\.)[\p{ID_Start}_$][\p{ID_Continue}$]*(?![\p{ID_Continue}$]|\??:)/gu;

const SUBSTITUTIONS = /\$\{((?:[^{}]|\{[^{}]*\})*)\}/g;

const mapNames = (text: string, change: (name: string) => string): string =>
	text.replace(NAMES, (token) =>
		token.startsWith("`")
			? token.replace(
					SUBSTITUTIONS,
					(_, inner: string) => `\${${mapNames(inner, change)}}`,
				)
			: /^["'/]/.test(token)
				? token
				: change(token),
	);

const namesIn = (text: string) => {
	const names = new Set<string>();
	mapNames(text, (name) => {
		names.add(name);
		return name;
	});
	return names;
};

const lib = (
	context: Context,
	name: "AnyIri" | "Embedded" | "Iri" | "WriteBody",
) => {
	let alias: string = name;
	while (context.taken.has(alias)) {
		alias = `Api${alias}`;
	}
	return alias;
};

const pathOf = (context: Context, property: string) =>
	context.path === undefined ? undefined : `${context.path}.${property}`;

const givenAt = (context: Context, path: string | undefined) => {
	if (path === undefined || !context.given.has(path)) {
		return undefined;
	}
	context.used.add(path);
	return context.given.get(path);
};

const countUses = (text: string, skipped: Set<string>) => {
	const counts = new Map<string, number>();
	mapNames(text, (name) => {
		if (skipped.has(name)) {
			counts.set(name, (counts.get(name) ?? 0) + 1);
		}
		return name;
	});
	return counts;
};

const noteUses = (context: Context, path: string | undefined, type: string) => {
	if (path !== undefined && context.skipped.size) {
		const counts = context.uses.get(path) ?? new Map<string, number>();
		countUses(type, context.skipped).forEach((count, name) =>
			counts.set(name, (counts.get(name) ?? 0) + count),
		);
		context.uses.set(path, counts);
	}
	return type;
};

const isSkipped = (context: Context, path: string | undefined) => {
	if (path === undefined || !context.skipped.has(path)) {
		return false;
	}
	context.used.add(path);
	return true;
};

const partsOf = (parts: Schema[] | undefined): Schema[] =>
	Array.isArray(parts)
		? parts
		: typeof parts === "object" && parts !== null
			? [parts]
			: [];

const schemaName = (schema: Schema | undefined) =>
	schema?.$ref?.split("/").pop();

const JSON_TYPES = [
	"application/ld+json",
	"application/json",
	"application/merge-patch+json",
];

const FORMATS = ["jsonld", "jsonhal", "jsonapi", "jsonMergePatch"];

const WORDS = /[A-Z]?[a-z\d]+|[A-Z]+(?![a-z])/g;

const baseName = (name: string | undefined) => name?.match(/^[^.-]+/)?.[0];

const isLinked = (name: string | undefined) =>
	(name ?? "").replace(/-.*$/, "").split(".").includes("jsonld");

const twinOf = (name: string, aliases: Map<string, string>) =>
	name.replace(/^[^.-]+/, (base) => aliases.get(base) ?? base);

const isSame = (name: string, other: string, context: Context) =>
	name === other ||
	(twinOf(name, context.aliases) === twinOf(other, context.aliases) &&
		Object.keys(propertiesOf(context.schemas[name], context)).join() ===
			Object.keys(propertiesOf(context.schemas[other], context)).join());

const groupsOf = (schema: Schema) =>
	schemaName(schema)
		?.replace(/^[^-]*-?/, "")
		.replace(/(^|_)validation\..*$|\.jsonMergePatch$/, "") ?? "";

const variantName = (resource: Resource, groups: string) => {
	const words = (groups.match(WORDS) ?? []).join("_");
	const own = resource.name.match(WORDS) ?? [];
	const spellings = [
		resource.collection.split("/").pop()?.match(WORDS) ?? [],
		...own.map((_, index) => own.slice(index)),
	]
		.filter((spelling) => spelling.length)
		.map((spelling) => spelling.join("_?"));
	const others = words.replace(
		new RegExp(`(^|_)(?:${spellings.join("|")})s?(?=_|$)`, "gi"),
		"$1",
	);
	const suffix = [others, words, "full"]
		.map((text) =>
			text
				.split("_")
				.filter(
					(word, index, all) =>
						all.findIndex(
							(other) => other.toLowerCase() === word.toLowerCase(),
						) === index,
				)
				.map((word) => word.charAt(0).toUpperCase() + word.slice(1))
				.join(""),
		)
		.find(Boolean);
	return `${resource.name}${suffix}`;
};

const resourceName = (
	name: string | undefined,
	aliases: Map<string, string>,
) => {
	const base = baseName(name);
	return base && (aliases.get(base) ?? base);
};

const schemaOf = (content: Content | undefined) =>
	JSON_TYPES.map((type) => content?.content?.[type]?.schema).find(Boolean);

const hydra = (node: unknown, key: string): unknown =>
	typeof node === "object" && node !== null
		? ((node as Record<string, unknown>)[key] ??
			(node as Record<string, unknown>)[`hydra:${key}`])
		: undefined;

const list = (value: unknown): unknown[] => (Array.isArray(value) ? value : []);

const readTargets = (
	document: HydraDocument | undefined,
	aliases: Map<string, string>,
) => {
	const classes = list(hydra(document, "supportedClass"));
	const titleOf = (item: unknown) => {
		const title = String(hydra(item, "title"));
		return aliases.get(title) ?? title;
	};
	const titles = new Map(
		classes.map((item) => [hydra(item, "@id"), titleOf(item)]),
	);
	const ids = [...new Set(classes.map((item) => hydra(item, "@id")))];
	const targets = new Map<string, string>();
	classes.forEach((item) =>
		list(hydra(item, "supportedProperty")).forEach((supported) => {
			const property = hydra(supported, "property");
			const range = JSON.stringify(
				hydra(property, "range") ?? hydra(property, "rdfs:range") ?? "",
			);
			const [id, ...others] = ids.filter((candidate) =>
				range.includes(JSON.stringify(candidate)),
			);
			const target = others.length ? undefined : titles.get(id);
			if (target) {
				targets.set(`${titleOf(item)}.${hydra(supported, "title")}`, target);
			}
		}),
	);
	return targets;
};

const isSelectable = (operation: Operation | undefined, read: Schema) =>
	!groupsOf(read) &&
	(operation?.parameters ?? []).some(({ name }) => name === "properties[]");

const writesOf = (operations: (Operation | undefined)[]) =>
	operations.flatMap((operation) => schemaOf(operation?.requestBody) ?? []);

const membersOf = (collection: Schema | undefined) =>
	[collection, ...partsOf(collection?.allOf)]
		.map((part) => part?.properties)
		.map((properties) => properties?.member ?? properties?.["hydra:member"])
		.find(Boolean)?.items;

const readResources = (
	document: OpenApiDocument,
	aliases: Map<string, string>,
) => {
	const url = document.servers?.[0]?.url;
	const server = (typeof url === "string" ? url : "")
		.replace(/^(?:[a-z][a-z\d+.-]*:)?\/\/[^/]*/i, "")
		.replace(/^\/*|[?#].*$|\/+$/g, "");
	const base = server && !server.includes("{") ? `/${server}` : "";
	const resources = new Map<string, Resource>();
	const paths = Object.entries(document.paths ?? {});
	const hasOutput = (writing: (Operation | undefined)[]) =>
		!writing.some((operation) => operation?.responses?.["204"]) ||
		writing.some(
			(operation) =>
				schemaOf(operation?.responses?.["200"]) ??
				schemaOf(operation?.responses?.["201"]),
		);
	const items = paths.flatMap(([path, item]): (Route & { name: string })[] => {
		const [, prefix, identifier] = ITEM_PATH.exec(path) ?? [];
		const read = schemaOf(item.get?.responses?.["200"]);
		const name = resourceName(schemaName(read), aliases);
		if (!prefix || !identifier || !read || !name) {
			return [];
		}
		const collection = document.paths?.[`/${prefix}`];
		const writing = [collection?.post, item.put, item.patch];
		return [
			{
				name,
				path: `${base}/${prefix}`.slice(1),
				item: path,
				collection: `/${prefix}`,
				identifier,
				read,
				writes: writesOf(writing),
				selectable: isSelectable(collection?.get, read),
				output: hasOutput(writing),
			},
		];
	});
	const rank = ({ path, writes }: Route) => [
		path.split("{").length,
		path.split("/").length,
		writes.length ? 0 : 1,
	];
	const byOrder = (a: number[], b: number[]) =>
		a.map((value, index) => value - b[index]).find(Boolean) ?? 0;
	const ranked = [...items].sort((a, b) => byOrder(rank(a), rank(b)));
	ranked.forEach((item) => {
		if (!resources.has(item.name)) {
			resources.set(item.name, {
				...item,
				routes: ranked.filter(({ name }) => name === item.name),
			});
		}
	});
	paths
		.flatMap(([path, item]) => {
			const members = membersOf(schemaOf(item.get?.responses?.["200"]));
			const read = members ?? schemaOf(item.post?.responses?.["201"]);
			const returned = (schemaName(read) ?? "")
				.replace(/-.*$/, "")
				.split(".")
				.filter((part) => !FORMATS.includes(part));
			const name =
				returned.length === 1
					? resourceName(schemaName(read), aliases)
					: undefined;
			if (!read || !name || items.some((other) => other.name === name)) {
				return [];
			}
			const [, one] =
				paths.find(([other]) => `/${ITEM_PATH.exec(other)?.[1]}` === path) ??
				[];
			const writing = [item.post, one?.put, one?.patch];
			const route = {
				path: `${base}${path}`.slice(1),
				collection: path,
				identifier: "id",
				read,
				writes: writesOf(writing),
				selectable: isSelectable(item.get, read),
				output: hasOutput(writing),
			};
			return [{ name, route, order: [members ? 0 : 1, ...rank(route)] }];
		})
		.sort((a, b) => byOrder(a.order, b.order))
		.forEach(({ name, route }) => {
			if (!resources.has(name)) {
				resources.set(name, { ...route, name, routes: [route] });
			}
		});
	return resources;
};

const propertiesOf = (
	schema: Schema | undefined,
	context: Context,
): Record<string, Schema> => {
	if (!schema) {
		return {};
	}
	const name = schemaName(schema);
	const parts = [
		name ? context.schemas[name] : undefined,
		...partsOf(schema.allOf),
	];
	return Object.assign(
		{},
		...parts.map((part) => propertiesOf(part, context)),
		schema.properties,
	);
};

const isNull = (schema: Schema) =>
	[schema.type].flat().every((type) => type === "null");

const isNullable = (schema: Schema): boolean =>
	schema.nullable === true ||
	[schema.type].flat().includes("null") ||
	[
		...partsOf(schema.anyOf),
		...partsOf(schema.oneOf),
		...partsOf(schema.allOf),
	].some(isNullable);

const listed = (schema: Schema) =>
	Array.isArray(schema.required) ? schema.required : undefined;

const indent = (text: string) => text.replaceAll("\n", "\n\t");

const key = (name: string) =>
	/^[A-Za-z_$][\w$]*$/.test(name) ? name : JSON.stringify(name);

const objectType = (
	owner: string,
	properties: Record<string, Schema>,
	written: Record<string, Schema> | undefined,
	context: Context,
	required?: string[],
): string => {
	const lines = Object.entries(properties)
		.filter(
			([name, schema]) =>
				!name.startsWith("@") &&
				!schema.writeOnly &&
				!isSkipped(context, pathOf(context, name)),
		)
		.map(([name, schema]) => {
			const path = pathOf(context, name);
			const given = givenAt(context, path);
			const readOnly =
				schema.readOnly || (written && !Object.hasOwn(written, name));
			const nullable = isNullable(schema);
			const optional =
				nullable || given?.optional || required?.includes(name) === false;
			const type = noteUses(
				context,
				path,
				given?.type ??
					`${typeOf(schema, owner, name, { ...context, path })}${nullable && context.keepNullValues ? " | null" : ""}`,
			);
			return `${readOnly ? "readonly " : ""}${key(name)}${optional ? "?" : ""}: ${type};`;
		});
	return lines.length ? `{\n\t${indent(lines.join("\n"))}\n}` : "{}";
};

const iriOf = (name: string) => `${name}Iri`;

const typeOf = (
	schema: Schema,
	owner: string,
	property: string,
	context: Context,
): string => {
	const alternatives = [...partsOf(schema.anyOf), ...partsOf(schema.oneOf)]
		.filter((alternative) => !isNull(alternative))
		.map((alternative) => typeOf(alternative, owner, property, context));
	if (alternatives.length) {
		return [...new Set(alternatives)].join(" | ");
	}
	const name = schemaName(schema);
	if (!name && partsOf(schema.allOf).length) {
		const { allOf, ...own } = schema;
		const parts = [...partsOf(allOf), ...(own.properties ? [own] : [])]
			.map((part) => typeOf(part, owner, property, context))
			.filter((part) => part !== "unknown");
		return parts.length < 2
			? (parts[0] ?? "unknown")
			: parts
					.map((part) => (part.includes(" | ") ? `(${part})` : part))
					.join(" & ");
	}
	if (name) {
		const component = context.schemas[name];
		if (component && !component.properties && !component.allOf) {
			return typeOf(component, owner, property, context);
		}
		const target = resourceName(name, context.aliases) ?? name;
		const known = context.resources.has(target);
		const open = context.stack.some((other) => isSame(other, name, context));
		if (context.sent) {
			const sent = open
				? "{ [key: string]: unknown }"
				: sentObject(
						target,
						Object.entries(propertiesOf(schema, context)),
						requiredOf(schema, context),
						{ ...context, stack: [...context.stack, name] },
					);
			return !known
				? sent
				: open
					? iriOf(target)
					: `${iriOf(target)} | ${sent}`;
		}
		if (open) {
			const model =
				context.self && isSame(context.stack[0] ?? "", name, context)
					? context.self
					: ([...context.names].find(([other]) =>
							isSame(other, name, context),
						)?.[1] ?? "{ [key: string]: unknown }");
			return known && isLinked(name)
				? `${lib(context, "Embedded")}<${model}, ${iriOf(target)}>`
				: model;
		}
		const body = objectType(target, propertiesOf(schema, context), undefined, {
			...context,
			stack: [...context.stack, name],
		});
		if (!known || !isLinked(name)) {
			return body;
		}
		const embedded = lib(context, "Embedded");
		const line = `${embedded}<${body.replace(/\n\t*/g, " ").replace(/; }$/, " }")}, ${iriOf(target)}>`;
		return line.length <= 60 &&
			body.split("{").length === 2 &&
			!body.includes("//")
			? line
			: `${embedded}<\n\t${indent(body)},\n\t${iriOf(target)}\n>`;
	}
	if (schema.const !== undefined && schema.const !== null) {
		return JSON.stringify(schema.const);
	}
	if (schema.enum?.some((value) => value !== null)) {
		return schema.enum
			.filter((value) => value !== null)
			.map((value) => JSON.stringify(value))
			.join(" | ");
	}
	const types = [schema.type]
		.flat()
		.filter((candidate) => candidate && candidate !== "null");
	if (types.length > 1) {
		return [
			...new Set(
				types.map((type) =>
					typeOf({ ...schema, type }, owner, property, context),
				),
			),
		].join(" | ");
	}
	const [type] = types;
	if (schema.format === "iri-reference") {
		const target = context.targets.get(`${owner}.${property}`);
		if (target && context.resources.has(target)) {
			return context.selectable
				? `${target} | ${iriOf(target)}`
				: iriOf(target);
		}
		return lib(context, "AnyIri");
	}
	if (type === "array" && schema.maxItems === 0) {
		return "[]";
	}
	if (type === "array") {
		const items = `${typeOf(schema.items ?? {}, owner, property, context)}${schema.items && isNullable(schema.items) ? " | null" : ""}`;
		return `${items.includes(" ") ? `(${items})` : items}[]`;
	}
	if (schema.properties && (!type || type === "object")) {
		return context.sent
			? sentObject(
					owner,
					Object.entries(schema.properties),
					listed(schema) ?? [],
					context,
					listed(schema),
				)
			: objectType(
					owner,
					schema.properties,
					undefined,
					context,
					listed(schema),
				);
	}
	if (type === "object") {
		const values = schema.additionalProperties;
		return `{ [key: string]: ${typeof values === "object" ? `${typeOf(values, owner, property, context)}${isNullable(values) ? " | null" : ""}` : "unknown"} }`;
	}
	if (type === "integer" || type === "number") {
		return "number";
	}
	return type === "string" || type === "boolean" ? type : "unknown";
};

const writtenBy = (routes: Route[], context: Context) =>
	Object.assign(
		{},
		...routes
			.flatMap(({ writes }) => writes)
			.map((write) => propertiesOf(write, context)),
	) as Record<string, Schema>;

const requiredOf = (schema: Schema | undefined, context: Context): string[] => {
	if (!schema) {
		return [];
	}
	const name = schemaName(schema);
	return [name ? context.schemas[name] : undefined, ...partsOf(schema.allOf)]
		.flatMap((part) => requiredOf(part, context))
		.concat(listed(schema) ?? []);
};

const sentObject = (
	owner: string,
	properties: [string, Schema][],
	required: string[],
	context: Context,
	own?: string[],
): string => {
	const lines = properties
		.filter(
			([name, schema]) =>
				!name.startsWith("@") &&
				!schema.readOnly &&
				!isSkipped(context, pathOf(context, name)),
		)
		.map(([name, schema]) => {
			const path = pathOf(context, name);
			const given = givenAt(context, path);
			const nullable = isNullable(schema);
			const needed = context.sent === "required" && required.includes(name);
			const optional =
				context.sent === "typed"
					? nullable || own?.includes(name) === false
					: !needed;
			const type = noteUses(
				context,
				path,
				given?.type ??
					`${typeOf(schema, owner, name, { ...context, path })}${nullable && !needed ? " | null" : ""}`,
			);
			return `${key(name)}${optional || given?.optional ? "?" : ""}: ${type};`;
		});
	return lines.length ? `{\n\t${indent(lines.join("\n"))}\n}` : "{}";
};

const bodyType = (resource: Resource, context: Context) => {
	const read = propertiesOf(resource.read, context);
	const extras = sentObject(
		resource.name,
		Object.entries(writtenBy([resource], context)).filter(
			([name, schema]) => schema.writeOnly || !Object.hasOwn(read, name),
		),
		[],
		{ ...context, selectable: false, sent: "partial" },
	);
	return extras === "{}"
		? undefined
		: `${lib(context, "WriteBody")}<${resource.name}> & ${extras}`;
};

const modelOf = (
	resource: Resource,
	schema: Schema,
	context: Context,
	routes: Route[] = [],
	self = resource.name,
) =>
	objectType(
		resource.name,
		propertiesOf(schema, context),
		writtenBy(routes, context),
		{ ...context, stack: [schemaName(schema) ?? resource.name], self },
	);

const comment = (text: string) => `/** ${text.replaceAll("*/", "*\\/")} */`;

const byPath = (routes: string[]) =>
	[...routes].sort((a, b) =>
		a.split(" ").reverse().join() < b.split(" ").reverse().join() ? -1 : 1,
	);

/** Writes the IRI type and the model of every resource an API Platform application documents, with the body of its writes when it cannot be deduced, a model for each other serialization its routes return and a body for each write route of its own, then the other objects its operations take or return. */
export const generateTypes = (
	openApi: OpenApiDocument,
	hydraDocument?: HydraDocument,
	keepNullValues = false,
	config: Config = {},
): string => {
	const renames = new Map(Object.entries(config.rename ?? {}));
	const invalid = [...renames.values()].find(
		(name) => !/^[\p{ID_Start}_$][\p{ID_Continue}$]*$/u.test(name),
	);
	if (invalid !== undefined) {
		throw new Error(`${JSON.stringify(invalid)} is not a valid type name`);
	}
	const schemas = openApi.components?.schemas ?? {};
	const bases = new Set(Object.keys(schemas).map(baseName));
	const aliases = new Map(
		[...bases].flatMap((base) => {
			const digits = base?.match(/\d+$/)?.[0].length ?? 0;
			const stem = Array.from({ length: digits }, (_, index) =>
				base?.slice(0, -(index + 1)),
			).find((candidate) => candidate && bases.has(candidate));
			return base && stem ? [[base, stem] as const] : [];
		}),
	);
	const context: Context = {
		schemas,
		resources: readResources(openApi, aliases),
		targets: readTargets(hydraDocument, aliases),
		aliases,
		taken: new Set(),
		keepNullValues,
		selectable: false,
		stack: [],
		names: new Map(),
		given: new Map(),
		skipped: new Set(),
		used: new Set(),
		uses: new Map(),
	};
	context.resources.forEach(({ name, read }) =>
		context.names.set(schemaName(read) ?? name, name),
	);
	const serialization = (schema: Schema) =>
		`${groupsOf(schema)} ${Object.keys(propertiesOf(schema, context))
			.filter((property) => !property.startsWith("@"))
			.sort()
			.join()}`;
	const used = new Set(
		[...context.resources.values()]
			.flatMap(({ routes }) => routes)
			.flatMap(({ read, writes }) => [read, ...writes])
			.map(schemaName),
	);
	const others = new Map<
		string,
		{ type: string; schema: Schema; returned: string[]; taken: string[] }
	>();
	const variants = new Map<string, Variant>();
	const inputs = new Map<string, Variant>();
	Object.entries(openApi.paths ?? {})
		.flatMap(([path, item]) =>
			(["get", "post", "put", "patch"] as const).flatMap((method) => {
				const answers = ["200", "201"].map((status) =>
					schemaOf(item[method]?.responses?.[status]),
				);
				const route = `${method.toUpperCase()} ${path}`;
				return [
					{ schema: schemaOf(item[method]?.requestBody), route, taken: true },
					...[...answers, ...answers.map(membersOf)].map((schema) => ({
						schema,
						route,
						taken: false,
					})),
				];
			}),
		)
		.forEach(({ schema, route, taken }) => {
			const name = schemaName(schema);
			const type = name
				?.replace(/-.*$/, "")
				.split(".")
				.filter((part) => !FORMATS.includes(part))
				.pop();
			if (!schema || !name || !type) {
				return;
			}
			const resource = context.resources.get(aliases.get(type) ?? type);
			const draft = { ...context, selectable: resource?.selectable ?? false };
			if (!resource) {
				const properties = propertiesOf(schema, context);
				const written = Object.entries(properties)
					.filter(([, property]) => property.writeOnly)
					.map(([property]) => property);
				const content = `${type} ${objectType(type, properties, undefined, { ...draft, stack: [name] })} ${written.join()}`;
				const object = others.get(content) ?? {
					type,
					schema,
					returned: [],
					taken: [],
				};
				if (!used.has(name)) {
					others.set(
						content,
						taken
							? { ...object, taken: [...new Set([...object.taken, route])] }
							: {
									...object,
									returned: [...new Set([...object.returned, route])],
								},
					);
				}
				return;
			}
			const sent = (body: Schema) =>
				sentObject(
					resource.name,
					Object.entries(propertiesOf(body, context)),
					[],
					{
						...draft,
						selectable: false,
						sent: "partial",
						stack: [schemaName(body) ?? name],
					},
				);
			const same = serialization(schema);
			const standard = resource.routes.flatMap(({ writes }) => writes);
			const model = taken ? sent(schema) : modelOf(resource, schema, draft);
			const known = taken
				? used.has(name) ||
					model === "{}" ||
					standard.some(
						(write) => serialization(write) === same || sent(write) === model,
					)
				: serialization(resource.read) === same ||
					model === modelOf(resource, resource.read, draft);
			if (known) {
				return;
			}
			const found = taken ? inputs : variants;
			const [joined] =
				[...found].find(
					([, other]) =>
						!taken &&
						other.resource === resource &&
						serialization(other.schema) === same,
				) ?? [];
			const content =
				joined ??
				`${resource.name} ${model} ${taken ? requiredOf(schema, context).join() : ""}`;
			const variant = found.get(content) ?? { resource, schema, routes: [] };
			found.set(content, {
				...variant,
				routes: byPath([...new Set([...variant.routes, route])]),
			});
		});
	[...context.resources.keys()]
		.flatMap((name) => [name, iriOf(name)])
		.forEach((name) => context.taken.add(name));
	const reserve = (base: string) => {
		let name = base;
		for (let count = 2; context.taken.has(name); count++) {
			name = `${base}${count}`;
		}
		context.taken.add(name);
		return name;
	};
	const objects = [...others.values()]
		.map((object, _, all) => {
			const owner = resourceName(schemaName(object.schema), aliases) ?? "";
			const words = (object.type.match(WORDS) ?? []).map((word) =>
				word.toLowerCase(),
			);
			const groups = (groupsOf(object.schema).match(WORDS) ?? [])
				.filter((word) => !words.includes(word.toLowerCase()))
				.map((word) => word.charAt(0).toUpperCase() + word.slice(1))
				.join("");
			const shared = all.filter(({ type }) => type === object.type).length > 1;
			return {
				...object,
				base: shared
					? `${object.type.startsWith(owner) ? "" : owner}${object.type}${groups}`
					: object.type,
			};
		})
		.sort((a, b) => (a.base < b.base ? -1 : 1))
		.map((object) => ({ ...object, name: reserve(object.base) }));
	const bodies = new Map(
		[...context.resources.keys()].map((name) => [
			name,
			reserve(
				context.taken.has(`${name}Body`) ? `${name}WriteBody` : `${name}Body`,
			),
		]),
	);
	const name = (found: Map<string, Variant>, suffix: string) =>
		[...found.values()]
			.map((variant) => {
				const { resource, routes } = variant;
				const own = routes.some(
					(route) =>
						route === `GET ${resource.collection}` ||
						route === `GET ${resource.item}`,
				);
				return {
					variant,
					order: `${variantName(resource, groupsOf(variant.schema))}${suffix} ${own ? 0 : 1} ${routes[0]}`,
				};
			})
			.sort((a, b) => (a.order < b.order ? -1 : 1))
			.map(({ variant, order }) => ({
				name: reserve(order.split(" ")[0]),
				variant,
			}));
	const named = name(variants, "");
	const taken = name(inputs, "Body");
	[
		...named,
		...objects.map((object) => ({ ...object, variant: object })),
	].forEach(({ name, variant }) =>
		context.names.set(schemaName(variant.schema) ?? name, name),
	);
	const models = [...context.resources.values()]
		.sort((a, b) => (a.name < b.name ? -1 : 1))
		.map((resource) => {
			const scoped = {
				...context,
				selectable: resource.selectable,
				stack: [schemaName(resource.read) ?? resource.name],
			};
			const shape = (schema: Schema) => modelOf(resource, schema, scoped);
			const returning = (schema: Schema, routes: string[]) =>
				resource.routes.filter(
					(route) =>
						serialization(route.read) === serialization(schema) ||
						shape(route.read) === shape(schema) ||
						routes.includes(`GET ${route.collection}`),
				);
			const iris = [
				...new Set(
					resource.routes.map(({ path, item, identifier, read }) => {
						const types = [propertiesOf(read, context)[identifier]?.type]
							.flat()
							.filter((candidate) => candidate !== "null");
						const numeric =
							types.length > 0 &&
							types.every((type) => type === "integer" || type === "number");
						const id =
							numeric && item
								? ""
								: types.join() === "string"
									? ", string"
									: ", string | number";
						const literal = !item
							? "string"
							: path.includes("{")
								? `\`${path.replace(/[`\\]/g, "\\$&").replace(/\{[^}]+\}/g, "${string}")}\``
								: JSON.stringify(path);
						return `${lib(context, "Iri")}<${literal}${id}>`;
					}),
				),
			];
			const body = bodyType(resource, scoped) && bodies.get(resource.name);
			const others = named.filter(
				({ variant }) => variant.resource === resource,
			);
			const listed = others.find(({ variant }) =>
				variant.routes.includes(`GET ${resource.collection}`),
			);
			const isKept = (name: string | undefined) =>
				name !== undefined && !context.skipped.has(name);
			const service = () => {
				const options = [
					isKept(body) && `body: ${body}`,
					listed && isKept(listed.name) && `collection: ${listed.name}`,
					!resource.output && "output: false",
				].filter(Boolean);
				return isKept(resource.name) && isKept(iriOf(resource.name))
					? `// As a service: entityServiceBuilder<${iriOf(resource.name)}, ${resource.name}${options.length ? `, { ${options.join("; ")} }` : ""}>(api, ${JSON.stringify(`/${resource.path}`)})\n`
					: "";
			};
			const declarations: Declaration[] = [
				{
					name: iriOf(resource.name),
					type: () => {
						const union = iris.join(" | ");
						return `export type ${iriOf(resource.name)} = ${union};`.length <=
							80 || iris.length === 1
							? union
							: `\n\t| ${iris.join("\n\t| ")}`;
					},
				},
				{
					name: resource.name,
					type: () =>
						modelOf(
							resource,
							resource.read,
							{ ...scoped, path: resource.name },
							returning(resource.read, []),
						),
				},
				...(body
					? [
							{
								name: body,
								type: () =>
									bodyType(resource, { ...scoped, path: body }) ??
									`${lib(context, "WriteBody")}<${resource.name}>`,
							},
						]
					: []),
				...others.map(({ name, variant }) => ({
					name,
					comment: comment(
						`Returned${isLinked(schemaName(variant.schema)) ? "" : " in plain JSON"} by ${variant.routes.join(", ")}.`,
					),
					type: () =>
						modelOf(
							resource,
							variant.schema,
							{
								...context,
								selectable: scoped.selectable && !groupsOf(variant.schema),
								path: name,
							},
							returning(variant.schema, variant.routes),
							name,
						),
				})),
				...taken
					.filter(({ variant }) => variant.resource === resource)
					.map(({ name, variant }) => ({
						name,
						comment: comment(`Taken by ${variant.routes.join(", ")}.`),
						type: () =>
							sentObject(
								resource.name,
								Object.entries(propertiesOf(variant.schema, context)),
								requiredOf(variant.schema, context),
								{
									...context,
									sent: variant.routes.every((route) =>
										/^(POST|PUT) /.test(route),
									)
										? "required"
										: "partial",
									stack: [schemaName(variant.schema) ?? name],
									path: name,
								},
							),
					})),
			];
			return { service, declarations };
		});
	const plain = objects.map(
		({ name, type, schema, returned, taken }): Declaration => {
			const routes = [
				returned.length && `Returned by ${byPath(returned).join(", ")}.`,
				taken.length && `Taken by ${byPath(taken).join(", ")}.`,
			].filter(Boolean);
			const scoped = {
				...context,
				keepNullValues: keepNullValues || taken.length > 0,
				stack: [schemaName(schema) ?? type],
				self: name,
				path: name,
			};
			const properties = propertiesOf(schema, context);
			return {
				name,
				comment: comment(routes.join(" ")),
				type: () =>
					returned.length
						? objectType(type, properties, undefined, scoped)
						: sentObject(type, Object.entries(properties), [], {
								...scoped,
								sent: "typed",
							}),
			};
		},
	);
	const all = new Set(
		[...models.flatMap(({ declarations }) => declarations), ...plain].map(
			({ name }) => name,
		),
	);
	const generatedOf = (key: string) => {
		const [head = "", ...rest] = key.replace(/\?$/, "").split(".");
		const original = all.has(head)
			? head
			: [...renames].find(([, name]) => name === head)?.[0];
		return [original ?? head, ...rest].join(".");
	};
	const typed = Object.entries(config.types ?? {}).map(([key, type]) => ({
		key,
		type,
		path: generatedOf(key),
	}));
	const skips = (config.skip ?? []).map(generatedOf);
	const empty = typed.find(({ type }) => !type.trim());
	if (empty) {
		throw new Error(`The type of ${empty.key} is empty`);
	}
	const paths = typed.map(({ path }) => path);
	const clashes = [
		...paths.filter(
			(path, index) => paths.indexOf(path) !== index || skips.includes(path),
		),
		...[...renames.keys()].filter((name) => skips.includes(name)),
	];
	if (clashes.length) {
		throw new Error(
			`The config changes ${[...new Set(clashes)].join(", ")} more than once`,
		);
	}
	typed.forEach(({ key, type, path }) =>
		context.given.set(path, { type, optional: key.endsWith("?") }),
	);
	skips.forEach((path) => context.skipped.add(path));
	const declare = ({ name, comment, type }: Declaration) => {
		const written = givenAt(context, name)?.type ?? type();
		return `${comment ? `${comment}\n` : ""}export type ${name} =${written.startsWith("\n") ? "" : " "}${written};`;
	};
	const blocks = [
		...models,
		...plain.map((declaration) => ({
			service: () => "",
			declarations: [declaration],
		})),
	]
		.map(({ service, declarations }) => ({
			service: service(),
			declarations: declarations
				.filter(({ name }) => !context.skipped.has(name))
				.map((declaration) => ({
					name: declaration.name,
					text: declare(declaration),
				})),
		}))
		.filter(({ declarations }) => declarations.length);
	const kept = new Set(
		blocks.flatMap(({ declarations }) => declarations.map(({ name }) => name)),
	);
	const unknown = [
		...Object.keys(config.rename ?? {}).filter((name) => !kept.has(name)),
		...Object.keys(config.types ?? {}).filter(
			(key) => !context.used.has(generatedOf(key)),
		),
		...(config.skip ?? []).filter((key) => {
			const path = generatedOf(key);
			const parts = path.split(".");
			const left = parts.some(
				(_, index) =>
					index > 0 && context.skipped.has(parts.slice(0, index).join(".")),
			);
			return !all.has(path) && !context.used.has(path) && !left;
		}),
	];
	if (unknown.length) {
		throw new Error(
			`The generated file has no type or property named ${unknown.join(", ")}`,
		);
	}
	const nested = new Map<string, [string, Map<string, number>][]>();
	context.uses.forEach((counts, path) => {
		const parent = path.slice(0, path.lastIndexOf("."));
		nested.set(parent, [...(nested.get(parent) ?? []), [path, counts]]);
	});
	const usersOf = (
		path: string,
		counts: Map<string, number>,
		used: string,
	): string[] => {
		const children = nested.get(path) ?? [];
		const inside = children.reduce(
			(sum, [, own]) => sum + (own.get(used) ?? 0),
			0,
		);
		return (counts.get(used) ?? 0) > inside
			? [path]
			: children.flatMap(([other, own]) => usersOf(other, own, used));
	};
	const conflicts = new Set(
		blocks.flatMap(({ declarations }) =>
			declarations.flatMap(({ name, text }) => {
				const counts = countUses(text, context.skipped);
				const uses = [...counts.keys()].flatMap((used) =>
					usersOf(name, counts, used).map((path) => [path, used] as const),
				);
				return uses
					.filter(
						([path]) => !uses.some(([above]) => path.startsWith(`${above}.`)),
					)
					.map(([path, used]) => `${path} uses ${used}`);
			}),
		),
	);
	if (conflicts.size) {
		throw new Error(
			`Kept types use skipped ones: ${[...conflicts].join(", ")}`,
		);
	}
	const sections = blocks.map(({ service, declarations }) =>
		mapNames(
			`${service}${declarations.map(({ text }) => text).join("\n")}`,
			(name) => renames.get(name) ?? name,
		),
	);
	const mentioned = namesIn(sections.join("\n"));
	const imports = (["AnyIri", "Embedded", "Iri", "WriteBody"] as const)
		.map((name) => [name, lib(context, name)] as const)
		.filter(([, alias]) => mentioned.has(alias))
		.map(([name, alias]) => (name === alias ? name : `${name} as ${alias}`));
	const register = JSON.stringify(openApi.paths ?? {}).includes(
		'"hydra:member"',
	)
		? [
				'declare module "apiplatform-fetch-builder" {\n\tinterface Register {\n\t\thydraPrefix: true;\n\t}\n}',
			]
		: [];
	const generated = [
		`// Generated by apiplatform-fetch-builder${keepNullValues ? " with --keep-null-values" : ""}. Do not edit.`,
		...(imports.length
			? [
					`import type { ${imports.join(", ")} } from "apiplatform-fetch-builder";`,
				]
			: []),
		...register,
		...sections,
	].join("\n\n");
	const names = [
		...imports.map((name) => name.replace(/^.+ as /, "")),
		...[...generated.matchAll(/^export type (\S+) =/gm)].map(
			([, name]) => name,
		),
	];
	const twice = names.find((name, index) => names.indexOf(name) !== index);
	if (twice) {
		throw new Error(`Two generated types are named ${twice}`);
	}
	return `${generated}\n`;
};
