import fetchBuilder from "apiplatform-fetch-builder/lib/fetch-builder";
import type { CompanyCollection } from "./types/company.ts";

const fetcher = fetchBuilder("https://an-api.com");

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
