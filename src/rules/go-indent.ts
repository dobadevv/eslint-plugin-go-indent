import { ESLintUtils } from "@typescript-eslint/utils";
import type { TSESTree } from "@typescript-eslint/utils";

type MessageIds = "misalignedColumn";

type AlignableBody =
    | TSESTree.ObjectExpression
    | TSESTree.ClassBody
    | TSESTree.TSInterfaceBody
    | TSESTree.TSTypeLiteral;

const createRule = ESLintUtils.RuleCreator(
    (name) => `https://github.com/eslint-plugin-go-indent/rules/${name}`,
);

export interface MemberCells {
    cells: string[];
    separators: string[];
}

export function splitMemberCells(text: string): MemberCells {
    const colonIndex = text.indexOf(":");
    const equalsSearchStart = colonIndex === -1 ? 0 : colonIndex + 1;
    const equalsIndex = text.indexOf("=", equalsSearchStart);

    const boundaries: { index: number; separator: string }[] = [];
    if (colonIndex !== -1) {
        boundaries.push({ index: colonIndex, separator: ":" });
    }
    if (equalsIndex !== -1) {
        boundaries.push({ index: equalsIndex, separator: "=" });
    }

    if (boundaries.length === 0) {
        return { cells: [text.trim()], separators: [] };
    }

    const cells: string[] = [];
    const separators: string[] = [];
    let cursor = 0;
    for (const boundary of boundaries) {
        cells.push(text.slice(cursor, boundary.index).trim());
        separators.push(boundary.separator);
        cursor = boundary.index + 1;
    }
    cells.push(text.slice(cursor).trim());

    return { cells, separators };
}

function getMembers(node: AlignableBody): TSESTree.Node[] {
    switch (node.type) {
        case "ObjectExpression":
            return node.properties;
        case "ClassBody":
            return node.body;
        case "TSInterfaceBody":
            return node.body;
        case "TSTypeLiteral":
            return node.members;
        default:
            throw new Error(
                `Unexpected body node type: ${(node as { type: string }).type}`,
            );
    }
}

const rule = createRule<[], MessageIds>({
    name: "go-indent",
    meta: {
        type: "layout",
        docs: {
            description:
                "Enforce gofmt-style column alignment for class, interface, type, and object bodies",
        },
        fixable: "whitespace",
        schema: [],
        messages: {
            misalignedColumn:
                "Expected this member's value to be aligned to the column.",
        },
    },
    defaultOptions: [],
    create() {
        function checkBody(_node: AlignableBody): void {
            // Alignment logic added in later tasks.
        }

        return {
            ObjectExpression: checkBody,
            ClassBody: checkBody,
            TSInterfaceBody: checkBody,
            TSTypeLiteral: checkBody,
        };
    },
});

export default rule;
