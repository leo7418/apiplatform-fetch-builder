type Schema = {
	$ref?: string;
	allOf?: Schema[];
	anyOf?: Schema[];
	oneOf?: Schema[];
	type?: string | string[];
	format?: string;
	enum?: unknown[];
	items?: Schema;
	properties?: Record<string, Schema>;
	additionalProperties?: Schema | boolean;
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

type PathItem = Partial<Record<"get" | "post" | "put" | "patch", Operation>>;

export type OpenApiDocument = {
	servers?: { url?: string }[];
	paths?: Record<string, PathItem>;
	components?: { schemas?: Record<string, Schema> };
};

export type HydraDocument = Record<string, unknown>;

type Resource = {
	name: string;
	path: string;
	identifier: string;
	read: Schema;
	writes: Schema[];
	selectable: boolean;
};

type Variant = { resource: Resource; schema: Schema; routes: string[] };

type Context = {
	schemas: Record<string, Schema>;
	resources: Map<string, Resource>;
	targets: Map<string, string>;
	aliases: Map<string, string>;
	imports: Set<string>;
	taken: Set<string>;
	keepNullValues: boolean;
	selectable: boolean;
	stack: string[];
};

const ITEM_PATH = /^\/(.+)\/\{([^/{}]+)\}$/;

const lib = (
	context: Context,
	name: "AnyIri" | "Embedded" | "Iri" | "WriteBody",
) => {
	let alias: string = name;
	while (context.taken.has(alias)) {
		alias = `Api${alias}`;
	}
	context.imports.add(alias === name ? name : `${name} as ${alias}`);
	return alias;
};

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

const groupsOf = (schema: Schema) =>
	schemaName(schema)?.replace(/^[^-]*-?/, "") ?? "";

const variantName = (resource: string, groups: string) => {
	const words = (groups.match(WORDS) ?? []).join("_");
	const own = new RegExp(
		`(^|_)${(resource.match(WORDS) ?? []).join("_")}(?=_|$)`,
		"gi",
	);
	const suffix = [words.replace(own, "$1"), words, "full"]
		.map((text) =>
			text.replace(/(?:^|_)+(.?)/g, (_, initial: string) =>
				initial.toUpperCase(),
			),
		)
		.find(Boolean);
	return `${resource}${suffix}`;
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

const readTargets = (document: HydraDocument | undefined) => {
	const classes = list(hydra(document, "supportedClass"));
	const titles = new Map(
		classes.map((item) => [hydra(item, "@id"), String(hydra(item, "title"))]),
	);
	const ids = classes.map((item) => hydra(item, "@id"));
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
				targets.set(
					`${hydra(item, "title")}.${hydra(supported, "title")}`,
					target,
				);
			}
		}),
	);
	return targets;
};

const isSelectable = (operation: Operation | undefined, read: Schema) =>
	!schemaName(read)?.includes("-") &&
	(operation?.parameters ?? []).some(({ name }) => name === "properties[]");

const writesOf = (operations: (Operation | undefined)[]) =>
	operations.flatMap((operation) => schemaOf(operation?.requestBody) ?? []);

const membersOf = (collection: Schema | undefined) =>
	[collection, ...(collection?.allOf ?? [])]
		.map((part) => part?.properties)
		.map((properties) => properties?.member ?? properties?.["hydra:member"])
		.find(Boolean)?.items;

const readResources = (
	document: OpenApiDocument,
	aliases: Map<string, string>,
) => {
	const base = new URL(
		document.servers?.[0]?.url ?? "/",
		"http://localhost",
	).pathname.replace(/\/+$/, "");
	const resources = new Map<string, Resource>();
	const paths = Object.entries(document.paths ?? {});
	const nested = ([path]: [string, PathItem]) => path.split("{").length > 2;
	[...paths.filter((entry) => !nested(entry)), ...paths.filter(nested)].forEach(
		([path, item]) => {
			const [, prefix, identifier] = ITEM_PATH.exec(path) ?? [];
			const read = schemaOf(item.get?.responses?.["200"]);
			const name = resourceName(schemaName(read), aliases);
			if (!prefix || !identifier || !read || !name || resources.has(name)) {
				return;
			}
			const collection = document.paths?.[`/${prefix}`];
			resources.set(name, {
				name,
				path: `${base}/${prefix}`.slice(1),
				identifier,
				read,
				writes: writesOf([collection?.post, item.put, item.patch]),
				selectable: isSelectable(collection?.get, read),
			});
		},
	);
	paths.forEach(([path, item]) => {
		const read =
			membersOf(schemaOf(item.get?.responses?.["200"])) ??
			schemaOf(item.post?.responses?.["201"]);
		const name = resourceName(schemaName(read), aliases);
		if (read && name && !resources.has(name)) {
			resources.set(name, {
				name,
				path: `${base}${path}`.slice(1),
				identifier: "id",
				read,
				writes: writesOf([item.post]),
				selectable: isSelectable(item.get, read),
			});
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
		...(schema.allOf ?? []),
	];
	return Object.assign(
		{},
		...parts.map((part) => propertiesOf(part, context)),
		schema.properties,
	);
};

const isNull = (schema: Schema) => schema.type === "null";

const isNullable = (schema: Schema) =>
	schema.nullable === true ||
	(Array.isArray(schema.type) && schema.type.includes("null")) ||
	[...(schema.anyOf ?? []), ...(schema.oneOf ?? [])].some(isNull);

const indent = (text: string) => text.replaceAll("\n", "\n\t");

const key = (name: string) =>
	/^[A-Za-z_$][\w$]*$/.test(name) ? name : JSON.stringify(name);

const objectType = (
	owner: string,
	properties: Record<string, Schema>,
	written: Record<string, Schema> | undefined,
	context: Context,
): string => {
	const lines = Object.entries(properties)
		.filter(([name, schema]) => !name.startsWith("@") && !schema.writeOnly)
		.map(([name, schema]) => {
			const readOnly =
				schema.readOnly || (written && !Object.hasOwn(written, name));
			const nullable = isNullable(schema);
			const kept = nullable && context.keepNullValues;
			return `${readOnly ? "readonly " : ""}${key(name)}${nullable && !kept ? "?" : ""}: ${typeOf(schema, owner, name, context)}${kept ? " | null" : ""};`;
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
	const alternatives = [...(schema.anyOf ?? []), ...(schema.oneOf ?? [])]
		.filter((alternative) => !isNull(alternative))
		.map((alternative) => typeOf(alternative, owner, property, context));
	if (alternatives.length) {
		return [...new Set(alternatives)].join(" | ");
	}
	const name = schemaName(schema);
	if (name) {
		const component = context.schemas[name];
		if (component && !component.properties && !component.allOf) {
			return typeOf(component, owner, property, context);
		}
		const target = resourceName(name, context.aliases) ?? name;
		const known = context.resources.has(target);
		if (context.stack.includes(name)) {
			return known
				? `${lib(context, "Embedded")}<${target}, ${iriOf(target)}>`
				: "{ [key: string]: unknown }";
		}
		const body = objectType(target, propertiesOf(schema, context), undefined, {
			...context,
			stack: [...context.stack, name],
		});
		if (!known) {
			return body;
		}
		const embedded = lib(context, "Embedded");
		const line = `${embedded}<${body.replace(/\n\t*/g, " ").replace("; }", " }")}, ${iriOf(target)}>`;
		return line.length <= 60 && body.split("{").length === 2
			? line
			: `${embedded}<\n\t${indent(body)},\n\t${iriOf(target)}\n>`;
	}
	if (schema.enum) {
		return schema.enum
			.filter((value) => value !== null)
			.map((value) => JSON.stringify(value))
			.join(" | ");
	}
	const type = [schema.type]
		.flat()
		.find((candidate) => candidate && candidate !== "null");
	if (schema.format === "iri-reference") {
		const target = context.targets.get(`${owner}.${property}`);
		if (target && context.resources.has(target)) {
			return context.selectable
				? `${target} | ${iriOf(target)}`
				: iriOf(target);
		}
		return lib(context, "AnyIri");
	}
	if (type === "array") {
		const items = typeOf(schema.items ?? {}, owner, property, context);
		return `${items.includes(" ") ? `(${items})` : items}[]`;
	}
	if (schema.properties) {
		return objectType(owner, schema.properties, undefined, context);
	}
	if (type === "object") {
		const values = schema.additionalProperties;
		return `{ [key: string]: ${typeof values === "object" ? typeOf(values, owner, property, context) : "unknown"} }`;
	}
	if (type === "integer" || type === "number") {
		return "number";
	}
	return type === "string" || type === "boolean" ? type : "unknown";
};

const writtenBy = (resource: Resource, context: Context) =>
	Object.assign(
		{},
		...resource.writes.map((write) => propertiesOf(write, context)),
	) as Record<string, Schema>;

const bodyType = (resource: Resource, context: Context) => {
	const read = propertiesOf(resource.read, context);
	const lines = Object.entries(writtenBy(resource, context))
		.filter(
			([name, schema]) =>
				!name.startsWith("@") &&
				(schema.writeOnly || !Object.hasOwn(read, name)),
		)
		.map(
			([name, schema]) =>
				`${key(name)}?: ${typeOf(schema, resource.name, name, context)}${isNullable(schema) ? " | null" : ""};`,
		);
	if (!lines.length) {
		return [];
	}
	const name = context.taken.has(`${resource.name}Body`)
		? `${resource.name}WriteBody`
		: `${resource.name}Body`;
	return [
		`export type ${name} = ${lib(context, "WriteBody")}<${resource.name}> & {\n\t${indent(lines.join("\n"))}\n};`,
	];
};

const modelOf = (resource: Resource, schema: Schema, context: Context) =>
	objectType(
		resource.name,
		propertiesOf(schema, context),
		writtenBy(resource, context),
		{ ...context, stack: [schemaName(schema) ?? resource.name] },
	);

/** Writes the IRI type, the model and, when some properties are only written, the body of every resource an API Platform application documents, with a model for each other serialization its routes return, then the other objects its operations take or return. */
export const generateTypes = (
	openApi: OpenApiDocument,
	hydraDocument?: HydraDocument,
	keepNullValues = false,
): string => {
	const schemas = openApi.components?.schemas ?? {};
	const bases = new Set(Object.keys(schemas).map(baseName));
	const aliases = new Map(
		[...bases].flatMap((base) => {
			const stem = base?.replace(/\d+$/, "");
			return base && stem && stem !== base && bases.has(stem)
				? [[base, stem] as const]
				: [];
		}),
	);
	const context: Context = {
		schemas,
		resources: readResources(openApi, aliases),
		targets: readTargets(hydraDocument),
		aliases,
		imports: new Set(),
		taken: new Set(),
		keepNullValues,
		selectable: false,
		stack: [],
	};
	const used = new Set(
		[...context.resources.values()]
			.flatMap(({ read, writes }) => [read, ...writes])
			.map(schemaName),
	);
	const others = new Map<string, Schema>();
	const variants = new Map<string, Variant>();
	Object.entries(openApi.paths ?? {})
		.flatMap(([path, item]) =>
			(["get", "post", "put", "patch"] as const).flatMap((method) => {
				const answers = ["200", "201"].map((status) =>
					schemaOf(item[method]?.responses?.[status]),
				);
				return [
					{ schema: schemaOf(item[method]?.requestBody), route: undefined },
					...[...answers, ...answers.map(membersOf)].map((schema) => ({
						schema,
						route: `${method.toUpperCase()} ${path}`,
					})),
				];
			}),
		)
		.forEach(({ schema, route }) => {
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
			if (!resource) {
				if (!used.has(name)) {
					others.set(type, others.get(type) ?? schema);
				}
				return;
			}
			const draft = {
				...context,
				imports: new Set<string>(),
				selectable: resource.selectable,
			};
			const model = modelOf(resource, schema, draft);
			if (!route || model === modelOf(resource, resource.read, draft)) {
				return;
			}
			const key = `${resource.name} ${model}`;
			const variant = variants.get(key) ?? { resource, schema, routes: [] };
			variants.set(key, {
				...variant,
				routes: [...new Set([...variant.routes, route])],
			});
		});
	[...context.resources.keys()]
		.flatMap((name) => [name, iriOf(name)])
		.concat([...others.keys()])
		.forEach((name) => context.taken.add(name));
	const named = [...variants.values()]
		.map((variant) => ({
			variant,
			base: variantName(variant.resource.name, groupsOf(variant.schema)),
		}))
		.sort((a, b) => (a.base < b.base ? -1 : 1))
		.map(({ variant, base }) => {
			let name = base;
			for (let count = 2; context.taken.has(name); count++) {
				name = `${base}${count}`;
			}
			context.taken.add(name);
			return { name, variant };
		});
	const models = [...context.resources.values()]
		.sort((a, b) => (a.name < b.name ? -1 : 1))
		.map((resource) => {
			const scoped = {
				...context,
				selectable: resource.selectable,
				stack: [schemaName(resource.read) ?? resource.name],
			};
			const read = propertiesOf(resource.read, context);
			const path = resource.path.includes("{")
				? `\`${resource.path.replace(/\{[^}]+\}/g, "${string}")}\``
				: `"${resource.path}"`;
			const type = [read[resource.identifier]?.type]
				.flat()
				.find((candidate) => candidate !== "null");
			const identifier =
				type === "integer" || type === "number"
					? ""
					: type === "string"
						? ", string"
						: ", string | number";
			return [
				`export type ${iriOf(resource.name)} = ${lib(context, "Iri")}<${path}${identifier}>;\nexport type ${resource.name} = ${modelOf(resource, resource.read, scoped)};`,
				...bodyType(resource, scoped),
				...named
					.filter(({ variant }) => variant.resource === resource)
					.map(({ name, variant }) => {
						const selectable = scoped.selectable && !groupsOf(variant.schema);
						return `/** Returned by ${variant.routes.join(", ")}. */\nexport type ${name} = ${modelOf(resource, variant.schema, { ...context, selectable })};`;
					}),
			].join("\n\n");
		});
	const plain = [...others]
		.sort(([a], [b]) => (a < b ? -1 : 1))
		.map(
			([type, schema]) =>
				`export type ${type} = ${objectType(type, propertiesOf(schema, context), undefined, { ...context, stack: [schemaName(schema) ?? type] })};`,
		);
	const imports = context.imports.size
		? [
				`import type { ${[...context.imports].sort().join(", ")} } from "apiplatform-fetch-builder";`,
			]
		: [];
	const generated = [
		"// Generated by apiplatform-fetch-builder. Do not edit.",
		...imports,
		...models,
		...plain,
	].join("\n\n");
	const names = [
		...[...context.imports].map((name) => name.replace(/^.+ as /, "")),
		...[...generated.matchAll(/^export type (\w+)/gm)].map(([, name]) => name),
	];
	const twice = names.find((name, index) => names.indexOf(name) !== index);
	if (twice) {
		throw new Error(`Two generated types are named ${twice}`);
	}
	return `${generated}\n`;
};
