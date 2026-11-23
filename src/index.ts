import fetchBuilder from "./lib/fetch-builder.ts";
import entityServiceBuilder from "./lib/entity-service-builder.ts";
import { ApiError, isHydraError } from "./lib/api-error.ts";
export type { ReplaceBody, WriteBody } from "./types/body.ts";
export type { Collection, PartialCollection } from "./types/collection.ts";
export type { HydraError } from "./types/error.ts";
export type { Embedded, Item } from "./types/item.ts";
export type { AbsoluteIri, AnyIri, Iri, IriId } from "./types/iri.ts";
export type { PropertyPath } from "./types/property-path.ts";
export type { PropertyValue } from "./types/property-value.ts";
export type { Register } from "./types/register.ts";
export type {
	BodyBuilder,
	BuilderConfig,
	DeleteBuilder,
	Fetcher,
	FetchOptions,
	GetBuilder,
	MutationBuilder,
	QueryOptions,
	SelectionBuilder,
} from "./lib/fetch-builder.ts";
export type {
	EntityService,
	EntityServiceOptions,
	GetAllPagesProgress,
	OnProgress,
} from "./lib/entity-service-builder.ts";

export default fetchBuilder;
export { entityServiceBuilder, ApiError, isHydraError };
