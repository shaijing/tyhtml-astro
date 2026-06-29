# tyhtml-astro

Astro Content Layer loader for [tyhtml](https://www.npmjs.com/package/tyhtml) — compile `.typ` files to HTML at build time.

## When to use this

`tyhtml-astro` is a thin wrapper. If any of the following are deal-breakers for you, see [Alternatives](#alternatives) below:

- You need **SVG output** (e.g., for paged documents, math figures)
- You want **component-level rendering** (`<Typst code={...} />` inline in `.astro` files)
- You're on **Astro 3 or 4** (this package uses the Content Layer API introduced in Astro 5)

Otherwise, this package is the simplest path: ~100 lines, native Rust engine via `@isomtop/tyhtml`, Content Layer loader.

## Installation

```bash
npm install @isomtop/tyhtml-astro @isomtop/tyhtml
```

Both `@isomtop/tyhtml-astro` and `@isomtop/tyhtml` are required. `astro` should already be installed.

## Usage

```ts
// src/content.config.ts
import { defineCollection, z } from 'astro:content'
import { typstLoader } from '@isomtop/tyhtml-astro'

const typ = defineCollection({
    loader: typstLoader({
        base: './src/content/typ',
        compile: {
            pretty: true,
            bodyOnly: true,
            metadataLabel: 'meta',
        },
    }),
    schema: z.object({
        title: z.string(),
        pubDate: z.coerce.date(),
        tags: z.array(z.string()).default([]),
        draft: z.boolean().default(false),
    }),
})

export const collections = { typ }
```

```astro
---
// src/pages/typ/[...slug].astro
import { getCollection } from 'astro:content'

export async function getStaticPaths() {
    const posts = await getCollection('typ', ({ data }) => !data.draft)
    return posts.map(post => ({
        params: { slug: post.id },
        props: post,
    }))
}

const { post } = Astro.props
---
<article>
    <h1>{post.data.title}</h1>
    <time>{post.data.pubDate.toISOString().slice(0, 10)}</time>
    <Fragment set:html={post.body} />
</article>
```

## Typst fixture convention

Each `.typ` file should have a `<meta>` label with the frontmatter fields declared in your collection schema:

```typst
#let meta = (
  title: "Hello from Typst",
  pubDate: "2026-06-28",
  tags: ("intro", "tyhtml"),
  draft: false,
)

#metadata(meta) <meta>

= First heading

Body content here.
```

## Options

### `typstLoader(options)`

| Field | Type | Default | Description |
|---|---|---|---|
| `base` | `string` | `'./'` | Directory to scan, relative to project root. |
| `compile.pretty` | `boolean` | `true` | Pretty-print HTML output. |
| `compile.bodyOnly` | `boolean` | `true` | Strip `<!DOCTYPE>`/`<html>`/`<body>` wrapper. Set `false` to get full HTML. |
| `compile.noMetadata` | `boolean` | `false` | Skip `<meta>` query (faster). |
| `compile.metadataLabel` | `string` | `'meta'` | Label to query for metadata. |
| `compile.fontPaths` | `string[]` | `[]` | Additional font directories for typst. |

## How it works

```
src/content/typ/post.typ
       ↓ (recursively found)
       ↓ (each file → TyHtml.compile on a worker thread)
       ↓
┌──────────────────────────────────────┐
│  Astro Content Layer entry          │
│  id:    "post"                      │
│  data:  { title, pubDate, ... }     │ ← from <meta> label, JSON.parsed
│  body:  "<h1>...</h1>..."           │ ← compiled HTML
└──────────────────────────────────────┘
       ↓
set:html={post.body} renders the HTML
post.data.title etc. exposes frontmatter
```

The loader constructs a single `new TyHtml()` engine per loader instance. The constructor is the explicit cold start (Library build + system-font discovery), so every file compile after that reuses the cached state — per-file work is dominated by `typst::compile` itself.

## Alternatives

### [`astro-typst`](https://github.com/OverflowCat/astro-typst) by OverflowCat

A more feature-complete integration built on [`typst.ts`](https://github.com/Myriad-Dreamin/typst.ts) (WASM). Choose this if you need any of:

- **SVG output** — vector output for paged documents, math figures, charts
- **Component rendering** — `<Typst code={source} />` inline in `.astro` files
- **JS ↔ Typst data passing** — pass values from Astro to typst and query typst values back as typed AST
- **Internal cross-references** — `<Jump.astro>` snippet for in-document navigation
- **Astro 3 / 4 compatibility** — uses the legacy `addContentEntryType` API

Trade-offs vs. `tyhtml-astro`:

- Ships compiled JS in `dist/` (we ship raw TS, compiled on consumer side via Vite)
- Pulls 9 extra dependencies (we have 2 peerDeps: `@isomtop/tyhtml` + `astro`)
- WASM startup cost (~50–200ms first compile) vs. native `.node` (<10ms)
- No standalone `TyHtml` instance outside Astro (we expose it via the `@isomtop/tyhtml` peerDep — you can use `new TyHtml()` in scripts, build tools, etc.)

### Direct `pandoc`

If you only need one-shot `.typ` → HTML conversion (e.g., a docs build script), `pandoc 3.1.5+` has a built-in Typst reader/writer. No Astro integration needed.

## License

MIT — see [LICENSE](./LICENSE).