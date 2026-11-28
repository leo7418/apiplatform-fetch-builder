import { ApiError } from "./api-error.ts";
import fetchBuilder, { type QueryOptions } from "./fetch-builder.ts";
import { isObject, isPlainObject } from "./utils.ts";
import type { ReplaceBody, WriteBody } from "../types/body.ts";
import type { Collection, PartialCollection } from "../types/collection.ts";
import type { AnyIri, IriId } from "../types/iri.ts";
import type { Item } from "../types/item.ts";
import type { PropertyPath } from "../types/property-path.ts";
import type { PropertyValue, Read } from "../types/property-value.ts";

export type GetAllPagesProgress = {
	page: number;
	fetchedItems: number;
	totalItems?: number | undefined;
	progressPercent: number;
};

export type OnProgress = (
	progress: GetAllPagesProgress,
) => boolean | void | Promise<boolean | void>;

type OwnId<Entity> = Entity extends unknown
	? "id" extends keyof Entity
		? Entity["id" & keyof Entity]
		: never
	: never;

type ObjectWithId<T, I extends AnyIri, Id> = T &
	(
		| { "@id": I; id?: IriId<I> | Id | undefined }
		| { "@id"?: I | undefined; id: IriId<I> }
	);

type WithoutId<T> = T extends unknown
	? { [K in keyof T as K extends "id" ? never : K]: T[K] }
	: never;

type Unsaved<T, I extends AnyIri> = WithoutId<T> & {
	"@id"?: I | null | undefined;
	id?: IriId<I> | null | "" | undefined;
};

export type EntityServiceOptions = {
	/** `"partial"` when the resource uses partial pagination, which has no total. */
	pagination?: "partial";
	/** `false` when the write operations of the resource return no content. */
	output?: false;
	/** Body of the write operations, when it is not the one deduced from the entity. */
	body?: object;
	/** Model of the members of the collection, when the API serializes them differently from an item. */
	collection?: object;
};

type Option<
	Options,
	Key extends keyof EntityServiceOptions,
> = Key extends keyof Options ? Exclude<Options[Key], undefined> : never;

type BodyOf<Entity, Options> = [Option<Options, "body">] extends [never]
	? WriteBody<Entity>
	: Option<Options, "body">;

type PatchBodyOf<Entity, Options> = WithoutId<Partial<BodyOf<Entity, Options>>>;

type ReplaceBodyOf<Entity, Options> = WithoutId<
	[Option<Options, "body">] extends [never]
		? ReplaceBody<Entity>
		: Option<Options, "body">
>;

type Collections<Entity, EntityIri extends AnyIri> = {
	full: Collection<Entity, EntityIri>;
	partial: PartialCollection<Entity, EntityIri>;
};

type Member<Entity, Options> = [Option<Options, "collection">] extends [never]
	? Entity
	: Option<Options, "collection">;

type Listed<EntityIri extends AnyIri, Model, Options> = Collections<
	Model,
	EntityIri
>[[Option<Options, "pagination">] extends [never] ? "full" : "partial"];

type Written<EntityIri extends AnyIri, Entity, Options> = [
	Option<Options, "output">,
] extends [never]
	? Item<Read<Entity>, EntityIri>
	: null;

export type EntityService<
	EntityIri extends AnyIri,
	Entity extends object,
	Options extends EntityServiceOptions = object,
> = {
	create: (
		body: BodyOf<Entity, Options>,
	) => Promise<Written<EntityIri, Entity, Options>>;
	get: {
		(
			iriOrId: EntityIri | IriId<EntityIri>,
			query?: QueryOptions<Item<Entity, EntityIri>, []>,
		): Promise<Item<Read<Entity>, EntityIri>>;
		<P extends PropertyPath<Item<Entity, EntityIri>>[]>(
			iriOrId: EntityIri | IriId<EntityIri>,
			query: QueryOptions<Item<Entity, EntityIri>, P>,
		): Promise<PropertyValue<Item<Entity, EntityIri>, P[number]>>;
	};
	getAll: {
		(
			query?: QueryOptions<
				Listed<EntityIri, Member<Entity, Options>, Options>,
				[],
				Collection<Entity | Member<Entity, Options>, EntityIri>
			>,
		): Promise<Listed<EntityIri, Read<Member<Entity, Options>>, Options>>;
		<
			P extends PropertyPath<
				Listed<EntityIri, Member<Entity, Options>, Options>
			>[],
		>(
			query: QueryOptions<
				Listed<EntityIri, Member<Entity, Options>, Options>,
				P,
				Collection<Entity | Member<Entity, Options>, EntityIri>
			>,
		): Promise<
			PropertyValue<
				Listed<EntityIri, Member<Entity, Options>, Options>,
				P[number]
			>
		>;
	};
	update: {
		(
			body: ObjectWithId<
				PatchBodyOf<Entity, Options>,
				EntityIri,
				OwnId<Entity>
			>,
		): Promise<Written<EntityIri, Entity, Options>>;
		(
			idOrIri: EntityIri | IriId<EntityIri>,
			body: PatchBodyOf<Entity, Options>,
		): Promise<Written<EntityIri, Entity, Options>>;
	};
	replace: {
		(
			body: ObjectWithId<
				ReplaceBodyOf<Entity, Options>,
				EntityIri,
				OwnId<Entity>
			>,
		): Promise<Written<EntityIri, Entity, Options>>;
		(
			idOrIri: EntityIri | IriId<EntityIri>,
			body: ReplaceBodyOf<Entity, Options>,
		): Promise<Written<EntityIri, Entity, Options>>;
	};
	upsert: (
		body:
			| Unsaved<BodyOf<Entity, Options>, EntityIri>
			| ObjectWithId<PatchBodyOf<Entity, Options>, EntityIri, OwnId<Entity>>,
	) => Promise<Written<EntityIri, Entity, Options>>;
	getAllPages: {
		(
			onProgress?: OnProgress,
		): Promise<Collection<Read<Member<Entity, Options>>, EntityIri>>;
		(
			query: Omit<
				QueryOptions<
					Collection<Member<Entity, Options>, EntityIri>,
					never[],
					Collection<Entity | Member<Entity, Options>, EntityIri>
				>,
				"pagination" | "pageIndex"
			>,
			onProgress?: OnProgress,
		): Promise<Collection<Read<Member<Entity, Options>>, EntityIri>>;
	};
	delete: (idOrIri: EntityIri | IriId<EntityIri>) => Promise<null>;
};

const IRI = /^(\/|[a-z][a-z\d+.-]*:\/\/)/i;
const GENERATED_ID = /^_:|\/\.well-known\/genid\//;
const API_CONTEXT = /\/contexts\/[^/]+$/;
const ORIGIN = /^(?:[a-z][a-z\d+.-]*:)?\/\/[^/]*/i;

const originOf = (iri: string) => ORIGIN.exec(iri)?.[0] ?? "";

const targetOf = (body: { "@id"?: unknown; id?: unknown }): unknown =>
	typeof body["@id"] === "string" && GENERATED_ID.test(body["@id"])
		? body.id
		: body["@id"] || body.id;

const decode = (segment: string) => {
	try {
		return decodeURIComponent(segment);
	} catch {
		return segment;
	}
};

const toIris = (value: unknown): unknown => {
	if (Array.isArray(value)) {
		return value.map(toIris);
	}
	if (!isPlainObject(value)) {
		return value;
	}
	const { "@context": context, "@id": id } = value;
	const ownContext =
		typeof context === "string" &&
		typeof id === "string" &&
		API_CONTEXT.test(context) &&
		originOf(context) === originOf(id);
	if (context !== undefined && !ownContext) {
		return value;
	}
	const generated = typeof id === "string" && GENERATED_ID.test(id);
	if (typeof id === "string" && IRI.test(id) && !generated) {
		return id;
	}
	return Object.fromEntries(
		Object.entries(value)
			.filter(([key]) => !generated || (key !== "@id" && key !== "@type"))
			.map(([key, nested]) => [key, toIris(nested)]),
	);
};

const entityServiceBuilder = <
	EntityIri extends AnyIri,
	Entity extends object,
	Options extends EntityServiceOptions = object,
>(
	fetchOptions:
		| string
		| {
				entrypoint: Parameters<typeof fetchBuilder>[0];
				config?: Parameters<typeof fetchBuilder>[1];
		  }
		| ReturnType<typeof fetchBuilder>,
	entityPath: string,
): EntityService<EntityIri, Entity, Options> => {
	type EntityBody = BodyOf<Entity, Options>;
	type EntityPatchBody = PatchBodyOf<Entity, Options>;
	type EntityReplaceBody = ReplaceBodyOf<Entity, Options>;
	const fetcher =
		typeof fetchOptions === "string"
			? fetchBuilder(fetchOptions)
			: "entrypoint" in fetchOptions
				? fetchBuilder(fetchOptions.entrypoint, fetchOptions.config)
				: fetchOptions;
	const resourcePath = entityPath.replace(/\/+$/, "");

	const parseIri = (iriOrId: EntityIri | IriId<EntityIri>): string => {
		if (typeof iriOrId === "string" && IRI.test(iriOrId)) {
			return iriOrId;
		}
		if (iriOrId == null || ["", ".", ".."].includes(String(iriOrId))) {
			throw new TypeError(`Invalid identifier: "${iriOrId}"`);
		}
		return `${resourcePath}/${encodeURIComponent(iriOrId)}`;
	};

	const toBody = <T>(body: T, keepId: boolean): T => {
		if (Array.isArray(body)) {
			return body.map((item) => toBody(item, keepId)) as T;
		}
		if (!isPlainObject(body)) {
			return body;
		}
		const iri = body["@id"];
		const ownId =
			typeof iri === "string" &&
			decode(iri.slice(iri.lastIndexOf("/") + 1)) === String(body.id);
		const keptId = keepId && !ownId;
		return Object.fromEntries(
			Object.entries(body)
				.filter(
					([key, value]) =>
						!key.startsWith("@") &&
						(key !== "id" || (keptId && value != null && value !== "")),
				)
				.map(([key, value]) => [key, toIris(value)]),
		) as T;
	};

	const create = async (body: EntityBody) =>
		fetcher
			.post<Item<Entity, EntityIri>, EntityBody>(resourcePath)
			.fetch(toBody(body, true));

	const get = async <P extends PropertyPath<Item<Entity, EntityIri>>[]>(
		iriOrId: EntityIri | IriId<EntityIri>,
		query?: QueryOptions<Item<Entity, EntityIri>, P>,
	) => {
		const builder = fetcher.get<Item<Entity, EntityIri>>(parseIri(iriOrId));
		return query ? builder.withQuery(query).fetch() : builder.fetch();
	};

	const getAll = <P extends PropertyPath<Collection<Entity, EntityIri>>[]>(
		query?: QueryOptions<Collection<Entity, EntityIri>, P>,
	) => {
		const builder = fetcher.get<Collection<Entity, EntityIri>>(resourcePath);
		return query ? builder.withQuery(query).fetch() : builder.fetch();
	};

	const update = async (
		idOrIriOrBody:
			| ObjectWithId<EntityPatchBody, EntityIri, OwnId<Entity>>
			| EntityIri
			| IriId<EntityIri>,
		maybeBody?: EntityPatchBody,
	): Promise<Item<Entity, EntityIri>> => {
		const iri =
			typeof idOrIriOrBody === "object"
				? targetOf(idOrIriOrBody)
				: idOrIriOrBody;
		const body = toBody(
			typeof idOrIriOrBody === "object" ? idOrIriOrBody : maybeBody!,
			false,
		);
		return fetcher
			.patch<
				Item<Entity, EntityIri>,
				EntityPatchBody
			>(parseIri(iri as EntityIri | IriId<EntityIri>))
			.fetch(body);
	};

	const replace = async (
		idOrIriOrBody:
			| ObjectWithId<EntityReplaceBody, EntityIri, OwnId<Entity>>
			| EntityIri
			| IriId<EntityIri>,
		maybeBody?: EntityReplaceBody,
	): Promise<Item<Entity, EntityIri>> => {
		const iri =
			typeof idOrIriOrBody === "object"
				? targetOf(idOrIriOrBody)
				: idOrIriOrBody;
		const body = toBody(
			typeof idOrIriOrBody === "object" ? idOrIriOrBody : maybeBody!,
			false,
		);

		return fetcher
			.put<
				Item<Entity, EntityIri>,
				EntityReplaceBody
			>(parseIri(iri as EntityIri | IriId<EntityIri>))
			.fetch(body);
	};

	const upsert = (
		body: EntityBody | ObjectWithId<EntityPatchBody, EntityIri, OwnId<Entity>>,
	): Promise<Item<Entity, EntityIri>> => {
		const id = targetOf(body as { "@id"?: unknown; id?: unknown });

		return id == null || id === ""
			? create(body as EntityBody)
			: update(body as ObjectWithId<EntityPatchBody, EntityIri, OwnId<Entity>>);
	};

	const getAllPages = async (
		queryOrOnProgress?:
			| Omit<
					QueryOptions<Collection<Entity, EntityIri>, never[]>,
					"pagination" | "pageIndex"
			  >
			| OnProgress,
		maybeOnProgress?: OnProgress,
	): Promise<Collection<Entity, EntityIri>> => {
		const query =
			typeof queryOrOnProgress === "function" ? undefined : queryOrOnProgress;
		const onProgress =
			typeof queryOrOnProgress === "function"
				? queryOrOnProgress
				: maybeOnProgress;
		let pageSize: number | undefined = query?.pageSize ?? 100;
		const fetchPage = (pageIndex?: number): Promise<Record<string, unknown>> =>
			fetcher
				.get<Collection<Entity, EntityIri>>(resourcePath)
				.withQuery({
					...query,
					pageSize,
					...(pageIndex !== undefined && { pageIndex }),
				} as QueryOptions<Collection<Entity, EntityIri>, never[]>)
				.fetch();

		const first = await fetchPage().catch((error: unknown) => {
			if (
				query?.pageSize !== undefined ||
				!(error instanceof ApiError) ||
				error.status !== 400
			) {
				throw error;
			}
			pageSize = undefined;
			return fetchPage();
		});
		const prefix = isObject(first) && "hydra:member" in first ? "hydra:" : "";
		const membersOf = (pageData: Record<string, unknown>): unknown[] => {
			const pageMembers = isObject(pageData) && pageData[`${prefix}member`];
			if (!Array.isArray(pageMembers)) {
				throw new TypeError(`"${resourcePath}" did not return a collection`);
			}
			return pageMembers;
		};
		membersOf(first);
		const totalItems = first[`${prefix}totalItems`] as number | undefined;

		const members: unknown[] = [];
		const followed = new Set<string>();
		let page = 0;
		let pageData = first;
		let shouldContinue = await onProgress?.({
			page: 0,
			fetchedItems: 0,
			totalItems,
			progressPercent: 0,
		});

		while (shouldContinue !== false) {
			const pageMembers = membersOf(pageData);
			const view = pageData[`${prefix}view`] as
				| Record<string, unknown>
				| undefined;
			if (pageMembers.length === 0) break;

			pageMembers.forEach((member) => members.push(member));
			page++;
			if (typeof view?.["@id"] === "string") {
				followed.add(view["@id"]);
			}
			const next = view?.[`${prefix}next`] as string | undefined;
			const hasMore =
				next === undefined
					? totalItems !== undefined && members.length < totalItems
					: !followed.has(next);
			if (next !== undefined) {
				followed.add(next);
			}

			shouldContinue = await onProgress?.({
				page,
				fetchedItems: members.length,
				totalItems,
				progressPercent: totalItems
					? Math.min(100, Math.round((members.length / totalItems) * 100))
					: 0,
			});
			if (!hasMore || shouldContinue === false) break;

			pageData =
				next === undefined
					? await fetchPage(page)
					: await fetcher.get<Record<string, unknown>>(next).fetch();
		}

		const collection: Record<string, unknown> = {
			...first,
			[`${prefix}member`]: members,
			[`${prefix}totalItems`]: members.length,
		};
		delete collection[`${prefix}view`];

		return collection as Collection<Entity, EntityIri>;
	};

	const del = async (idOrIri: EntityIri | IriId<EntityIri>) =>
		fetcher.delete(parseIri(idOrIri)).fetch();

	return {
		create,
		get,
		getAll,
		getAllPages,
		update,
		replace,
		upsert,
		delete: del,
	} as EntityService<EntityIri, Entity, Options>;
};

export default entityServiceBuilder;
