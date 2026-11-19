export type Iri<
	I extends string,
	Id extends string | number = number,
> = `/${I}/${Id}`;

export type AnyIri = Iri<string, string | number>;

export type GetIri<I> = I extends `/${string}/${string}` ? I : never;

export type IriId<I extends string> = I extends `${string}/${infer Rest}`
	? IriId<Rest>
	: I extends `${infer N extends number}`
		? N
		: I;
