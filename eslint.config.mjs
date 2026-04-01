import js from "@eslint/js";
import tseslint from "typescript-eslint";
import prettierPlugin from "eslint-plugin-prettier/recommended";

export default tseslint.config(
	js.configs.recommended,
	...tseslint.configs.recommended,
	prettierPlugin,
);
