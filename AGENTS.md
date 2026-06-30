# AGENTS.md

Guidance for AI coding agents (Codex, Cursor, Claude Code, etc.) working in this repo. For humans, see [@README.md](./README.md).

## What this is

Astro Content Layer loader for `.typ` (Typst) files. One source file, ~190 lines, native Rust engine via the `@isomtop/tyhtml` peer dependency.

- Entry point: [@src/index.ts](./src/index.ts)
- Public API: `typstLoader`, `findTypFiles`, `computeId`, `TypstLoaderOptions` — all exported from [@src/index.ts](./src/index.ts)
- Tests: [@tests/loader.test.ts](./tests/loader.test.ts) (node:test, no test framework)
- Fixtures: [@tests/fixtures/](./tests/fixtures/)
- Package config: [@package.json](./package.json)
- TS config: [@tsconfig.json](./tsconfig.json)

## Commands

```bash
bun test                  # run tests
npx tsc --noEmit          # typecheck (tsc not in repo, use the local binary)
```

There is no `build`, `lint`, or `format` script. Do not invent one.

## Engine-mode contract (important)

`@isomtop/tyhtml` ships a `TyHtml` class — a long-lived engine that owns the Typst `Library` and the merged font entry set. The constructor is the explicit cold start (system-font discovery + scan of `engine.fontPaths`).

- Construct **once per loader**, reuse for every `compile` / `compileSync`.
- `engine.fontPaths` — scanned once at construction, merged with system fonts. Use this for static font dirs.
- `compile.fontPaths` — layered per call. Use this only when a specific compile needs extra dirs.

When changing font-path handling in [@src/index.ts](./src/index.ts), preserve this split. Do not move `engine.fontPaths` into the per-call `CompileOptions` — it defeats the cold-start caching.

## Codebase conventions

- The loader uses `createRequire` to grab the native binding directly because Vite's SSR transform drops extra named exports from native addons. Don't replace it with a static `import`.
- Initial load goes through Astro's `parseData` (so the collection schema validates the metadata). The dev-mode `onUpsert` watch handler writes a hand-shaped data object — this asymmetry is intentional: the watcher fires before the schema is reattached, and the schema defaults match the README example.
- `silent` flag suppresses per-file Typst warnings, not compile errors. Compile errors always log.
- The watch handler uses `engine.compileSync` (inline) intentionally — Vite evaluates dependent modules synchronously after a file event, so async would race. Don't "fix" this to async.

## When editing

- The package is published as raw TypeScript (`main: ./src/index.ts`); consumers compile via Vite. Do not add a `dist/` build step.
- The peer-dep range for `@isomtop/tyhtml` is `^0.1.0` — keep the version constraint aligned with what's actually installed in `node_modules/@isomtop/tyhtml/index.d.ts`.
- Public API additions (new exports from `typstLoader`, `findTypFiles`, etc.) need a docs update in [@README.md](./README.md) and a test in [@tests/loader.test.ts](./tests/loader.test.ts).

## Don'ts

- Don't add a worker-thread wrapper — `engine.compile` already runs on a worker.
- Don't add a `prepare` / prebuild script that compiles `.ts` → `.js`.
- Don't bump the `astro` peer range past what the repo has actually been tested against.
- Don't change `computeId`'s forward-slash contract — Astro URL routing assumes it.
