export const isObject = (value: unknown): value is object =>
	typeof value === "object" && value !== null && !Array.isArray(value);
export const last = <T>(arr: T[]): T | undefined => arr[arr.length - 1];
export const toPath = (property: string): string[] => property.split(".");
