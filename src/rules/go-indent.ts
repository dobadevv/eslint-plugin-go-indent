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

export type SourceCodeLike = {
    lines: string[];
    getCommentsBefore(node: TSESTree.Node): unknown[];
};

const METHOD_NODE_TYPES = new Set([
    "MethodDefinition",
    "TSMethodSignature",
    "TSCallSignatureDeclaration",
    "TSConstructSignatureDeclaration",
]);

const NON_CONFORMING_NODE_TYPES = new Set([
    ...METHOD_NODE_TYPES,
    "SpreadElement",
    "TSIndexSignature",
]);

function isFunctionValued(member: TSESTree.Node): boolean {
    const value = (member as { value?: { type?: string } }).value;
    return (
        value?.type === "FunctionExpression" ||
        value?.type === "ArrowFunctionExpression"
    );
}

export function isConformingMember(member: TSESTree.Node): boolean {
    if (member.loc.start.line !== member.loc.end.line) {
        return false;
    }
    if (NON_CONFORMING_NODE_TYPES.has(member.type)) {
        return false;
    }
    if ((member as { computed?: boolean }).computed === true) {
        return false;
    }
    if ((member as { method?: boolean }).method === true) {
        return false;
    }
    if (isFunctionValued(member)) {
        return false;
    }
    return true;
}

function hasBlankLineBetween(
    earlier: TSESTree.Node,
    later: TSESTree.Node,
    sourceCode: SourceCodeLike,
): boolean {
    for (
        let line = earlier.loc.end.line + 1;
        line < later.loc.start.line;
        line++
    ) {
        if ((sourceCode.lines[line - 1] ?? "").trim() === "") {
            return true;
        }
    }
    return false;
}

function hasCommentLineBetween(
    earlier: TSESTree.Node,
    later: TSESTree.Node,
    sourceCode: SourceCodeLike,
): boolean {
    const comments = sourceCode.getCommentsBefore(later) as {
        loc: { start: { line: number } };
    }[];
    return comments.some(
        (comment) => comment.loc.start.line > earlier.loc.end.line,
    );
}

export function splitIntoRuns(
    members: TSESTree.Node[],
    sourceCode: SourceCodeLike,
): TSESTree.Node[][] {
    const runs: TSESTree.Node[][] = [];
    let current: TSESTree.Node[] = [];

    function flush(): void {
        if (current.length > 0) {
            runs.push(current);
            current = [];
        }
    }

    for (const member of members) {
        if (!isConformingMember(member)) {
            flush();
            continue;
        }
        const previous = current[current.length - 1];
        if (
            previous !== undefined &&
            (hasBlankLineBetween(previous, member, sourceCode) ||
                hasCommentLineBetween(previous, member, sourceCode))
        ) {
            flush();
        }
        current.push(member);
    }
    flush();

    return runs;
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
