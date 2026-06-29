# tyhtml-astro

Astro Content Layer loader for [tyhtml](https://www.npmjs.com/package/tyhtml) — compile `.typ` files to HTML at build time.

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
       ↓ (each file → tyhtml.compileTypst on a worker thread)
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

## License

MIT — see [LICENSE](./LICENSE).