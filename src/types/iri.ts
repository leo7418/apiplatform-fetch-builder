type Iri<I extends string> = `/${I}/${number}`;

export type GetIri<I> = I extends `/${infer S}/${infer N}`
	? S extends string
		? N extends `${number}`
			? I
			: never
		: never
	: never;

export type { Iri };
