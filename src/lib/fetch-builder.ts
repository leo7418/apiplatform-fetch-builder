import { isObject, last, toPath } from "./utils.ts";
import type { Error } from "../types/error.ts";
import type { PropertyPath } from "../types/property-path.ts";
import type { PropertyValue } from "../types/property-value.ts";
import type { Response } from "../types/response.ts";

const methods = {
	GET: "GET",
	POST: "POST",
	PATCH: "PATCH",
	PUT: "PUT",
	DELETE: "DELETE",
} as const;

type FetchMethod = keyof typeof methods;

type FetchOptions<In = never> = Omit<RequestInit, "method" | "body"> & {
	body?: In;
	searchParams?: URLSearchParams;
};

type GetOptions<
	Out extends object,
	P extends PropertyPath<Out>[] | undefined
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

type BuilderConfig = {
	getToken?: () => string | null | Promise<string | null>;
	onUnauthorized?: () => void | Promise<void>;
};

const fetchBuilder = (entrypoint: string, config: BuilderConfig = {}) => {
	const buildURL = (path: string, searchParams?: URLSearchParams) => {
		const url = new URL(path, entrypoint);
		if (searchParams) url.search = searchParams.toString();
		return url.toString();
	};

	const buildGetOptions = <
		Out extends object,
		P extends PropertyPath<Out>[] | undefined
	>({
		pagination = true,
		pageIndex = 0,
		pageSize = 10,
		sortBy = [],
		filters = [],
		properties = [],
	}: GetOptions<Out, P>): URLSearchParams => {
		const searchParams = new URLSearchParams();

		if (pagination) {
			searchParams.append("pagination", "true");

			if (typeof pageIndex !== "undefined") {
				searchParams.append("page", (pageIndex + 1).toString());
			}
			if (typeof pageSize !== "undefined") {
				searchParams.append("itemsPerPage", pageSize.toString());
			}
		}

		sortBy.forEach(({ id, desc }) => {
			searchParams.append(`order[${id}]`, desc ? "DESC" : "ASC");
		});

		filters.forEach(({ id, value }) => {
			if (value instanceof Date) {
				searchParams.append(id, value.toISOString());
			} else if (Array.isArray(value)) {
				value.forEach((subValue) =>
					searchParams.append(`${id}[]`, subValue.toString())
				);
			} else if (isObject(value)) {
				Object.keys(value).forEach((subId) => {
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
				searchParams.append(propertyName, last(pathArr) || "");
			}
		});

		return searchParams;
	};

	const request = async <Out extends object | null, In = never>(
		url: string,
		method: FetchMethod,
		options: FetchOptions<In> = {}
	): Promise<Response<Out>> => {
		try {
			const { body, headers, searchParams, ...restOptions } = options;
			const token = await (config.getToken?.() || Promise.resolve(null));
			const response = await fetch(buildURL(url, searchParams), {
				method,
				headers: {
					...(body instanceof FormData
						? {}
						: {
								"Content-Type":
									method !== methods.PATCH
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

				console.error(
					"Request failed:",
					error.detail ||
						error["hydra:description"] ||
						json.message ||
						"Something went wrong"
				);

				return { success: false, error };
			}

			const data = method === methods.DELETE ? null : await response.json();

			return { success: true, data };
		} catch (error) {
			console.error("Request error:", error);

			throw error;
		}
	};

	const get = <Out extends object>(url: string) => ({
		fetch: (options?: FetchOptions) => request<Out>(url, methods.GET, options),
		withOptions: <P extends PropertyPath<Out>[]>(
			getOptions: GetOptions<Out, P>
		) => {
			const searchParams = buildGetOptions(getOptions);

			return {
				...request,
				fetch: (options?: FetchOptions) =>
					request<PropertyValue<Out, P[number]>>(url, methods.GET, {
						...options,
						searchParams,
					}),
			};
		},
	});

	const post = <Out extends object, In>(url: string) => ({
		fetch: (body: In, options?: FetchOptions<In>) =>
			request<Out, In>(url, methods.POST, { ...options, body }),
	});

	const patch = <Out extends object, In>(url: string) => ({
		fetch: (body: In, options?: FetchOptions<In>) =>
			request<Out, In>(url, methods.PATCH, { ...options, body }),
	});

	const put = <Out extends object, In>(url: string) => ({
		fetch: (body: In, options?: FetchOptions<In>) =>
			request<Out, In>(url, methods.PUT, { ...options, body }),
	});

	const del = (url: string) => ({
		fetch: (options?: FetchOptions) =>
			request<null>(url, methods.DELETE, options),
	});

	return { get, post, patch, put, del };
};

export default fetchBuilder;
