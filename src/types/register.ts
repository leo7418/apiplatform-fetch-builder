/** Augment with `{ hydraPrefix: true }` when the API keeps the `hydra:` prefix. */
// eslint-disable-next-line @typescript-eslint/no-empty-object-type
export interface Register {}

export type HydraPrefix = Register extends { hydraPrefix: true }
	? "hydra:"
	: "";

export type HydraKeys<T> = {
	[K in keyof T as `${HydraPrefix}${K & string}`]: T[K];
};
