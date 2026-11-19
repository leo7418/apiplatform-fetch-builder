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

	const parseIri = (iriOrId: EntityIri | IriId<EntityIri>): string =>
		typeof iriOrId === "string" && iriOrId.startsWith("/")
			? iriOrId
			: `${entityPath}/${iriOrId}`;

	const create = (body: EntityBody) =>
		fetcher.post<Item<Entity, EntityIri>, EntityBody>(entityPath).fetch(body);

	const get = <P extends PropertyPath<Item<Entity, EntityIri>>[]>(
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

	const update = (
		idOrIriOrBody:
			| ObjectWithId<Partial<EntityBody>, EntityIri>
			| EntityIri
			| number,
		maybeBody?: Partial<EntityBody>,
	): Promise<Item<Entity, EntityIri>> => {
		const iri =
			typeof idOrIriOrBody === "object"
				? (idOrIriOrBody["@id"] ?? idOrIriOrBody.id)
				: idOrIriOrBody;
		const body = typeof idOrIriOrBody === "object" ? idOrIriOrBody : maybeBody!;
		return fetcher
			.patch<
				Item<Entity, EntityIri>,
				Partial<EntityBody>
			>(parseIri(iri as EntityIri | IriId<EntityIri>))
			.fetch(body);
	};

	const replace = (
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
		const body = typeof idOrIriOrBody === "object" ? idOrIriOrBody : maybeBody!;

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

		return id !== undefined
			? update(body as ObjectWithId<Partial<EntityBody>, EntityIri>)
			: create(body as EntityBody);
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
		let page = 0;
		let shouldContinue = await onProgress?.({
			page: 0,
			fetchedItems: 0,
			totalItems,
			progressPercent: 0,
		});

		while (
			shouldContinue !== false &&
			(totalItems === undefined || members.length < totalItems)
		) {
			const pageMembers = (await fetchPage(page, ITEMS_PER_PAGE))[
				`${prefix}member`
			] as unknown[];
			if (pageMembers.length === 0) break;

			members.push(...pageMembers);
			page++;

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

	const del = (idOrIri: EntityIri | IriId<EntityIri>) =>
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
