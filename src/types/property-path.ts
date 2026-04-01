import type { GetCollectionItem, SafeGetCollectionItem } from "./collection.ts";
import type { GetItem, SafeGetItem } from "./item.ts";
import type { Simplify, Join, SecureType } from "./utils.ts";

type Prev = [never, 0, 1, 2, 3, 4, 5];

type IsHydra<T> =
	GetItem<T> extends never
		? GetCollectionItem<T> extends never
			? false
			: true
		: true;

type HydraNestedKeyOfInner<T, Depth extends number, I> = [Depth] extends [never]
	? never
	: T extends object
		? IsHydra<T> extends true
			? {
					[K in keyof I]-?:
						| K
						| (I[K] extends Array<infer U>
								? Join<K, HydraNestedKeyOf<U, Prev[Depth]>>
								: Join<K, HydraNestedKeyOf<I[K], Prev[Depth]>>);
				}[keyof I]
			: never
		: never;

type HydraNestedKeyOf<T, Depth extends number = 3> = HydraNestedKeyOfInner<
	T,
	Depth,
	SafeGetItem<T>
>;

type SafeRoot<T> = T extends Array<infer U> ? U : SafeGetCollectionItem<T>;

type PropertyPath<T> = SecureType<
	Simplify<HydraNestedKeyOf<SafeRoot<T>>>,
	string
>;

export type { PropertyPath };
