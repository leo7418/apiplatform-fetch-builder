import type { Error } from "./error.ts";

type ResponseSuccess<D = unknown> = {
	success: true;
	data: D;
};

type ResponseError<S extends number = number> = {
	success: false;
	error: Error<S>;
};

type Response<D = unknown> = ResponseSuccess<D> | ResponseError;

export type { ResponseSuccess, ResponseError, Response };
