import type { SafeGetCollectionItem } from "./collection.ts";
import type { IsAny, Leaf, SecureType, Simplify } from "./internal.ts";
import type { SafeGetItem } from "./item.ts";

type Prev = [never, 0, 1, 2, 3, 4, 5];

type Dotted<K, Path> = K extends string | number
	? Path extends string | number
		? `${K}.${Path}`
		: never
	: never;

type NestedPathOf<T, Depth extends number = 3> = [Depth] extends [never]
	? never
	: IsAny<T> extends true
		? never
		: T extends Leaf
			? never
			: T extends readonly (infer U)[]
				? NestedPathOf<U, Depth>
				: T extends object
					? {
							[K in keyof SafeGetItem<T>]-?:
								| K
								| Dotted<K, NestedPathOf<SafeGetItem<T>[K], Prev[Depth]>>;
						}[keyof SafeGetItem<T>]
					: never;

type SafeRoot<T> = T extends readonly (infer U)[]
	? U
	: SafeGetCollectionItem<T>;

export type PropertyPath<T> = SecureType<
	Simplify<NestedPathOf<SafeRoot<T>>>,
	string
>;
