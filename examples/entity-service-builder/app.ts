import fetchBuilder, { entityServiceBuilder } from "apiplatform-fetch-builder";

import type { CompanyIri, CompanyBody, Company } from "./types/company.ts";

const companyServiceBuilder = entityServiceBuilder<
	CompanyIri,
	CompanyBody,
	Company
>;

const companiesService = companyServiceBuilder(
	fetchBuilder("https://your-api.com"),
	"/companies",
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

// Fetch all companies across all pages
const allCompanies = await companiesService.getAllPages();
console.log(`Fetched ${allCompanies["hydra:totalItems"]} companies`);

// With filters and sorting
const allActive = await companiesService.getAllPages({
	sortBy: [{ id: "name", desc: false }],
	pageSize: 50,
});
console.log(`Fetched ${allActive["hydra:totalItems"]} companies`);

// With progress reporting — return false to stop early
const partial = await companiesService.getAllPages(
	({ page, fetchedItems, totalItems, progressPercent }) => {
		console.log(
			`Page ${page}: ${fetchedItems}/${totalItems} (${progressPercent}%)`,
		);
		// Stop if there are too many results
		if (totalItems !== undefined && totalItems > 10000) return false;
	},
);
console.log(`Fetched ${partial["hydra:totalItems"]} companies`);

// With both getOptions and onProgress
const filtered = await companiesService.getAllPages(
	{ sortBy: [{ id: "name", desc: false }], pageSize: 100 },
	({ progressPercent }) => console.log(`${progressPercent}%`),
);
console.log(`Fetched ${filtered["hydra:totalItems"]} companies`);
