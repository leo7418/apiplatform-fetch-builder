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
			| Record<string | number, string | number | boolean | Date>;
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
			| string
			| number
			| boolean
			| (string | number)[]
			| Record<string | number, string | number | boolean | Date>;
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
	/** Called on a 401 response with a fetcher that has neither the headers nor the hooks; the request is then retried once. */
	refreshAuth?: (fetcher: Fetcher) => void | Promise<void>;
	/** Called when the response is still a 401 after the retry, when the API refuses the refresh, or when there is no `refreshAuth`. */
	onUnauthorized?: () => void | Promise<void>;
};

type GetOptionsBuilder<Out extends object, P extends PropertyPath<Out>[]> = {
	fetch: (options?: FetchOptions) => Promise<PropertyValue<Out, P[number]>>;
	fetchRaw: (options?: FetchOptions) => Promise<Response>;
	withHeaders: (headers: HeadersInit) => GetOptionsBuilder<Out, P>;
};

type GetBuilder<Out extends object> = {
	fetch: (options?: FetchOptions) => Promise<Out>;
	fetchRaw: (options?: FetchOptions) => Promise<Response>;
	withHeaders: (headers: HeadersInit) => GetBuilder<Out>;
	withOptions: <P extends PropertyPath<Out>[] = []>(
		getOptions: GetOptions<Out, P>,
	) => GetOptionsBuilder<Out, P>;
};

type BodyBuilder<Out extends object | null, In> = {
	fetch: (options?: FetchOptions<In>) => Promise<Out>;
	fetchRaw: (options?: FetchOptions<In>) => Promise<Response>;
	withHeaders: (headers: HeadersInit) => BodyBuilder<Out, In>;
};

type MutationBuilder<Out extends object | null, In> = {
	fetch: (body: In, options?: FetchOptions<In>) => Promise<Out>;
	fetchRaw: (body: In, options?: FetchOptions<In>) => Promise<Response>;
	withHeaders: (headers: HeadersInit) => MutationBuilder<Out, In>;
	withBody: (body: In) => BodyBuilder<Out, In>;
};

type DeleteBuilder = {
	fetch: (options?: FetchOptions) => Promise<null>;
	withHeaders: (headers: HeadersInit) => DeleteBuilder;
};

type Mutation = <Out extends object | null, In>(
	url: string,
	headers?: HeadersInit,
) => MutationBuilder<Out, In>;

export type Fetcher = {
	get: <Out extends object>(
		url: string,
		headers?: HeadersInit,
	) => GetBuilder<Out>;
	post: Mutation;
	patch: Mutation;
	put: Mutation;
	delete: (url: string, headers?: HeadersInit) => DeleteBuilder;
	clone: (overrides?: Partial<BuilderConfig>) => Fetcher;
};

type RefreshState = { pending?: Promise<{ cause: unknown } | undefined> };

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

const isStream = (body: unknown): body is ReadableStream =>
	typeof ReadableStream !== "undefined" && body instanceof ReadableStream;

const isRawBody = (body: unknown): body is BodyInit =>
	body instanceof FormData ||
	body instanceof Blob ||
	body instanceof URLSearchParams ||
	body instanceof ArrayBuffer ||
	ArrayBuffer.isView(body) ||
	isStream(body);

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
					searchParams.append(
						`${id}[${subId}]`,
						subValue instanceof Date
							? subValue.toISOString()
							: subValue.toString(),
					);
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

const createFetcher = (
	entrypoint: string,
	config: BuilderConfig,
	refreshState: RefreshState,
): Fetcher => {
	const {
		originAliases = [],
		headers: commonHeaders,
		refreshAuth,
		onUnauthorized,
		...init
	} = config;
	const aliasOrigins = originAliases.map((alias) => new URL(alias).origin);

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
			...(isStream(body) && { duplex: "half" }),
			...restOptions,
		});
	};

	const send = async <In = never>(
		url: string,
		method: FetchMethod,
		options: FetchOptions<In> & { searchParams?: URLSearchParams } = {},
	): Promise<globalThis.Response> => {
		let response = await doFetch<In>(url, method, options);
		let refreshFailure: { cause: unknown } | undefined;

		if (response.status === 401 && refreshAuth) {
			refreshState.pending ??= Promise.resolve()
				.then(() =>
					refreshAuth(
						createFetcher(entrypoint, { ...init, originAliases }, {}),
					),
				)
				.then(
					() => undefined,
					(cause: unknown) => ({ cause }),
				)
				.finally(() => {
					refreshState.pending = undefined;
				});
			refreshFailure = await refreshState.pending;

			if (!refreshFailure && isStream(options.body)) {
				throw new ApiError(401, parseErrorBody(await response.text()));
			}
			if (!refreshFailure) {
				response = await doFetch<In>(url, method, options);
			}
		}

		if (!response.ok) {
			const cause = refreshFailure?.cause;
			const refused =
				cause instanceof ApiError && cause.status >= 400 && cause.status < 500;
			if (response.status === 401 && (!refreshFailure || refused)) {
				await onUnauthorized?.();
			}

			throw new ApiError(
				response.status,
				parseErrorBody(await response.text()),
				refreshFailure,
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

		if (text === "" && method !== "GET") {
			return null as Out;
		}
		try {
			return JSON.parse(text) as Out;
		} catch {
			throw new ApiError(response.status, text, {
				message: "Response is not JSON",
			});
		}
	};

	const get = <Out extends object>(
		url: string,
		...headers: (HeadersInit | undefined)[]
	): GetBuilder<Out> => ({
		fetch: async (options?: FetchOptions) =>
			request<Out>(url, "GET", {
				...options,
				headers: mergeHeaders(...headers, options?.headers),
			}),
		fetchRaw: async (options?: FetchOptions) =>
			send(url, "GET", {
				...options,
				headers: mergeHeaders(...headers, options?.headers),
			}),
		withHeaders: (h: HeadersInit) => get<Out>(url, ...headers, h),
		withOptions: <P extends PropertyPath<Out>[]>(
			getOptions: GetOptions<Out, P>,
		) => ({
			fetch: async (options?: FetchOptions) =>
				request<PropertyValue<Out, P[number]>>(url, "GET", {
					...options,
					headers: mergeHeaders(...headers, options?.headers),
					searchParams: buildGetOptions(getOptions as AnyGetOptions),
				}),
			fetchRaw: async (options?: FetchOptions) =>
				send(url, "GET", {
					...options,
					headers: mergeHeaders(...headers, options?.headers),
					searchParams: buildGetOptions(getOptions as AnyGetOptions),
				}),
			withHeaders: (h: HeadersInit) =>
				get<Out>(url, ...headers, h).withOptions(getOptions),
		}),
	});

	const makeMutationBuilder = <Out extends object | null, In>(
		method: "POST" | "PATCH" | "PUT",
		url: string,
		...headers: (HeadersInit | undefined)[]
	): MutationBuilder<Out, In> => ({
		fetch: async (body: In, options?: FetchOptions<In>) =>
			request<Out, In>(url, method, {
				...options,
				headers: mergeHeaders(...headers, options?.headers),
				body,
			}),
		fetchRaw: async (body: In, options?: FetchOptions<In>) =>
			send<In>(url, method, {
				...options,
				headers: mergeHeaders(...headers, options?.headers),
				body,
			}),
		withHeaders: (h: HeadersInit) =>
			makeMutationBuilder<Out, In>(method, url, ...headers, h),
		withBody: (b: In) => ({
			fetch: async (options?: FetchOptions<In>) =>
				request<Out, In>(url, method, {
					...options,
					headers: mergeHeaders(...headers, options?.headers),
					body: b,
				}),
			fetchRaw: async (options?: FetchOptions<In>) =>
				send<In>(url, method, {
					...options,
					headers: mergeHeaders(...headers, options?.headers),
					body: b,
				}),
			withHeaders: (h: HeadersInit) =>
				makeMutationBuilder<Out, In>(method, url, ...headers, h).withBody(b),
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

	const del = (
		url: string,
		...headers: (HeadersInit | undefined)[]
	): DeleteBuilder => ({
		fetch: async (options?: FetchOptions) =>
			request<null>(url, "DELETE", {
				...options,
				headers: mergeHeaders(...headers, options?.headers),
			}),
		withHeaders: (h: HeadersInit) => del(url, ...headers, h),
	});

	const clone = (overrides: Partial<BuilderConfig> = {}): Fetcher =>
		createFetcher(
			entrypoint,
			{
				...config,
				...overrides,
				headers: async () =>
					mergeHeaders(
						await resolveHeaders(commonHeaders),
						await resolveHeaders(overrides.headers),
					),
			},
			overrides.refreshAuth ? {} : refreshState,
		);

	return { get, post, patch, put, delete: del, clone };
};

const fetchBuilder = (
	entrypoint: string,
	config: BuilderConfig = {},
): Fetcher => createFetcher(entrypoint, config, {});

export default fetchBuilder;
