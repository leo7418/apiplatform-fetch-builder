import { ApiError } from "./api-error.ts";
import { isObject, last, toPath } from "./utils.ts";
import type { PropertyPath } from "../types/property-path.ts";
import type { PropertyValue } from "../types/property-value.ts";

type FetchMethod = "GET" | "POST" | "PATCH" | "PUT" | "DELETE";

export type FetchOptions<In = never> = Omit<RequestInit, "method" | "body"> & {
	body?: In;
};

type AnyGetOptions = {
	pagination?: boolean;
	pageIndex?: number;
	pageSize?: number;
	sortBy?: { id: string; desc: boolean }[];
	filters?: {
		id: string;
		value:
			| Date
			| string
			| number
			| boolean
			| (string | number)[]
			| Record<string | number, string | number | boolean>;
	}[];
	properties?: string[];
};

export type GetOptions<
	Out extends object,
	P extends PropertyPath<Out>[] | undefined,
> = {
	sortBy?: {
		id: [PropertyPath<Out>] extends [never] ? string : PropertyPath<Out>;
		desc: boolean;
	}[];
	filters?: {
		/** A property path, or the name of any other filter (`exists`, a custom one). */
		id: PropertyPath<Out> | (string & {});
		value:
			| Date
			| string
			| number
			| boolean
			| (string | number)[]
			| Record<string | number, string | number | boolean>;
	}[];
	properties?: P;
} & (
	| {
			pagination: false;
			pageIndex?: never;
			pageSize?: never;
	  }
	| {
			pagination?: true;
			pageIndex?: number;
			pageSize?: number;
	  }
);

export type BuilderConfig = Omit<RequestInit, "method" | "body" | "headers"> & {
	/** Other origins the API uses in its IRIs; a request to one of them is sent to the entrypoint. */
	originAliases?: string[];
	/** Headers sent with every request; a function is called before each request. */
	headers?: HeadersInit | (() => HeadersInit | Promise<HeadersInit>);
	/** Called on a 401 response; the request is then retried once with fresh headers. */
	refreshAuth?: () => void | Promise<void>;
	/** Called when the response is still a 401 after the retry, or when there is no `refreshAuth`. */
	onUnauthorized?: () => void | Promise<void>;
};

const assertSafeKey = (key: string, context: string) => {
	if (!/^[\w.-]+$/.test(key)) {
		throw new TypeError(`Unsafe ${context} key: "${key}"`);
	}
};

const mergeHeaders = (...sources: (HeadersInit | undefined)[]): Headers => {
	const merged = new Headers();
	sources.forEach((source) =>
		new Headers(source).forEach((value, key) => merged.set(key, value)),
	);
	return merged;
};

const resolveHeaders = async (headers: BuilderConfig["headers"]) =>
	typeof headers === "function" ? headers() : headers;

const isRawBody = (body: unknown): body is BodyInit =>
	body instanceof FormData ||
	body instanceof Blob ||
	body instanceof URLSearchParams ||
	body instanceof ArrayBuffer ||
	ArrayBuffer.isView(body);

const parseErrorBody = (text: string): unknown => {
	try {
		return JSON.parse(text);
	} catch {
		return text;
	}
};

const buildGetOptions = ({
	pagination,
	pageIndex,
	pageSize,
	sortBy = [],
	filters = [],
	properties = [],
}: AnyGetOptions): URLSearchParams => {
	const searchParams = new URLSearchParams();

	if (pagination !== undefined) {
		searchParams.append("pagination", pagination.toString());
	}
	if (pageIndex !== undefined) {
		searchParams.append("page", (pageIndex + 1).toString());
	}
	if (pageSize !== undefined) {
		searchParams.append("itemsPerPage", pageSize.toString());
	}

	sortBy.forEach(({ id, desc }) => {
		assertSafeKey(id, "sortBy");
		searchParams.append(`order[${id}]`, desc ? "DESC" : "ASC");
	});

	filters.forEach(({ id, value }) => {
		assertSafeKey(id, "filter");
		if (value instanceof Date) {
			searchParams.append(id, value.toISOString());
		} else if (Array.isArray(value)) {
			value.forEach((subValue) =>
				searchParams.append(`${id}[]`, subValue.toString()),
			);
		} else if (isObject(value)) {
			Object.keys(value).forEach((subId) => {
				assertSafeKey(subId, "filter sub-key");
				const subValue = value[subId];
				if (subValue !== null) {
					searchParams.append(`${id}[${subId}]`, subValue.toString());
				}
			});
		} else {
			searchParams.append(id, value.toString());
		}
	});

	properties.forEach((property) => {
		const pathArr = toPath(property);
		if (pathArr.length === 1) {
			searchParams.append("properties[]", property);
		} else {
			let propertyName = "properties";
			for (let i = 0; i < pathArr.length - 1; i += 1) {
				propertyName += `[${pathArr[i]}]`;
			}
			propertyName += "[]";
			searchParams.append(propertyName, last(pathArr)!);
		}
	});

	return searchParams;
};

const fetchBuilder = (entrypoint: string, config: BuilderConfig = {}) => {
	const {
		originAliases = [],
		headers: commonHeaders,
		refreshAuth,
		onUnauthorized,
		...init
	} = config;
	const aliasOrigins = originAliases.map((alias) => new URL(alias).origin);
	let refreshing: Promise<void> | undefined;

	const buildURL = (path: string, searchParams?: URLSearchParams) => {
		const base = new URL(entrypoint);
		const basePath = base.pathname.replace(/\/+$/, "");
		const target = new URL(path, `${base.origin}/`);
		const isAlias = aliasOrigins.includes(target.origin);
		if (target.origin !== base.origin && !isAlias) {
			throw new TypeError(`Cross-origin URL: "${path}"`);
		}
		const url = isAlias
			? new URL(base.origin + target.pathname + target.search)
			: target;
		if (
			(isAlias || !/^([a-z][a-z\d+.-]*:)?\/\//i.test(path)) &&
			url.pathname !== basePath &&
			!url.pathname.startsWith(`${basePath}/`)
		) {
			url.pathname = basePath + url.pathname;
		}
		searchParams?.forEach((value, key) => url.searchParams.append(key, value));
		return url.toString();
	};

	const doFetch = async <In = never>(
		url: string,
		method: FetchMethod,
		options: FetchOptions<In> & { searchParams?: URLSearchParams } = {},
	): Promise<globalThis.Response> => {
		const { body, headers, searchParams, ...restOptions } = options;

		return fetch(buildURL(url, searchParams), {
			...init,
			method,
			headers: mergeHeaders(
				{
					...(body == null || isRawBody(body)
						? {}
						: {
								"Content-Type":
									method !== "PATCH"
										? "application/ld+json"
										: "application/merge-patch+json",
							}),
					Accept: "application/ld+json",
				},
				await resolveHeaders(commonHeaders),
				headers,
			),
			body:
				body == null
					? undefined
					: isRawBody(body)
						? body
						: JSON.stringify(body),
			...restOptions,
		});
	};

	const send = async <In = never>(
		url: string,
		method: FetchMethod,
		options: FetchOptions<In> & { searchParams?: URLSearchParams } = {},
	): Promise<globalThis.Response> => {
		let response = await doFetch<In>(url, method, options);

		if (response.status === 401 && refreshAuth) {
			refreshing ??= Promise.resolve(refreshAuth()).finally(() => {
				refreshing = undefined;
			});
			await refreshing;
			response = await doFetch<In>(url, method, options);
		}

		if (!response.ok) {
			if (response.status === 401) {
				await onUnauthorized?.();
			}

			throw new ApiError(
				response.status,
				parseErrorBody(await response.text()),
			);
		}

		return response;
	};

	const request = async <Out extends object | null, In = never>(
		url: string,
		method: FetchMethod,
		options: FetchOptions<In> & { searchParams?: URLSearchParams } = {},
	): Promise<Out> => {
		const response = await send<In>(url, method, options);
		const text = method === "DELETE" ? "" : await response.text();

		return (text === "" ? null : JSON.parse(text)) as Out;
	};

	const get = <Out extends object>(url: string, headers?: HeadersInit) => ({
		fetch: (options?: FetchOptions) =>
			request<Out>(url, "GET", {
				...options,
				headers: mergeHeaders(headers, options?.headers),
			}),
		fetchRaw: (options?: FetchOptions) =>
			send(url, "GET", {
				...options,
				headers: mergeHeaders(headers, options?.headers),
			}),
		withHeaders: (h: HeadersInit) => get<Out>(url, mergeHeaders(headers, h)),
		withOptions: <P extends PropertyPath<Out>[]>(
			getOptions: GetOptions<Out, P>,
		) => ({
			fetch: async (options?: FetchOptions) =>
				request<PropertyValue<Out, P[number]>>(url, "GET", {
					...options,
					headers: mergeHeaders(headers, options?.headers),
					searchParams: buildGetOptions(getOptions as AnyGetOptions),
				}),
			fetchRaw: async (options?: FetchOptions) =>
				send(url, "GET", {
					...options,
					headers: mergeHeaders(headers, options?.headers),
					searchParams: buildGetOptions(getOptions as AnyGetOptions),
				}),
			withHeaders: (h: HeadersInit) =>
				get<Out>(url, mergeHeaders(headers, h)).withOptions(getOptions),
		}),
	});

	const makeMutationBuilder = <Out extends object | null, In>(
		method: "POST" | "PATCH" | "PUT",
		url: string,
		headers?: HeadersInit,
	) => ({
		fetch: (body: In, options?: FetchOptions<In>) =>
			request<Out, In>(url, method, {
				...options,
				headers: mergeHeaders(headers, options?.headers),
				body,
			}),
		fetchRaw: (body: In, options?: FetchOptions<In>) =>
			send<In>(url, method, {
				...options,
				headers: mergeHeaders(headers, options?.headers),
				body,
			}),
		withHeaders: (h: HeadersInit) =>
			makeMutationBuilder<Out, In>(method, url, mergeHeaders(headers, h)),
		withBody: (b: In) => ({
			fetch: (options?: FetchOptions<In>) =>
				request<Out, In>(url, method, {
					...options,
					headers: mergeHeaders(headers, options?.headers),
					body: b,
				}),
			fetchRaw: (options?: FetchOptions<In>) =>
				send<In>(url, method, {
					...options,
					headers: mergeHeaders(headers, options?.headers),
					body: b,
				}),
			withHeaders: (h: HeadersInit) =>
				makeMutationBuilder<Out, In>(
					method,
					url,
					mergeHeaders(headers, h),
				).withBody(b),
		}),
	});

	const post = <Out extends object | null, In>(
		url: string,
		headers?: HeadersInit,
	) => makeMutationBuilder<Out, In>("POST", url, headers);

	const patch = <Out extends object | null, In>(
		url: string,
		headers?: HeadersInit,
	) => makeMutationBuilder<Out, In>("PATCH", url, headers);

	const put = <Out extends object | null, In>(
		url: string,
		headers?: HeadersInit,
	) => makeMutationBuilder<Out, In>("PUT", url, headers);

	const del = (url: string, headers?: HeadersInit) => ({
		fetch: (options?: FetchOptions) =>
			request<null>(url, "DELETE", {
				...options,
				headers: mergeHeaders(headers, options?.headers),
			}),
		withHeaders: (h: HeadersInit) => del(url, mergeHeaders(headers, h)),
	});

	const clone = (overrides: Partial<BuilderConfig> = {}) =>
		fetchBuilder(entrypoint, {
			...config,
			...overrides,
			headers: async () =>
				mergeHeaders(
					await resolveHeaders(commonHeaders),
					await resolveHeaders(overrides.headers),
				),
		});

	return { get, post, patch, put, delete: del, clone };
};

export default fetchBuilder;
