import type { Collection, Item, Iri } from "apiplatform-fetch-builder";

import type { CompanyIri, CompanyItem } from "./company";

type UserIri = Iri<"users">;

type UserBody = {
	id: string;
	email: string;
	firstName: string;
	lastName: string;
	age?: number;
	company?: CompanyIri | CompanyItem;
};

type User = UserBody & {
	fullName: string;
};

type UserItem = Item<User, UserIri>;
type UserCollection = Collection<User, UserIri>;

export type { UserIri, UserBody, User, UserItem, UserCollection };
