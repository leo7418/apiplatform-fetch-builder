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
