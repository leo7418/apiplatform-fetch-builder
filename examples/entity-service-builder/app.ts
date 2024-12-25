import fetchBuilder, { entityServiceBuilder } from "apiplatform-fetch-builder";

import type { CompanyIri, CompanyBody, Company } from "./types/company.ts";

const companyServiceBuilder = entityServiceBuilder<
	CompanyIri,
	CompanyBody,
	Company
>;

const companiesService = companyServiceBuilder(
	fetchBuilder("https://your-api.com"),
	"/companies"
);

/* OR
const companiesService = companyServiceBuilder(
	{ entrypoint: "https://your-api.com" },
	"/companies"
);
*/

/* OR
const companiesService = companyServiceBuilder(
	"https://your-api.com",
	"/companies"
);
*/

const companiesResult = await companiesService.getAll({
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
});

if (companiesResult.success) {
	const companies = companiesResult.data["hydra:member"];

	console.log(companies);
} else {
	console.error(companiesResult.error);
}

const companyResult = await companiesService.get(1);

/* OR
const companyResult = await companiesService.get("/companies/1");
*/

if (companyResult.success) {
	const company = companyResult.data;

	console.log(company);
} else {
	console.error(companyResult.error);
}
