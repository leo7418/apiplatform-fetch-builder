import type { Error } from "./error.ts";

type ResponseSuccess<D = unknown> = {
	success: true;
	data: D;
};

type ResponseError<S extends number = number> = {
	success: false;
	error: Error<S>;
};

type Response<D = unknown, S extends number = number> =
	| ResponseSuccess<D>
	| ResponseError<S>;

export type { ResponseSuccess, ResponseError, Response };
