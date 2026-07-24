import { RuleTester } from "eslint";
import { describe, it, expect } from "vitest";
import tsParser from "@typescript-eslint/parser";
import rule, { splitMemberCells } from "./go-indent.js";

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

describe("splitMemberCells", () => {
    it("splits name: Type; into two cells", () => {
        const result = splitMemberCells("id: string;");
        expect(result.cells).toEqual(["id", "string;"]);
        expect(result.separators).toEqual([":"]);
    });

    it("splits name = value; into two cells with = separator", () => {
        const result = splitMemberCells("count = 0;");
        expect(result.cells).toEqual(["count", "0;"]);
        expect(result.separators).toEqual(["="]);
    });

    it("splits name: Type = value; into three cells", () => {
        const result = splitMemberCells("count: number = 0;");
        expect(result.cells).toEqual(["count", "number", "0;"]);
        expect(result.separators).toEqual([":", "="]);
    });

    it("keeps a bare field as a single cell", () => {
        const result = splitMemberCells("name;");
        expect(result.cells).toEqual(["name;"]);
        expect(result.separators).toEqual([]);
    });

    it("only splits on the first colon and first later equals", () => {
        const result = splitMemberCells("value: Record<string, number> = base;");
        expect(result.cells).toEqual([
            "value",
            "Record<string, number>",
            "base;",
        ]);
        expect(result.separators).toEqual([":", "="]);
    });
});
