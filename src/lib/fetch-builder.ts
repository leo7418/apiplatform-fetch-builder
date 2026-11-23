import { ApiError } from "./api-error.ts";
import { isObject, isPlainObject, last, toPath } from "./utils.ts";
import type { PropertyPath } from "../types/property-path.ts";
import type { PropertyValue } from "../types/property-value.ts";

type FetchMethod = "GET" | "POST" | "PATCH" | "PUT" | "DELETE";

type HeadersInput = NonNullable<ConstructorParameters<typeof Headers>[0]>;

export type FetchOptions = Omit<RequestInit, "method" | "body">;

type RequestOptions = FetchOptions & {
	body?: unknown;
	searchParams?: URLSearchParams;
};

type AnyQueryOptions = {
	pagination?: boolean;
	pageIndex?: number;
	pageSize?: number;
	sortBy?: { id: string; desc: boolean }[];
	filters?: {
		id: string;
		value:
			| string
			| number
			| boolean
			| (string | number)[]
			| Record<
					string | number,
					string | number | boolean | Date | null | undefined
			  >;
	}[];
	properties?: string[];
};

export type QueryOptions<
	Out extends object,
	P extends PropertyPath<Out>[] | undefined,
> = {
	sortBy?: {
		id: [PropertyPath<Out>] extends [never]
			? string
			: Out extends { "@type": string }
				? PropertyPath<Out>
				: PropertyPath<Out> | (string & {});
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
			| Record<
					string | number,
					string | number | boolean | Date | null | undefined
			  >;
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
	headers?: HeadersInput | (() => HeadersInput | Promise<HeadersInput>);
	/** Called on a 401 response with a fetcher that has neither the headers nor the hooks; the request is then retried. */
	refreshAuth?: (fetcher: Fetcher) => void | Promise<void>;
	/** Called when the response is still a 401 after the retry, when the API refuses the refresh, or when there is no `refreshAuth`. */
	onUnauthorized?: () => void | Promise<void>;
};

export type SelectionBuilder<
	Out extends object,
	P extends PropertyPath<Out>[],
> = {
	fetch: (options?: FetchOptions) => Promise<PropertyValue<Out, P[number]>>;
	fetchRaw: (options?: FetchOptions) => Promise<Response>;
	withHeaders: (headers: HeadersInput | undefined) => SelectionBuilder<Out, P>;
};

export type GetBuilder<Out extends object> = {
	fetch: (options?: FetchOptions) => Promise<Out>;
	fetchRaw: (options?: FetchOptions) => Promise<Response>;
	withHeaders: (headers: HeadersInput | undefined) => GetBuilder<Out>;
	withQuery: <P extends PropertyPath<Out>[] = []>(
		query: QueryOptions<Out, P>,
	) => SelectionBuilder<Out, P>;
};

export type BodyBuilder<Out extends object | null> = {
	fetch: (options?: FetchOptions) => Promise<Out>;
	fetchRaw: (options?: FetchOptions) => Promise<Response>;
	withHeaders: (headers: HeadersInput | undefined) => BodyBuilder<Out>;
};

export type MutationBuilder<Out extends object | null, In> = {
	fetch: (body: In, options?: FetchOptions) => Promise<Out>;
	fetchRaw: (body: In, options?: FetchOptions) => Promise<Response>;
	withHeaders: (headers: HeadersInput | undefined) => MutationBuilder<Out, In>;
	withBody: (body: In) => BodyBuilder<Out>;
};

export type DeleteBuilder = {
	fetch: (options?: FetchOptions) => Promise<null>;
	fetchRaw: (options?: FetchOptions) => Promise<Response>;
	withHeaders: (headers: HeadersInput | undefined) => DeleteBuilder;
};

type Mutation = <Out extends object | null, In>(
	url: string,
) => MutationBuilder<Out, In>;

export type Fetcher = {
	get: <Out extends object>(url: string) => GetBuilder<Out>;
	post: Mutation;
	patch: Mutation;
	put: Mutation;
	delete: (url: string) => DeleteBuilder;
	clone: (overrides?: Partial<BuilderConfig>) => Fetcher;
};

type RequestState = { url: string; headers: HeadersInput[] } & (
	| { method: "GET"; query?: AnyQueryOptions }
	| { method: "POST" | "PATCH" | "PUT"; body?: { value: unknown } }
	| { method: "DELETE" }
);

type RefreshFailure = {
	cause: unknown;
	notified: Set<NonNullable<BuilderConfig["onUnauthorized"]>>;
};

type RefreshState = Map<string, Promise<RefreshFailure | undefined>>;

const refreshStates = new WeakMap<BuilderConfig, Map<string, RefreshState>>();

const assertSafeKey = (key: string, context: string) => {
	if (!/^[\w.-]+$/.test(key)) {
		throw new TypeError(`Unsafe ${context} key: "${key}"`);
	}
};

const mergeHeaders = (...sources: (HeadersInput | undefined)[]): Headers => {
	const merged = new Headers();
	sources.forEach((source) =>
		new Headers(source).forEach((value, key) => merged.set(key, value)),
	);
	return merged;
};

const resolveHeaders = async (headers: BuilderConfig["headers"]) =>
	typeof headers === "function" ? headers() : headers;

const copyHeaders = (headers: HeadersInput): HeadersInput =>
	Symbol.iterator in headers
		? Array.from(
				headers as Iterable<[string, string]>,
				(header): [string, string] => [...header],
			)
		: { ...headers };

const unlessAborted = <T>(promise: Promise<T>, signal?: AbortSignal | null) =>
	new Promise<T>((resolve, reject) => {
		const abort = () => reject(signal?.reason);
		if (signal?.aborted) {
			abort();
			return;
		}
		signal?.addEventListener("abort", abort, { once: true });
		promise
			.then(resolve, reject)
			.finally(() => signal?.removeEventListener("abort", abort));
	});

const credentialsOf = (headers: Headers) =>
	`${headers.get("Authorization")}\n${headers.get("Cookie")}`;

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

const buildQuery = ({
	pagination,
	pageIndex,
	pageSize,
	sortBy = [],
	filters = [],
	properties = [],
}: AnyQueryOptions): URLSearchParams => {
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
		if (Array.isArray(value)) {
			value.forEach((subValue) =>
				searchParams.append(`${id}[]`, subValue.toString()),
			);
		} else if (isObject(value)) {
			if (!isPlainObject(value)) {
				throw new TypeError(`Unsupported filter value: "${id}"`);
			}
			Object.keys(value).forEach((subId) => {
				assertSafeKey(subId, "filter sub-key");
				const subValue = value[subId];
				if (subValue != null) {
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
	resolveBase: () => URL,
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
		const base = resolveBase();
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

	const buildHeaders = async (
		method: FetchMethod,
		{ body, headers }: RequestOptions,
	) =>
		mergeHeaders(
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
		);

	const doFetch = (
		url: string,
		method: FetchMethod,
		options: RequestOptions,
		headers: Headers,
	): Promise<globalThis.Response> => {
		const { body, searchParams, ...restOptions } = options;

		return fetch(buildURL(url, searchParams), {
			...init,
			...(isStream(body) && { duplex: "half" }),
			...restOptions,
			redirect: restOptions.redirect ?? init.redirect ?? "manual",
			method,
			headers,
			body:
				body == null
					? undefined
					: isRawBody(body)
						? body
						: JSON.stringify(body),
		});
	};

	const send = async (
		url: string,
		method: FetchMethod,
		options: RequestOptions,
	): Promise<globalThis.Response> => {
		const unauthorizedBodies = new Map<globalThis.Response, string>();
		const attempt = async (given?: Headers) => {
			const headers = given ?? (await buildHeaders(method, options));
			return {
				credentials: credentialsOf(headers),
				response: await doFetch(url, method, options, headers),
			};
		};
		const retry = async (headers?: Headers) => {
			if (!unauthorizedBodies.has(response)) {
				unauthorizedBodies.set(response, await response.text().catch(() => ""));
			}
			if (isStream(options.body)) {
				throw new ApiError(
					401,
					parseErrorBody(unauthorizedBodies.get(response)!),
					{ headers: response.headers },
				);
			}
			({ credentials, response } = await attempt(headers));
		};
		let { credentials, response } = await attempt();
		let refreshFailure: RefreshFailure | undefined;

		if (response.status === 401 && refreshAuth) {
			const current = await buildHeaders(method, options);
			const changed = credentialsOf(current) !== credentials;
			const stable =
				!changed ||
				credentialsOf(await buildHeaders(method, options)) ===
					credentialsOf(current);
			if (changed && stable) {
				await retry(current);
			}

			if (response.status === 401) {
				const key = stable ? credentials : "";
				let refreshing = refreshState.get(key);
				if (!refreshing) {
					refreshing = Promise.resolve()
						.then(() =>
							refreshAuth(
								createFetcher(
									resolveBase,
									{ ...init, originAliases },
									new Map(),
								),
							),
						)
						.then(
							() => undefined,
							(cause: unknown): RefreshFailure => ({
								cause,
								notified: new Set(),
							}),
						)
						.finally(() => refreshState.delete(key));
					refreshState.set(key, refreshing);
				}
				refreshFailure = await unlessAborted(
					refreshing,
					options.signal ?? init.signal,
				);

				if (!refreshFailure) {
					await retry();
				}
			}
		}

		if (
			response.type === "opaqueredirect" ||
			[301, 302, 303, 307, 308].includes(response.status)
		) {
			throw new ApiError(
				response.status,
				parseErrorBody(await response.text()),
				{ message: "Redirect not followed", headers: response.headers },
			);
		}

		if (!response.ok) {
			if (response.status === 401 && onUnauthorized) {
				const cause = refreshFailure?.cause;
				const refused =
					cause instanceof ApiError &&
					cause.status >= 400 &&
					cause.status < 500 &&
					cause.status !== 408 &&
					cause.status !== 429;
				if (
					!refreshFailure ||
					(refused && !refreshFailure.notified.has(onUnauthorized))
				) {
					refreshFailure?.notified.add(onUnauthorized);
					await onUnauthorized();
				}
			}

			throw new ApiError(
				response.status,
				parseErrorBody(
					unauthorizedBodies.get(response) ?? (await response.text()),
				),
				{
					headers: response.headers,
					...(refreshFailure && { cause: refreshFailure.cause }),
				},
			);
		}

		return response;
	};

	const request = async (
		url: string,
		method: FetchMethod,
		options: RequestOptions,
	): Promise<unknown> => {
		const response = await send(url, method, options);
		const text = await response.text();

		if (method === "DELETE" || (text === "" && method !== "GET")) {
			return null;
		}
		try {
			return JSON.parse(text);
		} catch {
			throw new ApiError(response.status, text, {
				message: "Response is not JSON",
				headers: response.headers,
			});
		}
	};

	const makeBuilder = <Builder>(state: RequestState): Builder => {
		const query = state.method === "GET" ? state.query : undefined;
		const given =
			state.method === "GET" || state.method === "DELETE"
				? undefined
				: state.body;
		const takesBody =
			state.method !== "GET" && state.method !== "DELETE" && !given;
		const prepare = (args: unknown[]): RequestOptions => {
			const [body, options] = (takesBody ? args : [given?.value, args[0]]) as [
				unknown,
				FetchOptions | undefined,
			];
			return {
				...options,
				headers: mergeHeaders(...state.headers, options?.headers),
				body,
				searchParams: query && buildQuery(query),
			};
		};

		return {
			fetch: async (...args: unknown[]) =>
				request(state.url, state.method, prepare(args)),
			fetchRaw: async (...args: unknown[]) =>
				send(state.url, state.method, prepare(args)),
			withHeaders: (headers: HeadersInput | undefined) =>
				makeBuilder<Builder>({
					...state,
					headers: headers
						? [...state.headers, copyHeaders(headers)]
						: state.headers,
				}),
			...(takesBody && {
				withBody: (value: unknown) =>
					makeBuilder({ ...state, body: { value } }),
			}),
			...(state.method === "GET" &&
				!query && {
					withQuery: (selection: AnyQueryOptions) =>
						makeBuilder({ ...state, query: selection }),
				}),
		} as Builder;
	};

	const get = <Out extends object>(url: string) =>
		makeBuilder<GetBuilder<Out>>({ method: "GET", url, headers: [] });

	const mutation =
		(method: "POST" | "PATCH" | "PUT") =>
		<Out extends object | null, In>(url: string) =>
			makeBuilder<MutationBuilder<Out, In>>({ method, url, headers: [] });

	const del = (url: string) =>
		makeBuilder<DeleteBuilder>({ method: "DELETE", url, headers: [] });

	const clone = (overrides: Partial<BuilderConfig> = {}): Fetcher =>
		createFetcher(
			resolveBase,
			{
				...config,
				...overrides,
				headers: async () =>
					mergeHeaders(
						await resolveHeaders(commonHeaders),
						await resolveHeaders(overrides.headers),
					),
			},
			overrides.refreshAuth ? new Map() : refreshState,
		);

	return {
		get,
		post: mutation("POST"),
		patch: mutation("PATCH"),
		put: mutation("PUT"),
		delete: del,
		clone,
	};
};

const fetchBuilder = (
	entrypoint: string,
	config: BuilderConfig = {},
): Fetcher => {
	let base: URL | undefined;
	const states = refreshStates.get(config) ?? new Map<string, RefreshState>();
	const state: RefreshState = states.get(entrypoint) ?? new Map();
	refreshStates.set(config, states.set(entrypoint, state));

	return createFetcher(
		() => (base ??= new URL(entrypoint, globalThis.location?.href)),
		config,
		state,
	);
};

export default fetchBuilder;
