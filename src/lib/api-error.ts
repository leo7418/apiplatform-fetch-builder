import { isObject } from "./utils.ts";
import type { HydraError } from "../types/error.ts";

export class ApiError extends Error {
	readonly status: number;
	/** Parsed JSON body of the error response, or its raw text when it is not JSON. */
	readonly body: unknown;

	constructor(status: number, body: unknown) {
		super(`Request failed with status ${status}`);
		this.name = "ApiError";
		this.status = status;
		this.body = body;
	}
}

export const isHydraError = (body: unknown): body is HydraError =>
	isObject(body) &&
	"@type" in body &&
	typeof body["@type"] === "string" &&
	"title" in body &&
	typeof body.title === "string";
