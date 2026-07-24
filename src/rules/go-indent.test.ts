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
            name: "object expression indented with one tab per level",
            code: 'const config = {\n\tport: 8080,\n\thost: "localhost",\n};',
        },
        {
            name: "single-line object expression is exempt",
            code: "const point = { x: 1, y: 2 };",
        },
        {
            name: "class declaration indented with one tab per level",
            code: "class Server {\n\tstart() {}\n}",
        },
        {
            name: "class expression indented with one tab per level",
            code: "const Server = class {\n\tstart() {}\n};",
        },
    ],
    invalid: [
        {
            name: "object expression member with too few tabs (zero instead of one)",
            code: "const config = {\nport: 8080,\n};",
            output: "const config = {\n\tport: 8080,\n};",
            errors: [{ messageId: "wrongIndentation", data: { expected: "1" } }],
        },
        {
            name: "object expression member with too many tabs (two instead of one)",
            code: "const config = {\n\t\tport: 8080,\n};",
            output: "const config = {\n\tport: 8080,\n};",
            errors: [{ messageId: "wrongIndentation", data: { expected: "1" } }],
        },
        {
            name: "object expression indented with spaces instead of tabs",
            code: "const config = {\n  port: 8080,\n};",
            output: "const config = {\n\tport: 8080,\n};",
            errors: [{ messageId: "wrongIndentation", data: { expected: "1" } }],
        },
        {
            name: "object expression closing brace not aligned with opening line",
            code: "const config = {\n\tport: 8080,\n\t};",
            output: "const config = {\n\tport: 8080,\n};",
            errors: [{ messageId: "wrongIndentation", data: { expected: "0" } }],
        },
        {
            name: "class body indented with spaces instead of tabs",
            code: "class Server {\n  start() {}\n}",
            output: "class Server {\n\tstart() {}\n}",
            errors: [{ messageId: "wrongIndentation", data: { expected: "1" } }],
        },
    ],
});
