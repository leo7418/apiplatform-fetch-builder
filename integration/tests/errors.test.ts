import { test, describe } from "node:test";
import assert from "node:assert/strict";

import { ApiError, isHydraError } from "../../src/index.ts";

import { hydraPrefix, tasks, unprefixed, users } from "./api.ts";

describe("errors", () => {
	test("should reject with the status and the body of a 404", async () => {
		await assert.rejects(
			() => users.get(999),
			(error) => {
				assert.ok(error instanceof ApiError);
				assert.equal(error.status, 404);
				assert.ok(isHydraError(error.body));
				assert.equal(unprefixed(error.body).title, "An error occurred");
				assert.equal(unprefixed(error.body).description, "Not Found");
				return true;
			},
		);
	});

	test("should recognise an error of API Platform 3.4, which only carries the prefixed title", async () => {
		await assert.rejects(
			() => users.get(999),
			(error) => {
				assert.ok(error instanceof ApiError);
				assert.ok(isHydraError(error.body));
				assert.equal("title" in error.body, !hydraPrefix);
				return true;
			},
		);
	});

	test("should give the violations of a validation error", async () => {
		await assert.rejects(
			() => tasks.create({ note: "Without the title the API requires" }),
			(error) => {
				assert.ok(error instanceof ApiError);
				assert.equal(error.status, 422);
				assert.ok(isHydraError(error.body));
				assert.deepEqual(error.body.violations, [
					{
						propertyPath: "title",
						message: "This value should not be blank.",
						code: "c1051bb4-d103-4f74-8988-acbcafc7fdc3",
					},
				]);
				return true;
			},
		);
	});
});
