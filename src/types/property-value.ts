import type { GetIri } from "./iri.ts";
import type { Embedded, Item } from "./item.ts";
import type { PropertyPath } from "./property-path.ts";
import type {
	Collection,
	PartialCollection,
	SafeGetCollectionItem,
} from "./collection.ts";
import type {
	Head,
	IsAny,
	IsEmptyObject,
	Leaf,
	SecureType,
	Simplify,
	Tail,
	UnionToIntersection,
} from "./internal.ts";

type NonEmptyObject<T> = T extends Leaf
	? never
	: T extends object
		? IsEmptyObject<T> extends true
			? never
			: T
		: never;

type OwnIri<T> = T extends { "@id": infer I } ? I : never;

type BackReference<I, Ancestors> = I extends Ancestors ? I : never;

type ItemOrIri<T, Ancestors> =
	IsAny<T> extends true
		? T
		: [GetIri<T>] extends [never]
			? T | BackReference<OwnIri<T>, Ancestors>
			: [NonEmptyObject<T>] extends [never]
				? Exclude<T, object>
				:
						| Embedded<NonEmptyObject<T>, GetIri<T>>
						| Exclude<T, object | GetIri<T>>
						| BackReference<GetIri<T>, Ancestors>;

type Reference<T> = [GetIri<T>] extends [never] ? T : Exclude<T, object>;

type WholeList<T> = T extends readonly (infer U)[] ? Whole<U>[] : never;

type Whole<T> =
	IsAny<T> extends true
		? T
		:
				| WholeList<Extract<T, readonly unknown[]>>
				| Reference<Exclude<T, readonly unknown[]>>;

type RelationIri<T> = GetIri<T extends readonly (infer U)[] ? U : T>;

type DeepPick<
	T,
	K extends string,
	Ancestors = never,
	Parent = never,
	Self = never,
> = ItemOrIri<
	T extends Leaf
		? T
		: T extends readonly (infer DT)[]
			? DeepPick<DT, K, Ancestors, Parent, Self>[]
			: T extends object
				? Pick<T, Extract<keyof T, "@id" | "@type">> & {
						[P in Head<K> & keyof Omit<T, "@id" | "@type" | "@context">]: [
							Tail<Extract<K, `${P}.${string}`>>,
						] extends [never]
							? Whole<T[P & keyof T]>
							: DeepPick<
									T[P & keyof T],
									Tail<Extract<K, `${P}.${string}`>>,
									Ancestors | Parent,
									T extends { "@id": infer I } ? I : Self,
									RelationIri<T[P & keyof T]>
								>;
					}
				: T,
	Ancestors
>;

type KeepHydra<In extends object, Out extends object> =
	In extends Item<unknown, infer I>
		? Item<Out, I>
		: In extends Collection<unknown, infer I>
			? Collection<Out, I>
			: In extends PartialCollection<unknown, infer I>
				? PartialCollection<Out, I>
				: In extends readonly unknown[]
					? Out[]
					: Out;

type SafeRoot<T> = T extends readonly (infer U)[]
	? U
	: SafeGetCollectionItem<T>;

type Selected<Root, P extends string> = Root extends unknown
	? SecureType<UnionToIntersection<DeepPick<Root, P>>, object>
	: never;

export type PropertyValue<T extends object, P extends PropertyPath<T>> = [
	P,
] extends [never]
	? T
	: Simplify<KeepHydra<T, Selected<SafeRoot<T>, P>>>;
