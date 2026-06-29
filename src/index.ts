import type { Loader, LoaderContext } from 'astro/loaders'
import { readdir, stat } from 'node:fs/promises'
import { createRequire } from 'node:module'
import { join, relative, sep } from 'node:path'
import * as tyhtml from '@isomtop/tyhtml'

// Vite's SSR transform drops extra named exports from native addons.
// Use createRequire to get the full native binding directly.
const tyhtmlNative: {
    compileTypst: typeof tyhtml.compileTypst
    compileTypstSync: (input: string, options?: unknown) => ReturnType<typeof tyhtml.compileTypst> extends Promise<infer R> ? R : never
} = createRequire(import.meta.url)('@isomtop/tyhtml')

export interface TypstLoaderOptions {
    base?: string
    compile?: {
        pretty?: boolean
        bodyOnly?: boolean
        noMetadata?: boolean
        metadataLabel?: string
        fontPaths?: string[]
    }
    silent?: boolean
}

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

export function computeId(absBase: string, absPath: string): string {
    return relative(absBase, absPath).split(sep).join('/').replace(/\.typ$/, '')
}

async function pathExists(p: string): Promise<boolean> {
    try {
        await stat(p)
        return true
    } catch {
        return false
    }
}

/**
 * Astro Content Layer loader for Typst files.
 *
 * In dev mode, the watch handler compiles on change/add/unlink and writes
 * to the store synchronously (using the NAPI sync variant). Content updates
 * are visible immediately; Vite's occasional `astro:server-app.js` error
 * during full reload is cosmetic and does not affect correctness.
 */
export function typstLoader(options: TypstLoaderOptions = {}): Loader {
    const base = options.base ?? './'
    const compile = options.compile ?? { pretty: true, bodyOnly: true }
    const silent = options.silent ?? false

    return {
        name: 'typst',
        load: async (context: LoaderContext): Promise<void> => {
            const { store, parseData, logger, watcher } = context
            const absBase = join(process.cwd(), base)
            const files = await findTypFiles(absBase)

            logger.info(`typst loader: found ${files.length} file(s) under ${base}`)

            const untouchedEntries = new Set(store.keys())
            const fileToId = new Map<string, string>()

            const compileFile = async (absPath: string): Promise<void> => {
                const relPath = relative(absBase, absPath)
                const id = computeId(absBase, absPath)
                try {
                    const result = await tyhtml.compileTypst(absPath, compile)
                    const rawData = result.metadata
                        ? (JSON.parse(result.metadata) as Record<string, unknown>)
                        : {}
                    const parsed = await parseData({ id, data: rawData })
                    store.set({ id, data: parsed, body: result.html })
                    fileToId.set(absPath, id)
                    untouchedEntries.delete(id)
                    if (!silent) {
                        for (const w of result.warnings) {
                            logger.warn(`${relPath}: ${w.message}`)
                        }
                    }
                } catch (err) {
                    const msg = err instanceof Error ? err.message : String(err)
                    logger.error(`Failed to compile ${relPath}: ${msg}`)
                }
            }

            for (const absPath of files) {
                await compileFile(absPath)
            }
            for (const id of untouchedEntries) {
                store.delete(id)
                for (const [p, eid] of fileToId) {
                    if (eid === id) fileToId.delete(p)
                }
            }

            if (!watcher) return
            if (!(await pathExists(absBase))) return
            watcher.add(absBase)
            logger.info(`typst loader: watching ${absBase}`)

            const matchesTyp = (p: string): boolean => p.endsWith('.typ')

            const onUpsert = (changedPath: string): void => {
                if (!matchesTyp(changedPath)) return
                const relPath = relative(absBase, changedPath)
                const id = computeId(absBase, changedPath)
                try {
                    const result = tyhtmlNative.compileTypstSync(changedPath, compile)
                    const rawData = result.metadata
                        ? (JSON.parse(result.metadata) as Record<string, unknown>)
                        : {}
                    const data: Record<string, unknown> = {
                        ...rawData,
                        pubDate: new Date(rawData.pubDate as string),
                        category: (rawData.category as string) ?? 'misc',
                        tags: (rawData.tags as string[]) ?? [],
                        draft: (rawData.draft as boolean) ?? false,
                    }
                    store.set({ id, data, body: result.html })
                    fileToId.set(changedPath, id)
                    untouchedEntries.delete(id)
                    if (!silent && result.warnings.length) {
                        for (const w of result.warnings) {
                            logger.warn(`${relPath}: ${w.message}`)
                        }
                    }
                    logger.info(`Updated ${relPath}`)
                } catch (err) {
                    const msg = err instanceof Error ? err.message : String(err)
                    logger.error(`Failed to update ${relPath}: ${msg}`)
                }
            }

            const onUnlink = (deletedPath: string): void => {
                if (!matchesTyp(deletedPath)) return
                const id = fileToId.get(deletedPath)
                if (id) {
                    store.delete(id)
                    fileToId.delete(deletedPath)
                    logger.info(`Removed ${relative(absBase, deletedPath)}`)
                }
            }

            watcher.on('change', onUpsert)
            watcher.on('add', onUpsert)
            watcher.on('unlink', onUnlink)
        },
    }
}
