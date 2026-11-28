import assert from "node:assert/strict";

import fetchBuilder, { entityServiceBuilder } from "../../src/index.ts";
import type { Embedded, Iri } from "../../src/index.ts";

const { API_URL, API_PLATFORM_VERSION } = process.env;
assert.ok(
	API_URL && API_PLATFORM_VERSION,
	"Run the suite with integration/run.sh",
);

// API Platform 3.4 prefixes the keys of its collections and errors with "hydra:"
export const hydraPrefix = API_PLATFORM_VERSION.startsWith("3.");

/** Renames the prefixed keys of a response, so that an assertion reads both formats. */
export const unprefixed = <T extends object>(body: T): T =>
	Object.fromEntries(
		Object.entries(body).map(([key, value]) => [
			key.replace(/^hydra:/, ""),
			value,
		]),
	) as T;

export type CompanyIri = Iri<"api/companies">;
export type Company = { readonly id: number; name: string };

export type UserIri = Iri<"api/users">;
export type User = {
	readonly id: number;
	name: string;
	email: string;
	company?: Embedded<Company, CompanyIri> | CompanyIri;
};

export type TaskIri = Iri<"api/tasks">;
export type Task = {
	readonly id: number;
	title: string;
	status: string;
	note?: string;
	assignee?: Embedded<User, UserIri> | UserIri;
};

export const api = fetchBuilder(API_URL);
export const users = entityServiceBuilder<UserIri, User>(api, "/users");
export type TaskList = { readonly id: number; title: string; status: string };

export const tasks = entityServiceBuilder<
	TaskIri,
	Task,
	{ collection: TaskList }
>(api, "/tasks");
