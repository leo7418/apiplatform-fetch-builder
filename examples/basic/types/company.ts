import type { Collection, Item, Iri } from "apiplatform-fetch-builder";

import type { UserItem } from "./user";

type CompanyIri = Iri<"companies">;

type CompanyBody = {
	id: string;
	name: string;
	description: string;
};

type Company = CompanyBody & {
	employees: UserItem[];
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
