import type { Loader, LoaderContext } from 'astro/loaders'
import { readdir } from 'node:fs/promises'
import { join, relative, sep } from 'node:path'
import { compileTypst } from '@isomtop/tyhtml'

/** Options for the typst content loader. */
export interface TypstLoaderOptions {
    /** Directory to scan, relative to project root. Default: `'./'`. */
    base?: string
    /** Pass-through options for tyhtml's `compileTypst`. */
    compile?: {
        pretty?: boolean
        bodyOnly?: boolean
        noMetadata?: boolean
        metadataLabel?: string
        fontPaths?: string[]
    }
}

/** Recursively find every `.typ` file under `dir`. Returns absolute paths, sorted. */
export async function findTypFiles(dir: string): Promise<string[]> {
    const out: string[] = []
    async function walk(d: string): Promise<void> {
        let entries
        try {
            entries = await readdir(d, { withFileTypes: true })
        } catch {
            return
        }
        for (const e of entries) {
            const full = join(d, e.name)
            if (e.isDirectory()) {
                await walk(full)
            } else if (e.isFile() && e.name.endsWith('.typ')) {
                out.push(full)
            }
        }
    }
    await walk(dir)
    return out.sort()
}

/**
 * Convert an absolute file path under `absBase` into a stable id:
 * - forward slashes (cross-platform safe)
 * - relative to absBase
 * - `.typ` extension stripped
 *
 * Exported for testing.
 */
export function computeId(absBase: string, absPath: string): string {
    return relative(absBase, absPath).split(sep).join('/').replace(/\.typ$/, '')
}

/**
 * Astro Content Layer loader for Typst files.
 *
 * Scans `base` for `.typ` files, runs each through `tyhtml.compileTypst`,
 * and stores the compiled HTML as `body` and the `<meta>` JSON as `data`.
 *
 * @example
 * ```ts
 * // src/content.config.ts
 * import { defineCollection, z } from 'astro:content'
 * import { typstLoader } from '@isomtop/tyhtml-astro'
 *
 * const typ = defineCollection({
 *   loader: typstLoader({
 *     base: './src/content/typ',
 *     compile: { bodyOnly: true, metadataLabel: 'meta' },
 *   }),
 *   schema: z.object({ title: z.string(), pubDate: z.coerce.date() }),
 * })
 * ```
 */
export function typstLoader(options: TypstLoaderOptions = {}): Loader {
    const base = options.base ?? './'
    const compile = options.compile ?? { pretty: true, bodyOnly: true }

    return {
        name: 'typst',
        load: async (context: LoaderContext): Promise<void> => {
            const { store, parseData, logger } = context
            const absBase = join(process.cwd(), base)
            const files = await findTypFiles(absBase)

            logger.info(`typst loader: found ${files.length} file(s) under ${base}`)

            for (const absPath of files) {
                const relPath = relative(absBase, absPath)
                const id = computeId(absBase, absPath)

                try {
                    const result = await compileTypst(absPath, compile)

                    const rawData = result.metadata
                        ? (JSON.parse(result.metadata) as Record<string, unknown>)
                        : {}

                    const parsed = await parseData({ id, data: rawData })

                    store.set({ id, data: parsed, body: result.html })

                    for (const w of result.warnings) {
                        logger.warn(`${relPath}: ${w.message}`)
                    }
                } catch (err) {
                    const msg = err instanceof Error ? err.message : String(err)
                    logger.error(`Failed to compile ${relPath}: ${msg}`)
                }
            }
        },
    }
}