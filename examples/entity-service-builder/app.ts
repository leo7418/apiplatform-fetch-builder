import fetchBuilder, { entityServiceBuilder } from "apiplatform-fetch-builder";
import type {
	AnyIri,
	Collection,
	EntityService,
	Fetcher,
	IriId,
	Item,
	PropertyPath,
	QueryOptions,
	Read,
} from "apiplatform-fetch-builder";

import type { CompanyIri, Company } from "./types/company.ts";

const companyServiceBuilder = entityServiceBuilder<CompanyIri, Company>;

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

const companies = await companiesService.getAll({
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

console.log(companies.member);

const company = await companiesService.get(1);

/* OR
const company = await companiesService.get("/companies/1");
*/

console.log(company);

// Send an item back as it was read, with a change
const renamed = await companiesService.update({ ...company, name: "Acme" });
console.log(renamed.name);

// Send back an item narrowed by a selection
const narrowed = await companiesService.get(1, {
	properties: ["name", "website"],
});
await companiesService.update(narrowed);

// Identify an item by its IRI or by its id, whichever is known
const known: { iri?: CompanyIri; id?: number } = { id: 1 };
await companiesService.upsert({
	"@id": known.iri,
	id: known.id,
	name: "Acme",
});
await companiesService.update({
	"@id": company["@id"],
	id: known.id,
	ceo: { "@id": undefined, firstName: "Ada" },
});

// Create with the properties the API does not fill itself
const created = await companiesService.create({
	name: "Globex",
	description: "Energy",
	ceo: "/users/1",
});
console.log(created["@id"]);

// Fetch all companies across all pages
const allCompanies = await companiesService.getAllPages();
console.log(`Fetched ${allCompanies.totalItems} companies`);

// With filters and sorting
const allActive = await companiesService.getAllPages({
	sortBy: [{ id: "name", desc: false }],
	pageSize: 50,
});
console.log(`Fetched ${allActive.totalItems} companies`);

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
console.log(`Fetched ${partial.totalItems} companies`);

// With both query and onProgress
const filtered = await companiesService.getAllPages(
	{ sortBy: [{ id: "name", desc: false }], pageSize: 100 },
	({ progressPercent }) => console.log(`${progressPercent}%`),
);
console.log(`Fetched ${filtered.totalItems} companies`);

// A helper that is generic over the model, typed like the service itself
const list = <
	T extends object,
	I extends AnyIri,
	P extends PropertyPath<Collection<T, I>>[],
>(
	fetcher: Fetcher,
	path: string,
	query?: QueryOptions<Collection<T, I>, P>,
) => {
	const builder = fetcher.get<Collection<T, I>>(path);
	return query ? builder.withQuery(query).fetch() : builder.fetch();
};

const listed = await list<Company, CompanyIri, ["name"]>(
	fetchBuilder("https://your-api.com"),
	"/companies",
	{ properties: ["name"] },
);
console.log(listed.member.map(({ name }) => name));

// The same for a service, with the type of what a read resolves with
const load = <I extends AnyIri, T extends object>(
	service: EntityService<I, T>,
	id: IriId<I>,
): Promise<Item<Read<T>, I>> => service.get(id);

const loaded = await load(companiesService, 1);
console.log(loaded.name);

// Generic code can use what a service reads, when the model declares it
const names = async <I extends AnyIri, T extends { name: string }>(
	service: EntityService<I, T>,
	id: IriId<I>,
): Promise<string[]> => {
	const one = await service.get(id);
	const page = await service.getAll({ pageSize: 20 });
	return [one.name, ...page.member.map((member) => member.name)];
};
console.log(await names(companiesService, 1), listed.totalItems);
