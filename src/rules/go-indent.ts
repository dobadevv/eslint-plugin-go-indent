import { ESLintUtils } from "@typescript-eslint/utils";
import type { TSESTree } from "@typescript-eslint/utils";

type MessageIds = "wrongIndentation";

type IndentedContainer = TSESTree.ObjectExpression | TSESTree.ClassBody;

const createRule = ESLintUtils.RuleCreator(
    (name) => `https://github.com/eslint-plugin-go-indent/rules/${name}`,
);

function getMembers(node: IndentedContainer): TSESTree.Node[] {
    switch (node.type) {
        case "ObjectExpression":
            return node.properties;
        case "ClassBody":
            return node.body;
    }
}

function getLeadingWhitespace(line: string): string {
    return line.match(/^[ \t]*/)?.[0] ?? "";
}

const rule = createRule<[], MessageIds>({
    name: "go-indent",
    meta: {
        type: "layout",
        docs: {
            description:
                "Enforce gofmt-style tab indentation for class, interface, type, and object bodies",
        },
        fixable: "whitespace",
        schema: [],
        messages: {
            wrongIndentation: "Expected this line to be indented with {{expected}} tab(s).",
        },
    },
    defaultOptions: [],
    create(context) {
        const sourceCode = context.sourceCode;

        function reportWrongIndent(
            line: number,
            actualIndent: string,
            expectedIndent: string,
        ): void {
            const lineStartOffset = sourceCode.getIndexFromLoc({ line, column: 0 });
            context.report({
                loc: { line, column: 0 },
                messageId: "wrongIndentation",
                data: { expected: String(expectedIndent.length) },
                fix(fixer) {
                    return fixer.replaceTextRange(
                        [lineStartOffset, lineStartOffset + actualIndent.length],
                        expectedIndent,
                    );
                },
            });
        }

        function isFirstTokenOnLine(
            token: TSESTree.Node | TSESTree.Token,
            line: number,
        ): boolean {
            const tokenBefore = sourceCode.getTokenBefore(token);
            return tokenBefore === null || tokenBefore.loc.end.line !== line;
        }

        function checkMembers(members: TSESTree.Node[], memberIndent: string): void {
            for (const member of members) {
                const memberLine = member.loc.start.line;
                if (!isFirstTokenOnLine(member, memberLine)) {
                    continue;
                }
                const lineText = sourceCode.lines[memberLine - 1] ?? "";
                const actualIndent = getLeadingWhitespace(lineText);
                if (actualIndent !== memberIndent) {
                    reportWrongIndent(memberLine, actualIndent, memberIndent);
                }
            }
        }

        function checkClosingBrace(node: IndentedContainer, baseIndent: string): void {
            const closingBrace = sourceCode.getLastToken(node);
            if (!closingBrace) {
                return;
            }
            const closingLine = closingBrace.loc.start.line;
            if (!isFirstTokenOnLine(closingBrace, closingLine)) {
                return;
            }
            const lineText = sourceCode.lines[closingLine - 1] ?? "";
            const actualIndent = getLeadingWhitespace(lineText);
            if (actualIndent !== baseIndent) {
                reportWrongIndent(closingLine, actualIndent, baseIndent);
            }
        }

        function checkContainer(node: IndentedContainer): void {
            if (node.loc.start.line === node.loc.end.line) {
                return;
            }

            const openingLine = sourceCode.lines[node.loc.start.line - 1] ?? "";
            const baseIndent = getLeadingWhitespace(openingLine);
            const memberIndent = `${baseIndent}\t`;

            checkMembers(getMembers(node), memberIndent);
            checkClosingBrace(node, baseIndent);
        }

        return {
            ObjectExpression: checkContainer,
            ClassBody: checkContainer,
        };
    },
});

export default rule;
