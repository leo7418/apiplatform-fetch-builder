import fetchBuilder from "./lib/fetch-builder.ts";
import entityServiceBuilder from "./lib/entity-service-builder.ts";
export type * from "./types/collection.ts";
export type * from "./types/error.ts";
export type * from "./types/item.ts";
export type * from "./types/iri.ts";
export type * from "./types/property-path.ts";
export type * from "./types/property-value.ts";
export type * from "./types/response.ts";
export type * from "./types/utils.ts";
export type {
	BuilderConfig,
	FetchOptions,
	GetOptions,
} from "./lib/fetch-builder.ts";
export type {
	GetAllPagesProgress,
	OnProgress,
} from "./lib/entity-service-builder.ts";

export default fetchBuilder;
export { entityServiceBuilder };
