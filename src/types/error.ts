import type { HydraKeys } from "./register.ts";

export type HydraError<S extends number = number> = {
	"@id"?: string;
	"@type": string;
	detail?: string;
	status?: S;
	title?: string;
	trace?: {
		class: string;
		file: string;
		function: string;
		line: number;
		type: string;
	}[];
	type?: string;
	violations?: {
		propertyPath: string;
		message: string;
		code?: string;
	}[];
} & HydraKeys<{
	description?: string;
	title: string;
}>;
