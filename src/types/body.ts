import type { Leaf } from "./internal.ts";
import type { AnyIri, GetIri } from "./iri.ts";

type IfEquals<X, Y, A, B> =
	(<T>() => T extends X ? 1 : 2) extends <T>() => T extends Y ? 1 : 2 ? A : B;

type SentKey<T, K extends keyof T> = K extends `@${string}`
	? never
	: IfEquals<{ [Q in K]: T[K] }, { -readonly [Q in K]: T[K] }, K, never>;

type IsNullable<V> = undefined extends V ? true : null extends V ? true : false;

type Keyword<K> = K extends "@id" ? never : K extends `@${string}` ? K : never;

type Relation<T, Whole, I> =
	| I
	| { "@id": I; "@type"?: string }
	| (Fields<T, Whole, true> & { "@id"?: I | undefined });

type SentValue<T, Whole, Declared> = T extends Leaf
	? T
	: T extends readonly unknown[]
		? number extends T["length"]
			? readonly Sent<T[number], Whole>[]
			: { readonly [I in keyof T]: Sent<T[I], Whole> }
		: T extends { "@id": infer I }
			? Relation<T, Whole, I>
			: T extends object
				? [Declared] extends [never]
					?
							| AnyIri
							| { "@id": AnyIri; "@type"?: string }
							| (Fields<T, Whole, true> & object)
					: Relation<T, Whole, Declared>
				: T;

type Sent<T, Whole> = SentValue<T, Whole, GetIri<T>>;

type Written<V, Whole> = unknown extends V
	? V
	: IsNullable<V> extends true
		? Sent<NonNullable<V>, Whole> | null
		: Sent<V, Whole>;

type Flatten<T> = T extends infer O ? { [K in keyof O]: O[K] } : never;

type Fields<T, Whole, Nested> = Flatten<
	{
		[K in keyof T as [Whole, IsNullable<T[K]>] extends [true, false]
			? SentKey<T, K>
			: never]-?: Written<T[K], Whole>;
	} & {
		[K in keyof T as [Whole, IsNullable<T[K]>] extends [true, false]
			? never
			: SentKey<T, K>]?: Written<T[K], Whole> | undefined;
	} & {
		[K in keyof T as Nested extends true ? Keyword<K> : never]?:
			| T[K]
			| undefined;
	}
>;

/** Body of a `POST` or a `PATCH`: every property optional, no `readonly` property, a relation as its IRI or as an object. */
export type WriteBody<T> = T extends readonly (infer U)[]
	? readonly WriteBody<U>[]
	: T extends unknown
		? Fields<T, false, false>
		: never;

/** Body of a `PUT`: a `WriteBody` where every property that is not nullable is required. */
export type ReplaceBody<T> = T extends readonly (infer U)[]
	? readonly ReplaceBody<U>[]
	: T extends unknown
		? Fields<T, true, false>
		: never;
