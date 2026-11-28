import fetchBuilder, { entityServiceBuilder } from "apiplatform-fetch-builder";
import type { Collection, Item } from "apiplatform-fetch-builder";

import type {
	Company,
	CompanyIri,
	Task,
	TaskIri,
	TaskList,
	User,
	UserIri,
} from "./api-types.ts";

// api-types.ts is written by: apiplatform-fetch-builder generate https://your-api.com/api .
const api = fetchBuilder("https://your-api.com/api");

// An item, with a property of each user of its to-many relation
const company = await api
	.get<Item<Company, CompanyIri>>("/companies/1")
	.withQuery({ properties: ["name", "users.name"] })
	.fetch();

console.log(
	company.name,
	company.users.map((user) => user.name),
);

// A collection, with a property of the company of each user
const page = await api
	.get<Collection<User, UserIri>>("/users")
	.withQuery({ pageSize: 10, properties: ["name", "company.name"] })
	.fetch();

console.log(
	page.totalItems,
	page.member.map((user) => `${user.name}: ${user.company?.name}`),
);

// The same resource through a service
const users = entityServiceBuilder<UserIri, User>(api, "/users");

const user = await users.create({
	name: "Ada",
	email: "ada@example.com",
	company: company["@id"],
});

console.log(user.id);

// A resource whose collection is serialized with less than its items
const tasks = entityServiceBuilder<TaskIri, Task, { collection: TaskList }>(
	api,
	"/tasks",
);

const listed = await tasks.getAll({ pageSize: 10 });
const [first] = listed.member;
const task = first && (await tasks.get(first.id));

console.log(
	listed.member.map(({ title }) => title),
	task?.note,
);
