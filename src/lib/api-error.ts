import { isObject } from "./utils.ts";
import type { HydraError } from "../types/error.ts";

export class ApiError extends Error {
	readonly status: number;
	/** Parsed JSON body of the error response, or its raw text when it is not JSON. */
	readonly body: unknown;
	/** Headers of the error response; empty when the error does not come from a response. */
	readonly headers: Headers;

	constructor(
		status: number,
		body: unknown,
		options: { message?: string; cause?: unknown; headers?: Headers } = {},
	) {
		super(options.message ?? `Request failed with status ${status}`, options);
		this.name = "ApiError";
		this.status = status;
		this.body = body;
		this.headers = options.headers ?? new Headers();
	}
}

export const isHydraError = (body: unknown): body is HydraError =>
	isObject(body) &&
	"@type" in body &&
	typeof body["@type"] === "string" &&
	(("title" in body && typeof body.title === "string") ||
		("hydra:title" in body && typeof body["hydra:title"] === "string"));
