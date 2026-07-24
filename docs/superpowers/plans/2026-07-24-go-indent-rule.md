# go-indent Rule Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the placeholder `go-indent` rule with a real ESLint rule that enforces gofmt-style (tabs, one level per nesting depth) indentation for the bodies of `class`, `interface`, object-shaped `type`, and object-literal constructs.

**Architecture:** One shared helper (`checkContainer`) is registered against four AST visitor keys — `ObjectExpression`, `ClassBody`, `TSInterfaceBody`, `TSTypeLiteral` — each of which has a `{ ... }`-delimited body. The helper computes the indentation of the line the container starts on, then checks every direct member that begins its own line against `baseIndent + "\t"`, and the closing `}` against `baseIndent`. Nesting is handled for free: a nested container is visited independently by ESLint's traversal and computes its own `baseIndent` from its own line.

**Tech Stack:** TypeScript, ESLint 10 (flat config, `Rule`/`RuleTester` from the `eslint` package), `@typescript-eslint/utils` (`ESLintUtils.RuleCreator`) for typed TS-aware rule authoring, `@typescript-eslint/parser` (test-time TS parsing), Vitest as the test runner wired into ESLint's `RuleTester`.

## Global Constraints

- Indentation unit is tabs only — no spaces option, no configurable width (spec: "Indent unit").
- Rule has no options: `schema: []`, `defaultOptions: []`.
- `meta.type: "layout"` (matches ESLint's own `indent` rule convention).
- Single `messageId`: `wrongIndentation`, fixable (`fixable: "whitespace"`).
- Single-line containers (opening `{` and closing `}` on the same source line) are exempt — never reported.
- A member that shares its source line with a sibling member is skipped — never reported, never auto-fixed.
- `TSTypeAliasDeclaration` gets no dedicated visitor: when its right-hand side is object-shaped, that RHS is itself a `TSTypeLiteral` node and is covered by the `TSTypeLiteral` visitor.
- Package manager is `pnpm` (existing `pnpm-lock.yaml`).
- `@typescript-eslint/utils` is a runtime `dependency` (used by the shipped rule); `@typescript-eslint/parser` and `vitest` are `devDependencies` (test-time only).

---

### Task 1: Test tooling + shared helper + `ObjectExpression` support

**Files:**
- Modify: `package.json`
- Modify: `src/rules/go-indent.ts` (full rewrite, replacing the `noFoo` stub)
- Create: `src/rules/go-indent.test.ts`

**Interfaces:**
- Produces: `export default rule` from `src/rules/go-indent.ts`, a rule built with `ESLintUtils.RuleCreator` from `@typescript-eslint/utils`, message id `"wrongIndentation"` with `data: { expected: string }` (expected tab count as a string), and a `fix` that rewrites a line's leading whitespace.
- Produces: internal helpers reused by later tasks — `getMembers(node: IndentedContainer): TSESTree.Node[]`, `getLeadingWhitespace(line: string): string`, `checkContainer(node: IndentedContainer): void`, `checkMembers`, `checkClosingBrace`, `reportWrongIndent`, `isFirstTokenOnLine`. Later tasks widen the `IndentedContainer` union type and add one `case` to `getMembers` plus one visitor key — they do not change these functions' bodies.
- Consumes (Task 1 only): nothing pre-existing except the stub file being replaced.

**Test strategy note:** All four visitor keys share the exact same `checkContainer`/`checkMembers`/`checkClosingBrace` code path — there is no per-node-kind branching in the indentation logic itself, only in `getMembers`'s one-line-per-kind member extraction. So the full behavior matrix (too few tabs, too many tabs, spaces instead of tabs, single-line exemption, same-line-member skipping, nesting) is tested thoroughly once here against `ObjectExpression` as the representative case. Tasks 2–4 add one valid + one invalid case per new node kind — enough to prove the wiring (visitor key + `getMembers` case) is correct — without re-running the full matrix redundantly for every kind. Task 5 adds the nesting and same-line-skip cases that exercise multiple kinds together.

- [ ] **Step 1: Install dependencies**

```bash
pnpm add @typescript-eslint/utils
pnpm add -D @typescript-eslint/parser vitest
```

Expected: `package.json` gains `@typescript-eslint/utils` under `dependencies` and `@typescript-eslint/parser` + `vitest` under `devDependencies`; `pnpm-lock.yaml` is updated.

- [ ] **Step 2: Add the test script**

Modify `package.json`'s `scripts` block:

```json
  "scripts": {
    "test": "vitest run"
  },
```

- [ ] **Step 3: Write the failing test file**

Create `src/rules/go-indent.test.ts`:

```ts
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
  ],
});
```

- [ ] **Step 4: Run the test to verify it fails**

Run: `pnpm test`
Expected: FAIL — the current rule (`noFoo` stub) has no `wrongIndentation` messageId and never reports on `ObjectExpression`, so `RuleTester` throws an assertion error (unmet expected error count / unknown messageId).

- [ ] **Step 5: Implement the rule**

Replace the entire contents of `src/rules/go-indent.ts`:

```ts
import { ESLintUtils } from "@typescript-eslint/utils";
import type { TSESTree } from "@typescript-eslint/utils";

type MessageIds = "wrongIndentation";

type IndentedContainer = TSESTree.ObjectExpression;

const createRule = ESLintUtils.RuleCreator(
  (name) => `https://github.com/eslint-plugin-go-indent/rules/${name}`,
);

function getMembers(node: IndentedContainer): TSESTree.Node[] {
  switch (node.type) {
    case "ObjectExpression":
      return node.properties;
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
    };
  },
});

export default rule;
```

- [ ] **Step 6: Run the test to verify it passes**

Run: `pnpm test`
Expected: PASS — all `go-indent` cases green.

- [ ] **Step 7: Commit**

```bash
git add package.json pnpm-lock.yaml src/rules/go-indent.ts src/rules/go-indent.test.ts
git commit -m "feat(go-indent): enforce gofmt-style tab indentation for object expressions"
```

---

### Task 2: `ClassBody` support (class declarations and expressions)

**Files:**
- Modify: `src/rules/go-indent.ts`
- Modify: `src/rules/go-indent.test.ts`

**Interfaces:**
- Consumes: `checkContainer`, `getMembers`, `IndentedContainer` from Task 1 — widens the union and adds a switch case only; no other function body changes.
- Produces: same `wrongIndentation` messageId now also reported for `ClassBody` nodes (covers both `ClassDeclaration` and `ClassExpression`, since both wrap a `ClassBody`).

- [ ] **Step 1: Add failing tests**

Append to the `valid` array in `src/rules/go-indent.test.ts`:

```ts
    {
      name: "class declaration indented with one tab per level",
      code: "class Server {\n\tstart() {}\n}",
    },
    {
      name: "class expression indented with one tab per level",
      code: "const Server = class {\n\tstart() {}\n};",
    },
```

Append to the `invalid` array:

```ts
    {
      name: "class body indented with spaces instead of tabs",
      code: "class Server {\n  start() {}\n}",
      output: "class Server {\n\tstart() {}\n}",
      errors: [{ messageId: "wrongIndentation", data: { expected: "1" } }],
    },
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `pnpm test`
Expected: FAIL — `ClassBody` isn't in `IndentedContainer` yet and has no visitor registered, so the new invalid case reports zero errors instead of one, and `RuleTester` fails the assertion.

- [ ] **Step 3: Wire up `ClassBody`**

In `src/rules/go-indent.ts`, widen the union:

```ts
type IndentedContainer = TSESTree.ObjectExpression | TSESTree.ClassBody;
```

Add a case to `getMembers`:

```ts
function getMembers(node: IndentedContainer): TSESTree.Node[] {
  switch (node.type) {
    case "ObjectExpression":
      return node.properties;
    case "ClassBody":
      return node.body;
  }
}
```

Add the visitor key in the `create` function's return statement:

```ts
    return {
      ObjectExpression: checkContainer,
      ClassBody: checkContainer,
    };
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `pnpm test`
Expected: PASS — all cases green, including the new class cases.

- [ ] **Step 5: Commit**

```bash
git add src/rules/go-indent.ts src/rules/go-indent.test.ts
git commit -m "feat(go-indent): enforce gofmt-style tab indentation for class bodies"
```

---

### Task 3: `TSInterfaceBody` support

**Files:**
- Modify: `src/rules/go-indent.ts`
- Modify: `src/rules/go-indent.test.ts`

**Interfaces:**
- Consumes: `checkContainer`, `getMembers`, `IndentedContainer` from Tasks 1–2 — widens the union and adds a switch case only.
- Produces: same `wrongIndentation` messageId now also reported for `TSInterfaceBody` nodes.

- [ ] **Step 1: Add failing tests**

Append to the `valid` array in `src/rules/go-indent.test.ts`:

```ts
    {
      name: "interface indented with one tab per level",
      code: "interface Config {\n\tport: number;\n\thost: string;\n}",
    },
```

Append to the `invalid` array:

```ts
    {
      name: "interface body indented with spaces instead of tabs",
      code: "interface Config {\n  port: number;\n}",
      output: "interface Config {\n\tport: number;\n}",
      errors: [{ messageId: "wrongIndentation", data: { expected: "1" } }],
    },
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `pnpm test`
Expected: FAIL — `TSInterfaceBody` isn't in `IndentedContainer` yet, so the new invalid case reports zero errors instead of one.

- [ ] **Step 3: Wire up `TSInterfaceBody`**

In `src/rules/go-indent.ts`, widen the union:

```ts
type IndentedContainer =
  | TSESTree.ObjectExpression
  | TSESTree.ClassBody
  | TSESTree.TSInterfaceBody;
```

Add a case to `getMembers`:

```ts
function getMembers(node: IndentedContainer): TSESTree.Node[] {
  switch (node.type) {
    case "ObjectExpression":
      return node.properties;
    case "ClassBody":
      return node.body;
    case "TSInterfaceBody":
      return node.body;
  }
}
```

Add the visitor key:

```ts
    return {
      ObjectExpression: checkContainer,
      ClassBody: checkContainer,
      TSInterfaceBody: checkContainer,
    };
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `pnpm test`
Expected: PASS — all cases green, including the new interface cases.

- [ ] **Step 5: Commit**

```bash
git add src/rules/go-indent.ts src/rules/go-indent.test.ts
git commit -m "feat(go-indent): enforce gofmt-style tab indentation for interface bodies"
```

---

### Task 4: `TSTypeLiteral` support (covers object-shaped `type` aliases)

**Files:**
- Modify: `src/rules/go-indent.ts`
- Modify: `src/rules/go-indent.test.ts`

**Interfaces:**
- Consumes: `checkContainer`, `getMembers`, `IndentedContainer` from Tasks 1–3 — widens the union to its final, complete form and adds the last switch case.
- Produces: same `wrongIndentation` messageId now also reported for `TSTypeLiteral` nodes, which is how `type X = { ... }` gets covered without a dedicated `TSTypeAliasDeclaration` visitor.

- [ ] **Step 1: Add failing tests**

Append to the `valid` array in `src/rules/go-indent.test.ts`:

```ts
    {
      name: "type alias with object literal indented with one tab per level",
      code: "type Config = {\n\tport: number;\n\thost: string;\n};",
    },
```

Append to the `invalid` array:

```ts
    {
      name: "type alias object literal indented with spaces instead of tabs",
      code: "type Config = {\n  port: number;\n};",
      output: "type Config = {\n\tport: number;\n};",
      errors: [{ messageId: "wrongIndentation", data: { expected: "1" } }],
    },
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `pnpm test`
Expected: FAIL — `TSTypeLiteral` isn't in `IndentedContainer` yet, so the new invalid case reports zero errors instead of one.

- [ ] **Step 3: Wire up `TSTypeLiteral`**

In `src/rules/go-indent.ts`, widen the union to its final form:

```ts
type IndentedContainer =
  | TSESTree.ObjectExpression
  | TSESTree.ClassBody
  | TSESTree.TSInterfaceBody
  | TSESTree.TSTypeLiteral;
```

Add the final case to `getMembers`:

```ts
function getMembers(node: IndentedContainer): TSESTree.Node[] {
  switch (node.type) {
    case "ObjectExpression":
      return node.properties;
    case "ClassBody":
      return node.body;
    case "TSInterfaceBody":
      return node.body;
    case "TSTypeLiteral":
      return node.members;
  }
}
```

Add the final visitor key:

```ts
    return {
      ObjectExpression: checkContainer,
      ClassBody: checkContainer,
      TSInterfaceBody: checkContainer,
      TSTypeLiteral: checkContainer,
    };
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `pnpm test`
Expected: PASS — all cases green, including the new type-alias cases.

- [ ] **Step 5: Commit**

```bash
git add src/rules/go-indent.ts src/rules/go-indent.test.ts
git commit -m "feat(go-indent): enforce gofmt-style tab indentation for object-shaped type aliases"
```

---

### Task 5: Nesting and edge-case coverage

**Files:**
- Modify: `src/rules/go-indent.test.ts`

**Interfaces:**
- Consumes: the complete rule from Tasks 1–4. No production code is expected to change in this task — it is a coverage pass over behavior that already falls out of the existing design (per-container independence and the "first token on line" skip). If any case here fails, fix `src/rules/go-indent.ts` to match the spec in `docs/superpowers/specs/2026-07-24-go-indent-rule-design.md` rather than weakening the test.
- Produces: no new interfaces.

- [ ] **Step 1: Add nesting and edge-case tests**

Append to the `valid` array in `src/rules/go-indent.test.ts`:

```ts
    {
      name: "two properties on the same line are skipped, not reported",
      code: "const config = {\n\tport: 8080, host: \"localhost\",\n};",
    },
```

Append to the `invalid` array:

```ts
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
```

- [ ] **Step 2: Run the tests to verify they pass**

Run: `pnpm test`
Expected: PASS. This confirms the shared, per-container design already handles nesting and same-line-member skipping correctly, with no further production code changes needed.

- [ ] **Step 3: Commit**

```bash
git add src/rules/go-indent.test.ts
git commit -m "test(go-indent): cover nested containers and same-line member skipping"
```
