import type { AnyIri } from "./iri.ts";

type HydraNode<I extends AnyIri> = {
	"@id": I;
	"@type": string;
};

type HydraItem<I extends AnyIri> = HydraNode<I> & { "@context": string };

export type Item<T, I extends AnyIri> = HydraItem<I> & T;

export type Embedded<T, I extends AnyIri> = HydraNode<I> & T;

export type GetItem<I> =
	I extends Embedded<infer T, infer U> ? Omit<T, keyof HydraItem<U>> : never;

export type SafeGetItem<T> = GetItem<T> extends never ? T : GetItem<T>;
