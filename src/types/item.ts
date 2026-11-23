import type { Merged } from "./internal.ts";
import type { AnyIri } from "./iri.ts";

type HydraNode<I extends AnyIri> = {
	"@id": I;
	"@type": string;
};

type HydraItem<I extends AnyIri> = HydraNode<I> & { "@context": string };

export type Item<T, I extends AnyIri> = Merged<HydraItem<I> & T>;

export type Embedded<T, I extends AnyIri> = Merged<HydraNode<I> & T>;

export type GetItem<T> =
	T extends HydraNode<AnyIri> ? Omit<T, keyof HydraItem<AnyIri>> : never;

export type SafeGetItem<T> = GetItem<T> extends never ? T : GetItem<T>;
