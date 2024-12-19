export type ID = number | string;

export type Primitive =
	| string
	| number
	| boolean
	| bigint
	| symbol
	| null
	| undefined;

export type ArrayElement<ArrayType extends readonly unknown[]> =
	ArrayType extends readonly (infer ElementType)[] ? ElementType : never;

export type Join<P1, P2> = P1 extends string | number
	? P2 extends string | number
		? `${P1}${"" extends P2 ? "" : "."}${P2}`
		: never
	: never;

export type Head<T extends string> = T extends `${infer First}.${string}`
	? First
	: T;

export type Tail<T extends string> = T extends `${string}.${infer Rest}`
	? Rest
	: never;

export type Split<
	S extends string,
	D extends string = "."
> = S extends `${infer First}${D}${infer Rest}`
	? [First, ...Split<Rest, D>]
	: [S];

export type Simplify<T> = T extends object
	? { [K in keyof T]: Simplify<T[K]> }
	: T;

export type IsEmptyObject<T> = keyof T extends never ? true : false;

export type UnionToIntersection<U> = (
	U extends unknown ? (k: U) => void : never
) extends (k: infer I) => void
	? I
	: never;

type Prev = [never, 0, 1, 2, 3, 4, 5];
export type NestedKeyOf<T, Depth extends number = 5> = Depth extends never
	? never
	: T extends object
	? {
			[K in keyof T]-?:
				| K
				| (T[K] extends Array<infer U>
						? Join<K, NestedKeyOf<U, Prev[Depth]>>
						: Join<K, NestedKeyOf<T[K], Prev[Depth]>>);
	  }[keyof T]
	: never;

export type DeepPick<T, K extends string> = T extends object
	? NonNullable<T> extends readonly unknown[]
		? DeepPick<NonNullable<T>[number], K>[] | Exclude<T, NonNullable<T>>
		: {
				[P in Head<K> & keyof T]: DeepPick<
					T[P],
					Tail<Extract<K, `${P}.${string}`>>
				>;
		  }
	: T;

export type DeepPartial<T> = T extends object
	? {
			[P in keyof T]?: DeepPartial<T[P]>;
	  }
	: T;

export type SecureType<T, O> = T extends O ? T : never;

export type MakeOptional<T, K extends PropertyKey> = Simplify<
	{
		[P in keyof T as P extends K ? P : never]?: T[P];
	} & {
		[P in keyof T as P extends K ? never : P]: T[P];
	}
>;

export type MakeRequired<T, K extends PropertyKey> = Simplify<
	{
		[P in keyof T as Exclude<P, K>]: T[P];
	} & {
		[P in keyof T as P extends K ? P : never]-?: Exclude<T[P], undefined>;
	}
>;

type OptionalToNull<T> = Simplify<
	{
		[P in keyof T as object extends Pick<T, P>
			? P
			: never]?: T[P] extends object
			? T[P] extends Array<unknown>
				? Array<OptionalToNull<T[P][number]>>
				: OptionalToNull<T[P]>
			: T[P] | null;
	} & {
		[P in keyof T as object extends Pick<T, P> ? never : P]: T[P] extends object
			? T[P] extends Array<unknown>
				? Array<OptionalToNull<T[P][number]>>
				: OptionalToNull<T[P]>
			: T[P];
	}
>;

export type PostItem<T> = Simplify<OptionalToNull<T>>;

export type PatchItem<T, Id extends keyof T> = Simplify<
	MakeRequired<DeepPartial<OptionalToNull<T>>, Id>
>;

export type PostPatchItem<T, Id extends keyof T> =
	| PostItem<Omit<T, Id>>
	| PatchItem<T, Id>;
