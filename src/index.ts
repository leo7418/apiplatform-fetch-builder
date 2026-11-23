import fetchBuilder from "./lib/fetch-builder.ts";
import entityServiceBuilder from "./lib/entity-service-builder.ts";
import { ApiError, isHydraError } from "./lib/api-error.ts";
export type * from "./types/body.ts";
export type * from "./types/collection.ts";
export type * from "./types/error.ts";
export type * from "./types/item.ts";
export type * from "./types/iri.ts";
export type * from "./types/property-path.ts";
export type * from "./types/property-value.ts";
export type * from "./types/register.ts";
export type * from "./types/utils.ts";
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
