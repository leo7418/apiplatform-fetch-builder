import type { GetIri } from "./iri.ts";
import type { Item, GetItem } from "./item.ts";
import type { PropertyPath } from "./property-path.ts";
import type { Collection, SafeGetCollectionItem } from "./collection.ts";
import type {
	Head,
	IsEmptyObject,
	SecureType,
	Simplify,
	Tail,
	UnionToIntersection,
} from "./utils.ts";

type NonEmptyObject<T> = T extends object
	? IsEmptyObject<T> extends true
		? never
		: T
	: never;

type ItemOrIri<T> = [GetIri<T>] extends [never]
	? T
	: [NonEmptyObject<T>] extends [never]
		? Exclude<T, object>
		: Item<NonEmptyObject<T>, GetIri<T>> | Exclude<T, object | GetIri<T>>;

type DeepPick<T, K extends string> = ItemOrIri<
	T extends object
		? NonNullable<T> extends readonly (infer DT)[]
			? DeepPick<DT, K>[]
			: GetItem<T> extends never
				? T
				: {
						[P in Head<K> &
							keyof Omit<T, "@id" | "@type" | "@context">]: DeepPick<
							T[P & keyof T],
							Tail<Extract<K, `${P}.${string}`>>
						>;
					}
		: T
>;

type KeepHydra<In extends object, Out extends object> =
	In extends Item<unknown, infer I>
		? Item<Out, I>
		: In extends Collection<unknown, infer I>
			? Collection<Out, I>
			: Out;

type SafeRoot<T> = T extends Array<infer U> ? U : SafeGetCollectionItem<T>;

export type PropertyValue<
	T extends object,
	P extends PropertyPath<T>,
> = Simplify<
	KeepHydra<
		T,
		SecureType<UnionToIntersection<DeepPick<SafeRoot<T>, P>>, object>
	>
>;
