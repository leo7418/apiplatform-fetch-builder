import type { Iri } from "./iri.ts";
import type { Item } from "./item.ts";
import type { HydraKeys, HydraPrefix } from "./register.ts";

export type Collection<T, I extends Iri<string> = Iri<string>> = {
	"@context": string;
	"@id": string;
	"@type": `${HydraPrefix}Collection`;
} & HydraKeys<{
	member: Omit<Item<T, I>, "@context">[];
	totalItems: number;
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
		mapping: ({
			"@type": `${HydraPrefix}IriTemplateMapping`;
			required: boolean;
		} & HydraKeys<{
			variable: string;
			property: string | null;
		}>)[];
	}>;
}>;

export type GetCollectionItem<C> =
	C extends Collection<infer T, infer I> ? Item<T, I> : never;

export type SafeGetCollectionItem<T> =
	GetCollectionItem<T> extends never ? T : GetCollectionItem<T>;
