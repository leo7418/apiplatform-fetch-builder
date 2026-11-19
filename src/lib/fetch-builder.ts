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
			| (string | number)[]
			| Record<string | number, string | number>;
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
		id: [PropertyPath<Out>] extends [never] ? string : PropertyPath<Out>;
		value:
			| Date
			| string
			| number
			| (string | number)[]
			| Record<string | number, string | number>;
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

export type BuilderConfig = {
	getToken?: () => string | null | Promise<string | null>;
	refreshToken?: () => string | null | Promise<string | null>;
	onUnauthorized?: () => void | Promise<void>;
};

const assertSafeKey = (key: string, context: string) => {
	if (!/^[\w.]+$/.test(key)) {
		throw new TypeError(`Unsafe ${context} key: "${key}"`);
	}
};

const assertSafeToken = (token: string | null) => {
	if (token !== null && (token === "" || /\s/.test(token))) {
		throw new TypeError("Invalid Bearer token");
	}
};

const mergeHeaders = (...sources: (HeadersInit | undefined)[]): Headers => {
	const merged = new Headers();
	sources.forEach((source) =>
		new Headers(source).forEach((value, key) => merged.set(key, value)),
	);
	return merged;
};

const parseErrorBody = (text: string): unknown => {
	try {
		return JSON.parse(text);
	} catch {
		return text;
	}
};

const buildGetOptions = ({
	pagination = true,
	pageIndex = 0,
	pageSize = 10,
	sortBy = [],
	filters = [],
	properties = [],
}: AnyGetOptions): URLSearchParams => {
	const searchParams = new URLSearchParams();

	if (pagination) {
		searchParams.append("pagination", "true");
		searchParams.append("page", (pageIndex + 1).toString());
		searchParams.append("itemsPerPage", pageSize.toString());
	} else {
		searchParams.append("pagination", "false");
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
	let refreshing: Promise<string | null> | undefined;

	const buildURL = (path: string, searchParams?: URLSearchParams) => {
		const url = new URL(path, entrypoint);
		if (url.origin !== new URL(entrypoint).origin) {
			throw new TypeError(`Cross-origin URL: "${path}"`);
		}
		if (searchParams) url.search = searchParams.toString();
		return url.toString();
	};

	const doFetch = async <In = never>(
		url: string,
		method: FetchMethod,
		options: FetchOptions<In> & { searchParams?: URLSearchParams } = {},
		token: string | null,
	): Promise<globalThis.Response> => {
		const { body, headers, searchParams, ...restOptions } = options;

		return fetch(buildURL(url, searchParams), {
			method,
			headers: mergeHeaders(
				{
					...(body instanceof FormData
						? {}
						: {
								"Content-Type":
									method !== "PATCH"
										? "application/ld+json"
										: "application/merge-patch+json",
							}),
					Accept: "application/ld+json",
					...(token ? { Authorization: `Bearer ${token}` } : {}),
				},
				headers,
			),
			body:
				body == null
					? undefined
					: body instanceof FormData
						? body
						: JSON.stringify(body),
			...restOptions,
		});
	};

	const request = async <Out extends object | null, In = never>(
		url: string,
		method: FetchMethod,
		options: FetchOptions<In> & { searchParams?: URLSearchParams } = {},
	): Promise<Out> => {
		const token = (await config.getToken?.()) ?? null;
		assertSafeToken(token);

		let response = await doFetch<In>(url, method, options, token);

		if (response.status === 401 && config.refreshToken) {
			refreshing ??= Promise.resolve(config.refreshToken()).finally(() => {
				refreshing = undefined;
			});
			const newToken = await refreshing;
			assertSafeToken(newToken);
			response = await doFetch<In>(url, method, options, newToken);
		}

		if (!response.ok) {
			if (response.status === 401) {
				await config.onUnauthorized?.();
			}

			throw new ApiError(
				response.status,
				parseErrorBody(await response.text()),
			);
		}

		const text = method === "DELETE" ? "" : await response.text();

		return (text === "" ? null : JSON.parse(text)) as Out;
	};

	const get = <Out extends object>(url: string, headers?: HeadersInit) => ({
		fetch: (options?: FetchOptions) =>
			request<Out>(url, "GET", {
				...options,
				headers: mergeHeaders(headers, options?.headers),
			}),
		withHeaders: (h: HeadersInit) => get<Out>(url, mergeHeaders(headers, h)),
		withOptions: <P extends PropertyPath<Out>[]>(
			getOptions: GetOptions<Out, P>,
		) => ({
			fetch: (options?: FetchOptions) =>
				request<PropertyValue<Out, P[number]>>(url, "GET", {
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
		withHeaders: (h: HeadersInit) =>
			makeMutationBuilder<Out, In>(method, url, mergeHeaders(headers, h)),
		withBody: (b: In) => ({
			fetch: (options?: FetchOptions<In>) =>
				request<Out, In>(url, method, {
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
		fetchBuilder(entrypoint, { ...config, ...overrides });

	return { get, post, patch, put, delete: del, clone };
};

export default fetchBuilder;
