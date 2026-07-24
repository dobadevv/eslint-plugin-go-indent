# @dobadevv/eslint-plugin-go-fmt

An ESLint plugin that brings gofmt-style column alignment to TypeScript and
JavaScript: object literals, class bodies, interfaces, and type literals get
their `:` and `=` lined up into tidy columns, the same way `gofmt` aligns
struct fields.

```ts
// before
type User = {
	id: string;
	username: string;
};

// after `eslint --fix`
type User = {
	id:       string;
	username: string;
};
```

## Why this exists

Go's formatter doesn't just fix indentation — it aligns consecutive struct
fields, map entries, and var declarations into columns, so related lines read
as a block instead of a ragged list. Once you're used to scanning code that
way, everything else looks slightly unkempt.

TypeScript/JavaScript tooling (Prettier included) deliberately does *not* do
this: column alignment is fragile under refactors and Prettier avoids
"alignment as a stable feature" on principle. That's a reasonable stance for
a general-purpose formatter, but if you like the gofmt look and want it for
your `interface`, `type`, `class`, and object-literal bodies, this plugin
gives you an opt-in ESLint rule that does exactly that — and gets out of
Prettier's way once it has (see [Playing nice with Prettier](#playing-nice-with-prettier)).

## Install

```sh
npm install --save-dev @dobadevv/eslint-plugin-go-fmt
# or
pnpm add -D @dobadevv/eslint-plugin-go-fmt
```

Requires ESLint 9+ (flat config) and `@typescript-eslint/parser` if you want
the rule to apply to `.ts`/`.tsx` files.

## Usage

Flat config (`eslint.config.js`):

```js
import goFmt from "@dobadevv/eslint-plugin-go-fmt";
import tsParser from "@typescript-eslint/parser";

export default [
	{
		files: ["**/*.ts", "**/*.tsx"],
		languageOptions: {
			parser: tsParser,
		},
		plugins: {
			"go-fmt": goFmt,
		},
		rules: {
			"go-fmt/go-fmt": "error",
		},
	},
];
```

The rule is auto-fixable, so `eslint --fix` (or your editor's ESLint
integration) will realign columns for you.

## What gets aligned

The rule looks at four kinds of bodies:

- object literals — `{ a: 1, bb: 2 }`
- class bodies — fields and property initializers
- `interface` bodies
- `type` literal bodies

Within a body, it groups consecutive **conforming members** into a "run" and
aligns the `:` (and `=`, for default values) across that run into shared
columns, gofmt-style.

A member is conforming if it's a plain, single-line field/property — no
methods, no computed keys (`[x]: y`), no spreads, no function-valued
properties, and no multi-line values. Anything that doesn't conform breaks
the run.

A run ends whenever:

- a non-conforming member (method, spread, computed key, ...) is hit,
- there's a blank line between members,
- there's a comment between members, or
- two members share the same line.

Each run is realigned independently, so unrelated groups of fields don't
force each other's columns to match:

```ts
type T = {
	a:  number;
	bb: number;

	ccc:  number;
	dddd: number;
};
```

## Playing nice with Prettier

Prettier collapses aligned whitespace back down to a single space, which
would undo this rule's fix on the next format. To avoid that fight, when the
rule autofixes a run for the first time in a given statement, it also inserts
a `// prettier-ignore` comment above the enclosing statement (skipping it if
one is already present):

```ts
// prettier-ignore
type User = {
	id:       string;
	username: string;
};
```

That keeps the aligned block stable across both `eslint --fix` and
`prettier --write`.
