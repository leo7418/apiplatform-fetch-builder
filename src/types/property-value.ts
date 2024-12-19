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

type HaveIri<T> = Exclude<GetIri<T>, never>;
type KeepIri<T> = T extends unknown ? GetIri<T> : never;

type NonEmptyObject<T> = T extends object
	? IsEmptyObject<T> extends true
		? never
		: T
	: never;

type MayBeOptional<I, O> = I extends undefined ? O | undefined : O;

type ItemOrIri<T> = HaveIri<T> extends never
	? T
	: MayBeOptional<
			T,
			NonEmptyObject<T> extends never
				? KeepIri<T>
				: Item<NonEmptyObject<T>, Exclude<GetIri<T>, never>>
	  >;

type DeepPick<T, K extends string> = ItemOrIri<
	T extends object
		? NonNullable<T> extends readonly (infer DT)[]
			? DeepPick<DT, K>[]
			: GetItem<T> extends never
			? T
			: {
					[P in Head<K> & keyof T]: DeepPick<
						T[P],
						Tail<Extract<K, `${P}.${string}`>>
					>;
			  }
		: T
>;

type KeepHydra<In extends object, Out extends object> = In extends Item<
	unknown,
	infer I
>
	? Item<Out, I>
	: In extends Collection<unknown, infer I>
	? Collection<Out, I>
	: Out;

type SafeRoot<T> = T extends Array<infer U> ? U : SafeGetCollectionItem<T>;

type PropertyValue<T extends object, P extends PropertyPath<T>> = Simplify<
	KeepHydra<
		T,
		SecureType<UnionToIntersection<DeepPick<SafeRoot<T>, P>>, object>
	>
>;

export type { PropertyValue };
