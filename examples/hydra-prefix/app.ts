import fetchBuilder from "apiplatform-fetch-builder";

import type { Collection, Iri } from "apiplatform-fetch-builder";

declare module "apiplatform-fetch-builder" {
	interface Register {
		hydraPrefix: true;
	}
}

type Book = { title: string; author: string };

const fetcher = fetchBuilder("https://your-api.com");

const books = await fetcher
	.get<Collection<Book, Iri<"books">>>("/books")
	.withOptions({ properties: ["title"] })
	.fetch();

console.log(books["hydra:member"]);
console.log(`${books["hydra:totalItems"]} books`);
console.log(`Next page: ${books["hydra:view"]?.["hydra:next"]}`);
