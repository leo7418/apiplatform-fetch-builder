import type { Collection, Item, Iri } from "apiplatform-fetch-builder";

import type { CompanyIri, CompanyItem } from "./company.ts";

type UserIri = Iri<"users">;

type User = {
	readonly id: number;
	email: string;
	firstName: string;
	lastName: string;
	age?: number;
	company?: CompanyIri | CompanyItem;
	readonly fullName: string;
};

type UserItem = Item<User, UserIri>;
type UserCollection = Collection<User, UserIri>;

export type { UserIri, User, UserItem, UserCollection };
