import type { AnyIri, Iri } from "./iri.ts";
import type { Embedded, Item } from "./item.ts";
import type { HydraKeys, HydraPrefix } from "./register.ts";

type WithoutContext<T> = T extends { "@context": unknown }
	? Omit<T, "@context">
	: T;

export type PartialCollection<T, I extends AnyIri = Iri<string>> = {
	"@context": string;
	"@id": string;
	"@type": `${HydraPrefix}Collection`;
} & HydraKeys<{
	member: Embedded<WithoutContext<T>, I>[];
	view?: {
		"@id": string;
		"@type": `${HydraPrefix}PartialCollectionView`;
	} & HydraKeys<{
		first?: string;
		last?: string;
		next?: string;
		previous?: string;
	}>;
	search?: {
		"@type": `${HydraPrefix}IriTemplate`;
	} & HydraKeys<{
		template: string;
		variableRepresentation: string;
		mapping: {
			"@type": "IriTemplateMapping";
			variable: string;
			property: string | null;
			required: boolean;
		}[];
	}>;
}>;

export type Collection<T, I extends AnyIri = Iri<string>> = PartialCollection<
	T,
	I
> &
	HydraKeys<{ totalItems: number }>;

export type GetCollectionItem<C> =
	C extends PartialCollection<infer T, infer I> ? Item<T, I> : never;

export type SafeGetCollectionItem<T> =
	GetCollectionItem<T> extends never ? T : GetCollectionItem<T>;
