import { RuleTester } from "eslint";
import { describe, it } from "vitest";
import tsParser from "@typescript-eslint/parser";
import rule from "./go-indent.js";

RuleTester.describe = describe;
RuleTester.it = it;

const ruleTester = new RuleTester({
    languageOptions: {
        parser: tsParser,
        sourceType: "module",
    },
});

ruleTester.run("go-indent", rule, {
    valid: [
        {
            name: "single-line object literal is left alone",
            code: "const point = { x: 1, y: 2 };",
        },
        {
            name: "already-aligned type alias run",
            code: "type User = {\n\tid:       string;\n\tusername: string;\n};",
        },
    ],
    invalid: [],
});
