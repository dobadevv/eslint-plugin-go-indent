import { RuleTester } from "eslint";
import { describe, it, expect } from "vitest";
import tsParser from "@typescript-eslint/parser";
import type { TSESTree } from "@typescript-eslint/utils";
import rule, {
    splitMemberCells,
    splitIntoRuns,
    isConformingMember,
    computeColumnWidths,
    renderAligned,
} from "./go-indent.js";

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
        {
            name: "aligned interface run is valid",
            code: "interface Config {\n\tport:     number;\n\thostname: string;\n}",
        },
        {
            name: "two runs split by a blank line, each already aligned to its own width",
            code:
                "type T = {\n" +
                "\ta:  number;\n" +
                "\tbb: number;\n" +
                "\n" +
                "\tccc:  number;\n" +
                "\tdddd: number;\n" +
                "};",
        },
    ],
    invalid: [
        {
            name: "misaligned type alias run is fixed",
            code: "type User = {\n\tid: string;\n\tusername: string;\n};",
            output: "type User = {\n\tid:       string;\n\tusername: string;\n};",
            errors: [{ messageId: "misalignedColumn" }],
        },
        {
            name: "misaligned object literal run is fixed",
            code: "const c = {\n\ta: 1,\n\tbbb: 2,\n};",
            output: "const c = {\n\ta:   1,\n\tbbb: 2,\n};",
            errors: [{ messageId: "misalignedColumn" }],
        },
        {
            name: "blank line yields two independently aligned runs",
            code:
                "type T = {\n" +
                "\ta: number;\n" +
                "\tbb: number;\n" +
                "\n" +
                "\tccc: number;\n" +
                "\tdddd: number;\n" +
                "};",
            output:
                "type T = {\n" +
                "\ta:  number;\n" +
                "\tbb: number;\n" +
                "\n" +
                "\tccc:  number;\n" +
                "\tdddd: number;\n" +
                "};",
            errors: [
                { messageId: "misalignedColumn" },
                { messageId: "misalignedColumn" },
            ],
        },
        {
            name: "comment line splits a run into two independently aligned runs",
            code:
                "interface I {\n" +
                "\ta: number;\n" +
                "\tbb: number;\n" +
                "\t// section\n" +
                "\tccc: number;\n" +
                "\tdddd: number;\n" +
                "}",
            output:
                "interface I {\n" +
                "\ta:  number;\n" +
                "\tbb: number;\n" +
                "\t// section\n" +
                "\tccc:  number;\n" +
                "\tdddd: number;\n" +
                "}",
            errors: [
                { messageId: "misalignedColumn" },
                { messageId: "misalignedColumn" },
            ],
        },
        {
            name: "a method splits a run and is left untouched",
            code:
                "class C {\n" +
                "\ta: number;\n" +
                "\tbb: number;\n" +
                "\tgreet() {}\n" +
                "\tccc: number;\n" +
                "\tdddd: number;\n" +
                "}",
            output:
                "class C {\n" +
                "\ta:  number;\n" +
                "\tbb: number;\n" +
                "\tgreet() {}\n" +
                "\tccc:  number;\n" +
                "\tdddd: number;\n" +
                "}",
            errors: [
                { messageId: "misalignedColumn" },
                { messageId: "misalignedColumn" },
            ],
        },
    ],
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

function fakeMember(
    startLine: number,
    endLine: number,
    extra: Record<string, unknown> = {},
): TSESTree.Node {
    return {
        type: "PropertyDefinition",
        computed: false,
        loc: {
            start: { line: startLine, column: 0 },
            end: { line: endLine, column: 0 },
        },
        ...extra,
    } as unknown as TSESTree.Node;
}

describe("isConformingMember", () => {
    it("treats a single-line simple field as conforming", () => {
        expect(isConformingMember(fakeMember(1, 1))).toBe(true);
    });

    it("treats a multi-line member as non-conforming", () => {
        expect(isConformingMember(fakeMember(1, 3))).toBe(false);
    });

    it("treats a computed-key member as non-conforming", () => {
        expect(isConformingMember(fakeMember(1, 1, { computed: true }))).toBe(
            false,
        );
    });

    it("treats a method definition as non-conforming", () => {
        const method = {
            type: "MethodDefinition",
            computed: false,
            loc: {
                start: { line: 1, column: 0 },
                end: { line: 1, column: 0 },
            },
        } as unknown as TSESTree.Node;
        expect(isConformingMember(method)).toBe(false);
    });
});

describe("splitIntoRuns", () => {
    const noComments = { getCommentsBefore: () => [] };

    it("groups contiguous conforming members into one run", () => {
        const a = fakeMember(2, 2);
        const b = fakeMember(3, 3);
        const source = {
            lines: ["type X = {", "\ta: string;", "\tb: string;", "};"],
            ...noComments,
        };
        expect(splitIntoRuns([a, b], source)).toEqual([[a, b]]);
    });

    it("splits a run at a blank line", () => {
        const a = fakeMember(2, 2);
        const b = fakeMember(4, 4);
        const source = {
            lines: ["type X = {", "\ta: string;", "", "\tb: string;", "};"],
            ...noComments,
        };
        expect(splitIntoRuns([a, b], source)).toEqual([[a], [b]]);
    });

    it("splits a run at a comment line and drops non-conforming members", () => {
        const a = fakeMember(2, 2);
        const method = {
            type: "MethodDefinition",
            computed: false,
            loc: {
                start: { line: 3, column: 0 },
                end: { line: 3, column: 0 },
            },
        } as unknown as TSESTree.Node;
        const c = fakeMember(4, 4);
        const source = {
            lines: [
                "type X = {",
                "\ta: string;",
                "\tm() {}",
                "\tc: string;",
                "};",
            ],
            ...noComments,
        };
        expect(splitIntoRuns([a, method, c], source)).toEqual([[a], [c]]);
    });
});

describe("computeColumnWidths", () => {
    it("takes the max cell width per boundary from rows with a following cell", () => {
        const rows = [
            splitMemberCells("id: string;"),
            splitMemberCells("username: string;"),
        ];
        expect(computeColumnWidths(rows)).toEqual(["username".length]);
    });

    it("ignores a bare field with no following cell", () => {
        const rows = [
            splitMemberCells("reallyLongName;"),
            splitMemberCells("a: string;"),
        ];
        expect(computeColumnWidths(rows)).toEqual(["a".length]);
    });
});

describe("renderAligned", () => {
    it("pads the name column so values line up", () => {
        const widths = ["username".length];
        expect(renderAligned(splitMemberCells("id: string;"), widths)).toBe(
            "id:       string;",
        );
        expect(
            renderAligned(splitMemberCells("username: string;"), widths),
        ).toBe("username: string;");
    });

    it("never pads the final cell (no trailing whitespace)", () => {
        const widths = ["longer".length];
        expect(renderAligned(splitMemberCells("a: X;"), widths)).toBe(
            "a:      X;",
        );
    });
});
