import type { HydraKeys, HydraPrefix } from "./register.ts";

export type Error<S extends number> = {
	"@id": `/errors/${S}`;
	"@type": `${HydraPrefix}Error`;
	detail: string;
	status: S;
	title: string;
	trace?: {
		class: string;
		file: string;
		function: string;
		line: number;
		type: string;
	}[];
	type: `/errors/${S}`;
	violations?: {
		propertyPath: string;
		message: string;
		code: string;
	}[];
} & HydraKeys<{
	description: string;
	title: string;
}>;
