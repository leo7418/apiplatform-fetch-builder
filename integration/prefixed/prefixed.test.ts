import assert from "node:assert/strict";
import { describe, test } from "node:test";

import { ApiError, isHydraError } from "../../src/index.ts";
import { hydraPrefix, tasks, users } from "../tests/api.ts";

// This program declares the prefixed format, which only API Platform 3 returns.
describe("prefixed types", { skip: !hydraPrefix }, () => {
	test("should type the keys of a collection with their prefix", async () => {
		const page = await users.getAll({ pageSize: 5 });

		assert.equal(page["hydra:member"].length, 5);
		assert.equal(page["hydra:totalItems"], 25);
		assert.equal(typeof page["hydra:view"]?.["hydra:next"], "string");
		// @ts-expect-error the unprefixed key is not declared in this program
		assert.equal(page.member, undefined);
	});

	test("should type the pages read at once with their prefix", async () => {
		const all = await users.getAllPages({ pageSize: 10 });

		assert.equal(all["hydra:member"].length, 25);
		assert.equal(all["hydra:totalItems"], 25);
	});

	test("should type the title of an error with its prefix", async () => {
		const error = await tasks.create({}).catch((reason: unknown) => reason);

		assert.ok(error instanceof ApiError && isHydraError(error.body));
		assert.equal(typeof error.body["hydra:title"], "string");
	});
});
