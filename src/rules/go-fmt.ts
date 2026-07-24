import { ESLintUtils } from "@typescript-eslint/utils";
import type { TSESLint, TSESTree } from "@typescript-eslint/utils";

type MessageIds = "misalignedColumn";

type AlignableBody =
    | TSESTree.ObjectExpression
    | TSESTree.ClassBody
    | TSESTree.TSInterfaceBody
    | TSESTree.TSTypeLiteral;

const createRule = ESLintUtils.RuleCreator(
    () => `https://github.com/dobadevv/eslint-plugin-go-fmt#readme`,
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

function membersShareLine(
    earlier: TSESTree.Node,
    later: TSESTree.Node,
): boolean {
    return earlier.loc.end.line === later.loc.start.line;
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
            (membersShareLine(previous, member) ||
                hasBlankLineBetween(previous, member, sourceCode) ||
                hasCommentLineBetween(previous, member, sourceCode))
        ) {
            flush();
        }
        current.push(member);
    }
    flush();

    return runs;
}

export function computeColumnWidths(rows: MemberCells[]): number[] {
    let maxColumns = 0;
    for (const row of rows) {
        maxColumns = Math.max(maxColumns, row.cells.length);
    }
    const boundaryCount = Math.max(0, maxColumns - 1);
    const widths = new Array<number>(boundaryCount).fill(0);
    for (const row of rows) {
        for (let i = 0; i < boundaryCount; i++) {
            const hasFollowingCell = row.cells.length > i + 1;
            const cell = row.cells[i];
            if (hasFollowingCell && cell !== undefined) {
                widths[i] = Math.max(widths[i] ?? 0, cell.length);
            }
        }
    }
    return widths;
}

export function renderAligned(row: MemberCells, widths: number[]): string {
    let result = "";
    for (let i = 0; i < row.cells.length - 1; i++) {
        const cell = row.cells[i] ?? "";
        const separator = row.separators[i] ?? "";
        const width = widths[i] ?? cell.length;
        if (separator === "=") {
            result += cell.padEnd(width) + " = ";
        } else {
            result += (cell + separator).padEnd(width + 1) + " ";
        }
    }
    result += row.cells[row.cells.length - 1] ?? "";
    return result;
}

const STATEMENT_CONTAINER_TYPES = new Set([
    "Program",
    "BlockStatement",
    "StaticBlock",
    "TSModuleBlock",
    "SwitchCase",
]);

function findPrettierIgnoreTarget(
    node: TSESTree.Node,
    ancestors: TSESTree.Node[],
): TSESTree.Node {
    let target = node;
    for (let i = ancestors.length - 1; i >= 0; i--) {
        const ancestor = ancestors[i];
        if (ancestor === undefined) {
            break;
        }
        if (STATEMENT_CONTAINER_TYPES.has(ancestor.type)) {
            break;
        }
        target = ancestor;
    }
    return target;
}

function hasPrettierIgnoreComment(
    target: TSESTree.Node,
    sourceCode: SourceCodeLike,
): boolean {
    const comments = sourceCode.getCommentsBefore(target) as {
        value: string;
    }[];
    return comments.some((comment) => comment.value.trim() === "prettier-ignore");
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
    name: "go-fmt",
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
    create(context) {
        const sourceCode = context.sourceCode;
        const pendingPrettierIgnoreByTarget = new Map<TSESTree.Node, boolean>();

        function checkRun(
            run: TSESTree.Node[],
            takePrettierIgnoreFix: (
                fixer: TSESLint.RuleFixer,
            ) => TSESLint.RuleFix | null,
        ): void {
            if (run.length < 2) {
                return;
            }
            const rows = run.map((member) =>
                splitMemberCells(sourceCode.getText(member)),
            );
            const widths = computeColumnWidths(rows);
            run.forEach((member, index) => {
                const row = rows[index];
                if (row === undefined) {
                    return;
                }
                const actual = sourceCode.getText(member);
                const expected = renderAligned(row, widths);
                if (actual === expected) {
                    return;
                }
                context.report({
                    node: member,
                    messageId: "misalignedColumn",
                    fix(fixer) {
                        const fixes = [fixer.replaceText(member, expected)];
                        const prettierIgnoreFix = takePrettierIgnoreFix(fixer);
                        if (prettierIgnoreFix !== null) {
                            fixes.push(prettierIgnoreFix);
                        }
                        return fixes;
                    },
                });
            });
        }

        function checkBody(node: AlignableBody): void {
            const target = findPrettierIgnoreTarget(
                node,
                sourceCode.getAncestors(node),
            );
            if (!pendingPrettierIgnoreByTarget.has(target)) {
                pendingPrettierIgnoreByTarget.set(
                    target,
                    !hasPrettierIgnoreComment(target, sourceCode),
                );
            }

            function takePrettierIgnoreFix(
                fixer: TSESLint.RuleFixer,
            ): TSESLint.RuleFix | null {
                if (!pendingPrettierIgnoreByTarget.get(target)) {
                    return null;
                }
                pendingPrettierIgnoreByTarget.set(target, false);
                const line = sourceCode.lines[target.loc.start.line - 1] ?? "";
                const indent = line.slice(0, target.loc.start.column);
                return fixer.insertTextBefore(
                    target,
                    `// prettier-ignore\n${indent}`,
                );
            }

            for (const run of splitIntoRuns(getMembers(node), sourceCode)) {
                checkRun(run, takePrettierIgnoreFix);
            }
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
