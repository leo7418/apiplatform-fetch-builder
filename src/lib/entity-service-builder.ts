import fetchBuilder, { type GetOptions } from "./fetch-builder.ts";
import type { Collection } from "@/types/collection.ts";
import type { Iri } from "@/types/iri.ts";
import type { Item } from "@/types/item.ts";
import type { Response } from "@/types/response.ts";
import type { PropertyPath } from "@/types/property-path.ts";
import type { PropertyValue } from "@/types/property-value.ts";

type ObjectWithId<T extends object, I extends Iri<string>> = T &
	({ "@id": I; id?: never } | { "@id"?: never; id: number });

type EntityService<
	EntityIri extends Iri<string>,
	EntityBody extends object,
	Entity extends object
> = {
	create: (body: EntityBody) => Promise<Response<Item<Entity, EntityIri>>>;
	get: {
		(iriOrId: EntityIri | number): Promise<Response<Item<Entity, EntityIri>>>;
		<P extends PropertyPath<Item<Entity, EntityIri>>[]>(
			iriOrId: EntityIri | number,
			getOptions: GetOptions<Item<Entity, EntityIri>, P>
		): Promise<Response<PropertyValue<Item<Entity, EntityIri>, P[number]>>>;
	};
	getAll: {
		(): Promise<Response<Collection<Entity, EntityIri>>>;
		<P extends PropertyPath<Collection<Entity, EntityIri>>[]>(
			getOptions: GetOptions<Collection<Entity, EntityIri>, P>
		): Promise<
			Response<PropertyValue<Collection<Entity, EntityIri>, P[number]>>
		>;
	};
	update: {
		(body: ObjectWithId<Partial<EntityBody>, EntityIri>): Promise<
			Response<Item<Entity, EntityIri>>
		>;
		(idOrIri: EntityIri | number, body: Partial<EntityBody>): Promise<
			Response<Item<Entity, EntityIri>>
		>;
	};
	replace: {
		(body: ObjectWithId<EntityBody, EntityIri>): Promise<
			Response<Item<Entity, EntityIri>>
		>;
		(idOrIri: EntityIri | number, body: EntityBody): Promise<
			Response<Item<Entity, EntityIri>>
		>;
	};
	delete: (idOrIri: EntityIri | number) => Promise<Response<null>>;
};

const entityServiceBuilder = <
	EntityIri extends Iri<string>,
	EntityBody extends object,
	Entity extends object
>(
	fetchOptions:
		| string
		| {
				entrypoint: Parameters<typeof fetchBuilder>[0];
				config?: Parameters<typeof fetchBuilder>[1];
		  }
		| ReturnType<typeof fetchBuilder>,
	entityPath: string
): EntityService<EntityIri, EntityBody, Entity> => {
	const fetcher =
		typeof fetchOptions === "string"
			? fetchBuilder(fetchOptions)
			: "entrypoint" in fetchOptions
			? fetchBuilder(fetchOptions.entrypoint, fetchOptions.config)
			: fetchOptions;

	const parseIri = (iriOrId: EntityIri | number) =>
		typeof iriOrId === "number" ? `${entityPath}/${iriOrId}` : iriOrId;

	const create = (body: EntityBody) =>
		fetcher.post<Item<Entity, EntityIri>, EntityBody>(entityPath).fetch(body);

	const get = <P extends PropertyPath<Item<Entity, EntityIri>>[]>(
		iriOrId: EntityIri | number,
		getOptions?: GetOptions<Item<Entity, EntityIri>, P>
	) => {
		const get = fetcher.get<Item<Entity, EntityIri>>(parseIri(iriOrId));

		return getOptions ? get.withOptions(getOptions).fetch() : get.fetch();
	};

	const getAll = <P extends PropertyPath<Collection<Entity, EntityIri>>[]>(
		getOptions?: GetOptions<Collection<Entity, EntityIri>, P>
	) => {
		const get = fetcher.get<Collection<Entity, EntityIri>>(entityPath);

		return getOptions ? get.withOptions(getOptions).fetch() : get.fetch();
	};

	const update: {
		(body: ObjectWithId<Partial<EntityBody>, EntityIri>): Promise<
			Response<Item<Entity, EntityIri>>
		>;
		(idOrIri: EntityIri | number, body: Partial<EntityBody>): Promise<
			Response<Item<Entity, EntityIri>>
		>;
	} = (
		idOrIriOrBody:
			| ObjectWithId<Partial<EntityBody>, EntityIri>
			| string
			| number
			| EntityIri,
		maybeBody?: Partial<EntityBody>
	): Promise<Response<Item<Entity, EntityIri>>> => {
		const iri =
			typeof idOrIriOrBody === "object"
				? idOrIriOrBody["@id"] || idOrIriOrBody.id
				: idOrIriOrBody;
		const body = typeof idOrIriOrBody === "object" ? idOrIriOrBody : maybeBody!;

		return fetcher
			.patch<Item<Entity, EntityIri>, Partial<EntityBody>>(
				parseIri(iri as EntityIri | number)
			)
			.fetch(body);
	};

	const replace: {
		(body: ObjectWithId<EntityBody, EntityIri>): Promise<
			Response<Item<Entity, EntityIri>>
		>;
		(idOrIri: EntityIri | number, body: EntityBody): Promise<
			Response<Item<Entity, EntityIri>>
		>;
	} = (
		idOrIriOrBody: ObjectWithId<EntityBody, EntityIri> | EntityIri | number,
		maybeBody?: EntityBody
	): Promise<Response<Item<Entity, EntityIri>>> => {
		const iri =
			typeof idOrIriOrBody === "object"
				? (idOrIriOrBody["@id"] || idOrIriOrBody.id)!
				: idOrIriOrBody;
		const body = typeof idOrIriOrBody === "object" ? idOrIriOrBody : maybeBody!;

		return fetcher
			.put<Item<Entity, EntityIri>, EntityBody>(parseIri(iri))
			.fetch(body);
	};

	const del = (idOrIri: EntityIri | number) =>
		fetcher.delete(parseIri(idOrIri)).fetch();

	return {
		create,
		get: get as EntityService<EntityIri, EntityBody, Entity>["get"],
		getAll: getAll as EntityService<EntityIri, EntityBody, Entity>["getAll"],
		update,
		replace,
		delete: del,
	};
};

export default entityServiceBuilder;
