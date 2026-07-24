# go-indent rule v2: gofmt-style column alignment

## Problem

The `go-indent` rule currently enforces tab-depth indentation for `class`,
`interface`, `type` (object-shaped), and object-literal bodies. The desired
behavior has changed: instead of (or in addition to) tab depth, gofmt-style
struct field alignment is wanted — padding member names/types so that the
values line up in a column, e.g.:

```ts
type User = {
	id:       string;
	username: string;
	password: string;
	name:     string;
}
```

This is a **replacement**, not an addition: the previously-built tab-depth
checks (`checkContainer`, `getMembers`, `checkClosingBrace`, base-indent
tracking, and their ~16 existing tests) are removed entirely. The rule keeps
its name, `go-indent`, but its sole responsibility going forward is column
alignment. It no longer inspects or fixes leading indentation at all — only
the padding between a member's name and its value(s).

## Scope

All four previously-tracked node kinds participate:

- `ObjectExpression` (`Property` members)
- `TSInterfaceBody` (`TSPropertySignature` / etc. members)
- `TSTypeLiteral` (same member kinds as interfaces)
- `ClassBody` (`PropertyDefinition` members)

## Grouping: contiguous runs

Within one body, a **contiguous run** is a maximal sequence of consecutive
**conforming** members with nothing breaking the sequence between them. Each
run is aligned independently, with its own column widths computed only from
its own members — matching gofmt's behavior of resetting alignment at any
gap in a struct.

A run breaks (without being touched itself) at:

- a blank line between two members,
- a comment line between two members,
- a **non-conforming member** (see below) — which itself is left alone and
  also ends whatever run preceded it; the next conforming member after it
  starts a new run.

A member is **non-conforming** if any of the following is true:

- it is a method/function member (class method, interface call/construct
  signature, etc.),
- it has a computed key (`[x]: y`),
- it is a spread element (`...x`),
- it is an index signature,
- its value or type annotation spans multiple source lines.

## Column-splitting algorithm

For each conforming member, split its own source text into up to three cells
using the first `:` and the first `=` it contains, in whichever order/count
actually occur in that member:

- **Cell 1**: everything up to the first `:` or `=` token. This covers the
  identifier name plus any leading modifiers (`readonly`, `private`,
  `public`, `protected`, `static`) and a trailing `?` optional marker — no
  special-casing is needed for these; they are just part of the cell 1 text.
- **Cell 2**: the text between that first separator and a second `=`
  separator, if one exists after it. For `name: Type;`, cell 2 is `Type`.
  For `name = value;` (no colon), there is no cell 2 — the `=` itself is the
  first and only separator found, so this shape has cell 1 (`name`) directly
  followed by cell 3 (`value`).
- **Cell 3**: the text after a second separator (`=`), if one exists.

This single algorithm serves all four node kinds without per-kind branching
beyond extracting each member's raw text:

- `type`/`interface`/object-literal members always resolve to exactly cells
  1 and 2 (name, value) — a single alignment gap, right after the colon.
- Class fields resolve to 1, 2, or 3 cells depending on which of a type
  annotation and an initializer are present.

## Padding rule

For each column index, compute the maximum cell width across the run — but
only counting rows that have a **following** cell to align. A row's own last
present cell is never padded (no trailing whitespace is ever introduced).

Concretely, within one run:

- `name;` (class field, no type, no initializer): cell 1 only. Not padded.
  Still contributes its raw width to cell 1's max-width computation for
  neighboring rows that do have a following cell.
- `name = value;`: cells 1 and 3 (no cell 2). `=` (and `value`) is padded to
  align at cell 1's max width across the run.
- `name: Type;`: cells 1 and 2. `Type` is padded to align at cell 1's max
  width across the run.
- `name: Type = value;`: cells 1, 2, and 3. `Type` aligns at cell 1's max
  width; `value` aligns at cell 2's max width, computed only from the subset
  of rows in the run that themselves have both a cell 2 and a cell 3.

This reproduces the original request exactly for `type`/`interface`/object
literals (single-gap alignment after the colon), and generalizes to the
mixed shapes a class body can contain.

## Rule shape

- Same `ESLintUtils.RuleCreator`-based rule, same name `go-indent`, same four
  visitor keys.
- `meta.type: "layout"`, `fixable: "whitespace"`.
- New message id (the old `wrongIndentation` no longer applies): e.g.
  `misalignedColumn`, reported once per member whose padding doesn't match
  the run's computed column width, with a `fix` that rewrites the padding
  whitespace for that cell boundary.

## Testing

Same tooling (Vitest + ESLint's `RuleTester`), test file rewritten from
scratch since the behavior under test is entirely different from v1.

Cases per node kind (`type`/`interface`/object-literal — these three share
identical member shape, so are tested together; `class` separately for its
extra shapes):

- Simple aligned run — valid, no errors.
- Misaligned run — invalid, reports, autofix corrects it.
- Two separate runs split by a blank line — each aligned independently to
  its own column width (proves grouping, not just single-run alignment).
- A comment line splitting a run — same independent-alignment proof.
- A non-conforming member (e.g. a method) splitting a run — the method
  itself is untouched; the runs before and after it are each aligned
  independently.
- Class-only: a run mixing `name;`, `name = value;`, `name: Type;`, and
  `name: Type = value;` members — proves the multi-column cell algorithm.

## Non-goals / out of scope

- Leading indentation (tab depth) — entirely dropped from this rule's
  responsibility.
- Aligning across multiple runs, or across nested bodies.
- Configurable alignment character or column rules.
