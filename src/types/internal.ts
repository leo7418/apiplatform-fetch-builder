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
