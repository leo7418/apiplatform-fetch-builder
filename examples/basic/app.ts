import fetchBuilder from "apiplatform-fetch-builder";

import type { CompanyCollection, CompanyItem } from "./types/company.ts";

const fetcher = fetchBuilder("https://your-api.com");

const companiesResult = await fetcher
	.get<CompanyCollection>("/companies")
	.withOptions({
		pagination: true,
		pageIndex: 1,
		pageSize: 10,
		sortBy: [{ id: "name", desc: false }],
		properties: [
			"name",
			"description",
			"stats",
			"ceo",
			"employees.id",
			"employees.email",
			"employees.fullName",
		],
	})
	.fetch();

if (companiesResult.success) {
	const companies = companiesResult.data["hydra:member"];

	console.log(companies);
} else {
	console.error(companiesResult.error);
}

const companyResult = await fetcher.get<CompanyItem>("/companies/1").fetch();

if (companyResult.success) {
	const company = companyResult.data;

	console.log(company);
} else {
	console.error(companyResult.error);
}
