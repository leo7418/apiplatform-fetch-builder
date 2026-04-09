import fetchBuilder, { type GetOptions } from "./fetch-builder.ts";
import type { Collection } from "../types/collection.ts";
import type { Iri } from "../types/iri.ts";
import type { Item } from "../types/item.ts";
import type { Response } from "../types/response.ts";
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

type ObjectWithId<T extends object, I extends Iri<string>> = T &
	({ "@id": I; id?: never } | { "@id"?: never; id: number });

type EntityService<
	EntityIri extends Iri<string>,
	EntityBody extends object,
	Entity extends object,
> = {
	create: (body: EntityBody) => Promise<Response<Item<Entity, EntityIri>>>;
	get: {
		(iriOrId: EntityIri | number): Promise<Response<Item<Entity, EntityIri>>>;
		<P extends PropertyPath<Item<Entity, EntityIri>>[]>(
			iriOrId: EntityIri | number,
			getOptions: GetOptions<Item<Entity, EntityIri>, P>,
		): Promise<Response<PropertyValue<Item<Entity, EntityIri>, P[number]>>>;
	};
	getAll: {
		(): Promise<Response<Collection<Entity, EntityIri>>>;
		<P extends PropertyPath<Collection<Entity, EntityIri>>[]>(
			getOptions: GetOptions<Collection<Entity, EntityIri>, P>,
		): Promise<
			Response<PropertyValue<Collection<Entity, EntityIri>, P[number]>>
		>;
	};
	update: {
		(
			body: ObjectWithId<Partial<EntityBody>, EntityIri>,
		): Promise<Response<Item<Entity, EntityIri>>>;
		(
			idOrIri: EntityIri | number,
			body: Partial<EntityBody>,
		): Promise<Response<Item<Entity, EntityIri>>>;
	};
	replace: {
		(
			body: ObjectWithId<EntityBody, EntityIri>,
		): Promise<Response<Item<Entity, EntityIri>>>;
		(
			idOrIri: EntityIri | number,
			body: EntityBody,
		): Promise<Response<Item<Entity, EntityIri>>>;
	};
	upsert: (
		body: EntityBody | ObjectWithId<Partial<EntityBody>, EntityIri>,
	) => Promise<Response<Item<Entity, EntityIri>>>;
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
	delete: (idOrIri: EntityIri | number) => Promise<Response<null>>;
};

const entityServiceBuilder = <
	EntityIri extends Iri<string>,
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

	const parseIri = (iriOrId: EntityIri | number): EntityIri | string =>
		typeof iriOrId === "number" ? `${entityPath}/${iriOrId}` : iriOrId;

	const create = (body: EntityBody) =>
		fetcher.post<Item<Entity, EntityIri>, EntityBody>(entityPath).fetch(body);

	const get = <P extends PropertyPath<Item<Entity, EntityIri>>[]>(
		iriOrId: EntityIri | number,
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
	): Promise<Response<Item<Entity, EntityIri>>> => {
		const iri =
			typeof idOrIriOrBody === "object"
				? (idOrIriOrBody["@id"] ?? idOrIriOrBody.id)
				: idOrIriOrBody;
		const body = typeof idOrIriOrBody === "object" ? idOrIriOrBody : maybeBody!;
		return fetcher
			.patch<
				Item<Entity, EntityIri>,
				Partial<EntityBody>
			>(parseIri(iri as EntityIri | number))
			.fetch(body);
	};

	const replace = (
		idOrIriOrBody: ObjectWithId<EntityBody, EntityIri> | EntityIri | number,
		maybeBody?: EntityBody,
	): Promise<Response<Item<Entity, EntityIri>>> => {
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
	): Promise<Response<Item<Entity, EntityIri>>> => {
		const id =
			(body as ObjectWithId<Partial<EntityBody>, EntityIri>)["@id"] ??
			(body as ObjectWithId<Partial<EntityBody>, EntityIri>).id;

		return id
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

		const fetchPage = (pageIndex: number, pageSize: number) =>
			fetcher
				.get<Collection<Entity, EntityIri>>(entityPath)
				.withOptions({
					...(getOptions as GetOptions<Collection<Entity, EntityIri>, never[]>),
					pagination: true,
					pageIndex,
					pageSize,
				})
				.fetch();

		const probeResult = await fetchPage(0, 1);
		if (!probeResult.success) throw probeResult.error;

		const totalItems = probeResult.data["hydra:totalItems"];

		const shouldStart = await onProgress?.({
			page: 0,
			fetchedItems: 0,
			totalItems,
			progressPercent: 0,
		});
		if (shouldStart === false) {
			return { ...probeResult.data, "hydra:member": [], "hydra:totalItems": 0 };
		}

		if (totalItems === 0) {
			return { ...probeResult.data, "hydra:member": [], "hydra:totalItems": 0 };
		}

		const members: Collection<Entity, EntityIri>["hydra:member"] = [];
		let page = 0;

		while (members.length < totalItems) {
			const result = await fetchPage(page, ITEMS_PER_PAGE);
			if (!result.success) throw result.error;

			members.push(
				...(result.data["hydra:member"] as Collection<
					Entity,
					EntityIri
				>["hydra:member"]),
			);

			const progressPercent =
				totalItems > 0
					? Math.min(100, Math.round((members.length / totalItems) * 100))
					: 0;

			const shouldContinue = await onProgress?.({
				page: page + 1,
				fetchedItems: members.length,
				totalItems,
				progressPercent,
			});

			if (shouldContinue === false) break;
			if (result.data["hydra:member"].length < ITEMS_PER_PAGE) break;
			page++;
		}

		return {
			...probeResult.data,
			"hydra:member": members,
			"hydra:totalItems": members.length,
		};
	};

	const del = (idOrIri: EntityIri | number) =>
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
