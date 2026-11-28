export type IsAny<T> = 0 extends 1 & T ? true : false;

export type Leaf =
	| string
	| number
	| boolean
	| bigint
	| symbol
	| null
	| undefined
	| Date
	| ((...args: never[]) => unknown);

export type Head<T extends string> = T extends `${infer First}.${string}`
	? First
	: T;

export type Tail<T extends string> = T extends `${string}.${infer Rest}`
	? Rest
	: never;

export type Simplify<T> = T extends Leaf
	? T
	: T extends object
		? { [K in keyof T]: Simplify<T[K]> }
		: T;

// "& {}" makes editors show the properties instead of the name of the alias
export type Merged<T> =
	IsAny<T> extends true ? T : { [K in keyof T]: T[K] } & {};

export type IsEmptyObject<T> = keyof T extends never ? true : false;

export type UnionToIntersection<U> = (
	U extends unknown ? (k: U) => void : never
) extends (k: infer I) => void
	? I
	: never;

export type SecureType<T, O> = T extends O ? T : never;
