# go-indent rule: gofmt-style tab indentation for class/interface/type/object

## Problem

`eslint-plugin-go-indent` is a fresh scaffold. Its only rule, `src/rules/go-indent.ts`,
is placeholder code (it disallows variables named `foo`) and has no relation to
indentation. We need a real rule that enforces Go-style (gofmt) indentation —
tabs, one level per nesting depth — for the four TypeScript/JavaScript constructs
that have a brace-delimited body: `class`, `interface`, `type` (object-shaped),
and object literals/expressions.

## Scope

The rule tracks these AST node kinds, wherever they occur in a file (top-level
or nested inside functions, other expressions, etc.):

- `ClassBody` — covers both `ClassDeclaration` and `ClassExpression`
- `TSInterfaceBody`
- `TSTypeLiteral` — covers inline object types, including the right-hand side
  of `type X = { ... }`. No special-casing of `TSTypeAliasDeclaration` is
  needed: when its RHS is object-shaped, that RHS is itself a `TSTypeLiteral`
  node and gets visited independently.
- `ObjectExpression`

Out of scope for v1:

- General statement/block indentation (e.g. inside method bodies, `if`/`for`
  blocks) — only the four node kinds above are checked.
- Configurable indent width or spaces — tabs only, matching gofmt.
- Multiple members written on a single line — skipped, not reported.
- Comment-line indentation.

## Algorithm

One shared helper invoked from four visitor keys (`ClassBody`,
`TSInterfaceBody`, `TSTypeLiteral`, `ObjectExpression`). For each matched node:

1. Skip if the node's opening `{` and closing `}` are on the same source
   line — nothing to indent.
2. Compute `baseIndent`: the leading whitespace of the source line that
   contains the node's opening `{`.
3. Expected member indent = `baseIndent + "\t"`. Expected closing-brace
   indent = `baseIndent`.
4. For each direct member (class body element / interface body element /
   type literal member / object property) that is the first token on its
   own source line: compare that line's leading whitespace to the expected
   member indent. On mismatch, report a violation with a fixer that replaces
   the line's leading whitespace with the correct tabs.
5. Members that share a line with a sibling member are skipped entirely (no
   report, no fix) — out of scope for v1.
6. Apply the same check to the closing `}`'s line against the expected
   closing indent.

Nesting is handled without extra recursion logic: a nested `ObjectExpression`,
`TSTypeLiteral`, or `ClassBody` found inside a member is visited
independently by ESLint's traversal and computes its own `baseIndent` from
its own opening line.

## Rule shape

- Built with `ESLintUtils.RuleCreator` from `@typescript-eslint/utils`, so
  TS-only node types (`TSInterfaceBody`, `TSTypeLiteral`) are properly typed
  instead of cast through `any`.
- `meta.type: "layout"` — matches the convention used by ESLint's own
  built-in `indent` rule, since this rule only affects whitespace, not
  semantics.
- Single `messageId` (e.g. `wrongIndentation`) carrying a `fix`.

## Dependencies

Added to `package.json`:

- `@typescript-eslint/utils` — typed rule creation.
- `@typescript-eslint/parser` (dev) — parses TS syntax in tests (and is what
  consumers of this plugin would configure as their own project's parser).
- `vitest` (dev) — test runner.

## Testing

`src/rules/go-indent.test.ts`, using ESLint's `RuleTester` wired to Vitest:

```ts
import { RuleTester } from "eslint";
RuleTester.describe = describe;
RuleTester.it = it;
```

`RuleTester` is configured with `@typescript-eslint/parser` so interface and
type syntax parses correctly.

Cases per node kind (class, interface, type-literal, object expression):

- Correctly indented — valid, no errors.
- One tab too few — invalid, reports, autofix corrects it.
- One tab too many — invalid, reports, autofix corrects it.
- Spaces instead of tabs — invalid, reports, autofix replaces with tabs.
- Nested constructs (e.g. object literal inside a class field, interface
  inside... nested object type) — each level checked independently.
- Single-line construct — exempt, no errors.
- Two members on the same line — skipped, no errors reported for that line.

## Non-goals / future work

- Enforcing indentation of arbitrary statements/blocks outside the four
  tracked node kinds.
- Configurable indent character/width.
- Handling multiple members per line.
