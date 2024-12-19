type Error<S extends number> = {
	"@id": `/errors/${S}`;
	"@type": "hydra:Error";
	detail: string;
	"hydra:description": string;
	"hydra:title": string;
	status: S;
	title: string;
	trace: {
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
};

export type { Error };
