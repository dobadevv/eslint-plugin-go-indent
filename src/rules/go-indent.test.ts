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
        {
            name: "interface indented with one tab per level",
            code: "interface Config {\n\tport: number;\n\thost: string;\n}",
        },
        {
            name: "type alias with object literal indented with one tab per level",
            code: "type Config = {\n\tport: number;\n\thost: string;\n};",
        },
        {
            name: "two properties on the same line are skipped, not reported",
            code: 'const config = {\n\tport: 8080, host: "localhost",\n};',
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
        {
            name: "interface body indented with spaces instead of tabs",
            code: "interface Config {\n  port: number;\n}",
            output: "interface Config {\n\tport: number;\n}",
            errors: [{ messageId: "wrongIndentation", data: { expected: "1" } }],
        },
        {
            name: "type alias object literal indented with spaces instead of tabs",
            code: "type Config = {\n  port: number;\n};",
            output: "type Config = {\n\tport: number;\n};",
            errors: [{ messageId: "wrongIndentation", data: { expected: "1" } }],
        },
        {
            name: "nested object expression inside a class field checked independently",
            code: "class Server {\n\tconfig = {\n  port: 8080,\n\t};\n}",
            output: "class Server {\n\tconfig = {\n\t\tport: 8080,\n\t};\n}",
            errors: [{ messageId: "wrongIndentation", data: { expected: "2" } }],
        },
        {
            name: "nested type literal checked independently",
            code: "type Routes = {\n\thealth: {\n  status: string;\n\t};\n};",
            output: "type Routes = {\n\thealth: {\n\t\tstatus: string;\n\t};\n};",
            errors: [{ messageId: "wrongIndentation", data: { expected: "2" } }],
        },
    ],
});
