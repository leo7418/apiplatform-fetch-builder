import type { AnyIri } from "./iri.ts";

type HydraItem<I extends AnyIri> = {
	"@context": string;
	"@id": I;
	"@type": string;
};

export type Item<T, I extends AnyIri> = HydraItem<I> & T;

export type GetItem<I> =
	I extends Item<infer T, infer U> ? Omit<T, keyof HydraItem<U>> : never;

export type SafeGetItem<T> = GetItem<T> extends never ? T : GetItem<T>;
