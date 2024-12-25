import type { Collection, Item, Iri } from "apiplatform-fetch-builder";

import type { UserIri, UserItem } from "./user.ts";

type CompanyIri = Iri<"companies">;

type CompanyBody = {
	name: string;
	description: string;
};

type Company = CompanyBody & {
	id: string;
	ceo: UserItem | UserIri;
	employees: (UserItem | UserIri)[];
	stats: {
		employeesCount: number;
		averageAge: number;
	};
};

type CompanyItem = Item<Company, CompanyIri>;
type CompanyCollection = Collection<Company, CompanyIri>;

export type {
	CompanyIri,
	CompanyBody,
	Company,
	CompanyItem,
	CompanyCollection,
};
