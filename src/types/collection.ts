import type { Iri } from "./iri.ts";
import type { Item } from "./item.ts";

type Collection<T, I extends Iri<string>> = {
	"@context": string;
	"@id": string;
	"@type": "hydra:Collection";
	"hydra:member": Item<T, I>[];
	"hydra:totalItems": number;
	"hydra:view"?: {
		"@id": string;
		"@type": "hydra:PartialCollectionView";
		"hydra:first"?: string;
		"hydra:last"?: string;
		"hydra:next"?: string;
		"hydra:previous"?: string;
	};
};

export type GetCollectionItem<C> = C extends Collection<infer T, infer I>
	? Item<T, I>
	: never;

export type SafeGetCollectionItem<T> = GetCollectionItem<T> extends never
	? T
	: GetCollectionItem<T>;

export type { Collection };
