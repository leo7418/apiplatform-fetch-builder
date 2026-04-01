import { isObject, last, toPath } from "./utils.ts";
import type { Error } from "../types/error.ts";
import type { PropertyPath } from "../types/property-path.ts";
import type { PropertyValue } from "../types/property-value.ts";
import type { Response } from "../types/response.ts";

type FetchMethod = "GET" | "POST" | "PATCH" | "PUT" | "DELETE";

export type FetchOptions<In = never> = Omit<RequestInit, "method" | "body"> & {
	body?: In;
	searchParams?: URLSearchParams;
};

export type GetOptions<
	Out extends object,
	P extends PropertyPath<Out>[] | undefined,
> = {
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
	onUnauthorized?: () => void | Promise<void>;
};

const assertSafeKey = (key: string, context: string) => {
	if (!/^[\w.]+$/.test(key)) {
		throw new TypeError(`Unsafe ${context} key: "${key}"`);
	}
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
	const buildURL = (path: string, searchParams?: URLSearchParams) => {
		const url = new URL(path, entrypoint);
		if (searchParams) url.search = searchParams.toString();
		return url.toString();
	};

	const request = async <Out extends object | null, In = never>(
		url: string,
		method: FetchMethod,
		options: FetchOptions<In> = {},
	): Promise<Response<Out>> => {
		const { body, headers, searchParams, ...restOptions } = options;

		const rawToken = await (config.getToken?.() ?? Promise.resolve(null));
		const token = rawToken || null;
		if (token && /\s/.test(token)) {
			throw new TypeError("Invalid Bearer token");
		}

		const response = await fetch(buildURL(url, searchParams), {
			method,
			headers: {
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
				...headers,
			},
			body: body
				? body instanceof FormData
					? body
					: JSON.stringify(body)
				: undefined,
			...restOptions,
		});

		if (!response.ok) {
			if (response.status === 401) {
				await config.onUnauthorized?.();
			}

			const json = await response.json();
			const error: Error<number> = json;

			return { success: false, error };
		}

		const data = method === "DELETE" ? null : await response.json();

		return { success: true, data };
	};

	const get = <Out extends object>(url: string) => ({
		fetch: (options?: FetchOptions) => request<Out>(url, "GET", options),
		withOptions: <P extends PropertyPath<Out>[]>(
			getOptions: GetOptions<Out, P>,
		) => ({
			fetch: (options?: FetchOptions) =>
				request<PropertyValue<Out, P[number]>>(url, "GET", {
					...options,
					searchParams: buildGetOptions(getOptions as AnyGetOptions),
				}),
		}),
	});

	const post = <Out extends object, In>(url: string) => ({
		fetch: (body: In, options?: FetchOptions<In>) =>
			request<Out, In>(url, "POST", { ...options, body }),
	});

	const patch = <Out extends object, In>(url: string) => ({
		fetch: (body: In, options?: FetchOptions<In>) =>
			request<Out, In>(url, "PATCH", { ...options, body }),
	});

	const put = <Out extends object, In>(url: string) => ({
		fetch: (body: In, options?: FetchOptions<In>) =>
			request<Out, In>(url, "PUT", { ...options, body }),
	});

	const del = (url: string) => ({
		fetch: (options?: FetchOptions) => request<null>(url, "DELETE", options),
	});

	return { get, post, patch, put, delete: del };
};

export default fetchBuilder;
