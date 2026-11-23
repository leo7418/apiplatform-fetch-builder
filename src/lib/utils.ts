export const isObject = (value: unknown): value is object =>
	typeof value === "object" && value !== null && !Array.isArray(value);
export const isPlainObject = (
	value: unknown,
): value is Record<string, unknown> =>
	isObject(value) &&
	[Object.prototype, null].includes(Object.getPrototypeOf(value));
export const last = <T>(arr: T[]): T | undefined => arr[arr.length - 1];
export const toPath = (property: string): string[] => property.split(".");
