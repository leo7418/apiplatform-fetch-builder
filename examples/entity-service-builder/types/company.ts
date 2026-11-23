import type { Collection, Item, Iri } from "apiplatform-fetch-builder";

import type { UserIri, UserItem } from "./user.ts";

type CompanyIri = Iri<"companies">;

type Company = {
	readonly id: number;
	name: string;
	description: string;
	website?: string;
	ceo: UserItem | UserIri;
	employees: (UserItem | UserIri)[];
	readonly stats: {
		employeesCount: number;
		averageAge: number;
	};
};

type CompanyItem = Item<Company, CompanyIri>;
type CompanyCollection = Collection<Company, CompanyIri>;

export type { CompanyIri, Company, CompanyItem, CompanyCollection };
