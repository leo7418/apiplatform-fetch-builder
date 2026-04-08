import type { Error } from "./error.ts";

export type ResponseSuccess<D = unknown> = {
	success: true;
	data: D;
};

export type ResponseError<S extends number = number> = {
	success: false;
	error: Error<S>;
};

export type Response<D = unknown, S extends number = number> =
	| ResponseSuccess<D>
	| ResponseError<S>;
