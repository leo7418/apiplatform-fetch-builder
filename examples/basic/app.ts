import fetchBuilder, { ApiError } from "apiplatform-fetch-builder";

import type { CompanyCollection, CompanyItem } from "./types/company.ts";

const fetcher = fetchBuilder("https://your-api.com");

const companies = await fetcher
	.get<CompanyCollection>("/companies")
	.withQuery({
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

console.log(companies.member);

try {
	const company = await fetcher.get<CompanyItem>("/companies/1").fetch();

	console.log(company);
} catch (error) {
	if (error instanceof ApiError) {
		console.error(error.status, error.body);
	}
}
