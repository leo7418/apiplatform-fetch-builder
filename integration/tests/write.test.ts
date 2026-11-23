import { test, describe } from "node:test";
import assert from "node:assert/strict";

import { tasks } from "./api.ts";

// Each test only writes the tasks it creates: the other files read the users while this one runs.
describe("writing a resource", () => {
	test("should create a resource and let the API fill what is left out", async () => {
		const created = await tasks.create({ title: "Created" });

		assert.deepEqual(created, {
			"@context": "/api/contexts/Task",
			"@id": `/api/tasks/${created.id}`,
			"@type": "Task",
			id: created.id,
			title: "Created",
			status: "todo",
		});
	});

	test("should update the given properties only", async () => {
		const { id } = await tasks.create({ title: "Updated", note: "Kept" });

		const updated = await tasks.update(id, { status: "done" });

		assert.equal(updated.status, "done");
		assert.equal(updated.title, "Updated");
		assert.equal(updated.note, "Kept");
	});

	test("should clear a nullable property with null", async () => {
		const created = await tasks.create({ title: "Cleared", note: "Removed" });

		const updated = await tasks.update(created["@id"], { note: null });

		assert.equal("note" in updated, false);
	});

	test("should send an item back with its embedded relation as an IRI", async (t) => {
		const { id } = await tasks.create({
			title: "Read",
			assignee: "/api/users/1",
		});
		const task = await tasks.get(id, {
			properties: ["title", "assignee.name"],
		});
		assert.deepEqual(task.assignee, {
			"@id": "/api/users/1",
			"@type": "User",
			name: "User 01",
		});
		const fetchMock = t.mock.method(globalThis, "fetch");

		const updated = await tasks.update({ ...task, title: "Sent back" });

		assert.deepEqual(
			JSON.parse(fetchMock.mock.calls[0].arguments[1]?.body as string),
			{ title: "Sent back", assignee: "/api/users/1" },
		);
		assert.equal(updated.title, "Sent back");
		assert.equal(updated.assignee, "/api/users/1");
	});

	test("should replace a resource, which resets what the body leaves out", async () => {
		const { id } = await tasks.create({ title: "Created", note: "Reset" });

		const replaced = await tasks.replace(id, {
			title: "Replaced",
			status: "done",
		});

		assert.deepEqual(replaced, {
			"@context": "/api/contexts/Task",
			"@id": `/api/tasks/${id}`,
			"@type": "Task",
			id,
			title: "Replaced",
			status: "done",
		});
	});

	test("upsert: should create a resource without id and update one with @id", async () => {
		const created = await tasks.upsert({ title: "Upserted" });

		const updated = await tasks.upsert({
			"@id": created["@id"],
			status: "done",
		});

		assert.equal(updated["@id"], created["@id"]);
		assert.equal(updated.title, "Upserted");
		assert.equal(updated.status, "done");
	});

	test("should delete a resource", async () => {
		const { id } = await tasks.create({ title: "Deleted" });

		assert.equal(await tasks.delete(id), null);
		await assert.rejects(() => tasks.get(id), { status: 404 });
	});
});
