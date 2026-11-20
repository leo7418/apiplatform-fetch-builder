import fetchBuilder, { type GetOptions } from "./fetch-builder.ts";
import type { Collection } from "../types/collection.ts";
import type { AnyIri, IriId } from "../types/iri.ts";
import type { Item } from "../types/item.ts";
import type { PropertyPath } from "../types/property-path.ts";
import type { PropertyValue } from "../types/property-value.ts";

export type GetAllPagesProgress = {
	page: number;
	fetchedItems: number;
	totalItems?: number;
	progressPercent: number;
};

export type OnProgress = (
	progress: GetAllPagesProgress,
) => boolean | void | Promise<boolean | void>;

type ObjectWithId<T extends object, I extends AnyIri> = T &
	({ "@id": I; id?: never } | { "@id"?: never; id: IriId<I> });

type EntityService<
	EntityIri extends AnyIri,
	EntityBody extends object,
	Entity extends object,
> = {
	create: (body: EntityBody) => Promise<Item<Entity, EntityIri>>;
	get: {
		(iriOrId: EntityIri | IriId<EntityIri>): Promise<Item<Entity, EntityIri>>;
		<P extends PropertyPath<Item<Entity, EntityIri>>[]>(
			iriOrId: EntityIri | IriId<EntityIri>,
			getOptions: GetOptions<Item<Entity, EntityIri>, P>,
		): Promise<PropertyValue<Item<Entity, EntityIri>, P[number]>>;
	};
	getAll: {
		(): Promise<Collection<Entity, EntityIri>>;
		<P extends PropertyPath<Collection<Entity, EntityIri>>[]>(
			getOptions: GetOptions<Collection<Entity, EntityIri>, P>,
		): Promise<PropertyValue<Collection<Entity, EntityIri>, P[number]>>;
	};
	update: {
		(
			body: ObjectWithId<Partial<EntityBody>, EntityIri>,
		): Promise<Item<Entity, EntityIri>>;
		(
			idOrIri: EntityIri | IriId<EntityIri>,
			body: Partial<EntityBody>,
		): Promise<Item<Entity, EntityIri>>;
	};
	replace: {
		(
			body: ObjectWithId<EntityBody, EntityIri>,
		): Promise<Item<Entity, EntityIri>>;
		(
			idOrIri: EntityIri | IriId<EntityIri>,
			body: EntityBody,
		): Promise<Item<Entity, EntityIri>>;
	};
	upsert: (
		body: EntityBody | ObjectWithId<Partial<EntityBody>, EntityIri>,
	) => Promise<Item<Entity, EntityIri>>;
	getAllPages: {
		(onProgress?: OnProgress): Promise<Collection<Entity, EntityIri>>;
		(
			getOptions: Omit<
				GetOptions<Collection<Entity, EntityIri>, never[]>,
				"pagination" | "pageIndex"
			>,
			onProgress?: OnProgress,
		): Promise<Collection<Entity, EntityIri>>;
	};
	delete: (idOrIri: EntityIri | IriId<EntityIri>) => Promise<null>;
};

const entityServiceBuilder = <
	EntityIri extends AnyIri,
	EntityBody extends object,
	Entity extends object,
>(
	fetchOptions:
		| string
		| {
				entrypoint: Parameters<typeof fetchBuilder>[0];
				config?: Parameters<typeof fetchBuilder>[1];
		  }
		| ReturnType<typeof fetchBuilder>,
	entityPath: string,
): EntityService<EntityIri, EntityBody, Entity> => {
	const fetcher =
		typeof fetchOptions === "string"
			? fetchBuilder(fetchOptions)
			: "entrypoint" in fetchOptions
				? fetchBuilder(fetchOptions.entrypoint, fetchOptions.config)
				: fetchOptions;

	const parseIri = (iriOrId: EntityIri | IriId<EntityIri>): string => {
		if (
			typeof iriOrId === "string" &&
			/^(\/|[a-z][a-z\d+.-]*:\/\/)/i.test(iriOrId)
		) {
			return iriOrId;
		}
		if (["", ".", ".."].includes(String(iriOrId))) {
			throw new TypeError(`Invalid identifier: "${iriOrId}"`);
		}
		return `${entityPath}/${encodeURIComponent(iriOrId)}`;
	};

	const toBody = <T extends object>(body: T, keepId: boolean) =>
		Object.getPrototypeOf(body) !== Object.prototype
			? body
			: (Object.fromEntries(
					Object.entries(body).filter(
						([key, value]) =>
							!key.startsWith("@") &&
							(key !== "id" || (keepId && value != null && value !== "")),
					),
				) as T);

	const create = (body: EntityBody) =>
		fetcher
			.post<Item<Entity, EntityIri>, EntityBody>(entityPath)
			.fetch(toBody(body, true));

	const get = async <P extends PropertyPath<Item<Entity, EntityIri>>[]>(
		iriOrId: EntityIri | IriId<EntityIri>,
		getOptions?: GetOptions<Item<Entity, EntityIri>, P>,
	) => {
		const builder = fetcher.get<Item<Entity, EntityIri>>(parseIri(iriOrId));
		return getOptions
			? builder.withOptions(getOptions).fetch()
			: builder.fetch();
	};

	const getAll = <P extends PropertyPath<Collection<Entity, EntityIri>>[]>(
		getOptions?: GetOptions<Collection<Entity, EntityIri>, P>,
	) => {
		const builder = fetcher.get<Collection<Entity, EntityIri>>(entityPath);
		return getOptions
			? builder.withOptions(getOptions).fetch()
			: builder.fetch();
	};

	const update = async (
		idOrIriOrBody:
			| ObjectWithId<Partial<EntityBody>, EntityIri>
			| EntityIri
			| IriId<EntityIri>,
		maybeBody?: Partial<EntityBody>,
	): Promise<Item<Entity, EntityIri>> => {
		const iri =
			typeof idOrIriOrBody === "object"
				? (idOrIriOrBody["@id"] ?? idOrIriOrBody.id)
				: idOrIriOrBody;
		const body = toBody(
			typeof idOrIriOrBody === "object" ? idOrIriOrBody : maybeBody!,
			false,
		);
		return fetcher
			.patch<
				Item<Entity, EntityIri>,
				Partial<EntityBody>
			>(parseIri(iri as EntityIri | IriId<EntityIri>))
			.fetch(body);
	};

	const replace = async (
		idOrIriOrBody:
			| ObjectWithId<EntityBody, EntityIri>
			| EntityIri
			| IriId<EntityIri>,
		maybeBody?: EntityBody,
	): Promise<Item<Entity, EntityIri>> => {
		const iri =
			typeof idOrIriOrBody === "object"
				? (idOrIriOrBody["@id"] ?? idOrIriOrBody.id)!
				: idOrIriOrBody;
		const body = toBody(
			typeof idOrIriOrBody === "object" ? idOrIriOrBody : maybeBody!,
			false,
		);

		return fetcher
			.put<Item<Entity, EntityIri>, EntityBody>(parseIri(iri))
			.fetch(body);
	};

	const upsert = (
		body: EntityBody | ObjectWithId<Partial<EntityBody>, EntityIri>,
	): Promise<Item<Entity, EntityIri>> => {
		const id =
			(body as ObjectWithId<Partial<EntityBody>, EntityIri>)["@id"] ??
			(body as ObjectWithId<Partial<EntityBody>, EntityIri>).id;

		return id == null || id === ""
			? create(body as EntityBody)
			: update(body as ObjectWithId<Partial<EntityBody>, EntityIri>);
	};

	const getAllPages = async (
		getOptionsOrOnProgress?:
			| Omit<
					GetOptions<Collection<Entity, EntityIri>, never[]>,
					"pagination" | "pageIndex"
			  >
			| OnProgress,
		maybeOnProgress?: OnProgress,
	): Promise<Collection<Entity, EntityIri>> => {
		const getOptions =
			typeof getOptionsOrOnProgress === "function"
				? undefined
				: getOptionsOrOnProgress;
		const onProgress =
			typeof getOptionsOrOnProgress === "function"
				? getOptionsOrOnProgress
				: maybeOnProgress;
		const ITEMS_PER_PAGE = getOptions?.pageSize ?? 100;

		const fetchPage = (
			pageIndex: number,
			pageSize: number,
		): Promise<Record<string, unknown>> =>
			fetcher
				.get<Collection<Entity, EntityIri>>(entityPath)
				.withOptions({
					...(getOptions as GetOptions<Collection<Entity, EntityIri>, never[]>),
					pagination: true,
					pageIndex,
					pageSize,
				})
				.fetch();

		const probe = await fetchPage(0, 1);
		const prefix = "hydra:member" in probe ? "hydra:" : "";
		const totalItems = probe[`${prefix}totalItems`] as number | undefined;

		const members: unknown[] = [];
		const followed = new Set<string>();
		let page = 0;
		let next: string | undefined;
		let hasMore = totalItems !== 0;
		let shouldContinue = await onProgress?.({
			page: 0,
			fetchedItems: 0,
			totalItems,
			progressPercent: 0,
		});

		while (shouldContinue !== false && hasMore) {
			const pageData =
				next === undefined
					? await fetchPage(page, ITEMS_PER_PAGE)
					: await fetcher.get<Record<string, unknown>>(next).fetch();
			const pageMembers = pageData[`${prefix}member`] as unknown[];
			const view = pageData[`${prefix}view`] as
				| Record<string, unknown>
				| undefined;
			if (pageMembers.length === 0) break;

			pageMembers.forEach((member) => members.push(member));
			page++;
			next = view?.[`${prefix}next`] as string | undefined;
			hasMore =
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
		}

		const collection: Record<string, unknown> = {
			...probe,
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
	} as EntityService<EntityIri, EntityBody, Entity>;
};

export default entityServiceBuilder;
