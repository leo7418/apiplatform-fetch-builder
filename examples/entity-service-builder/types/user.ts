import type { Collection, Item, Iri } from "apiplatform-fetch-builder";

import type { CompanyIri, CompanyItem } from "./company.ts";

type UserIri = Iri<"users">;

type UserBody = {
	email: string;
	firstName: string;
	lastName: string;
	age?: number;
	company?: CompanyIri | CompanyItem;
};

type User = UserBody & {
	id: string;
	fullName: string;
};

type UserItem = Item<User, UserIri>;
type UserCollection = Collection<User, UserIri>;

export type { UserIri, UserBody, User, UserItem, UserCollection };
