import type { Iri } from "./iri.ts";

type HydraItem<I extends Iri<string>> = {
	"@context": string;
	"@id": I;
	"@type": string;
};

type Item<T, I extends Iri<string>> = HydraItem<I> & T;

export type GetItem<I> = I extends Item<infer T, infer U>
	? Omit<T, keyof HydraItem<U>>
	: never;

export type SafeGetItem<T> = GetItem<T> extends never ? T : GetItem<T>;

export type { Item };
