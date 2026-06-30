import { test } from 'node:test'
import { strict as assert } from 'node:assert'
import { sep } from 'node:path'
import { fileURLToPath } from 'node:url'
import { findTypFiles, computeId } from '../src/index.ts'

const FIXTURES = fileURLToPath(new URL('./fixtures/', import.meta.url))

test('findTypFiles recurses into nested directories and returns sorted absolute paths', async () => {
    const files = await findTypFiles(FIXTURES)
    // 3 .typ files: hello.typ, posts/intro.typ, posts/2026/first.typ
    assert.equal(files.length, 3)
    // Sorted (lexicographic): hello, posts/2026/first, posts/intro
    assert.equal(files[0].endsWith(`hello.typ`), true)
    assert.equal(files[1].endsWith(`posts${sep}2026${sep}first.typ`), true)
    assert.equal(files[2].endsWith(`posts${sep}intro.typ`), true)
})

test('findTypFiles skips non-.typ files', async () => {
    const files = await findTypFiles(FIXTURES)
    for (const f of files) {
        assert.match(f, /\.typ$/)
    }
})

test('findTypFiles returns empty array when directory does not exist', async () => {
    const files = await findTypFiles('/nonexistent/path/that/should/not/exist')
    assert.deepEqual(files, [])
})

test('computeId strips .typ extension and uses forward slashes', () => {
    const id = computeId(FIXTURES, `${FIXTURES}posts${sep}2026${sep}first.typ`)
    assert.equal(id, 'posts/2026/first')
})

test('computeId handles top-level files', () => {
    const id = computeId(FIXTURES, `${FIXTURES}hello.typ`)
    assert.equal(id, 'hello')
})

test('computeId produces forward slashes even on Windows', { skip: process.platform !== 'win32' }, () => {
    const winPath = `C:\\Users\\test\\posts\\intro.typ`
    const winBase = `C:\\Users\\test`
    const id = computeId(winBase, winPath)
    // No backslashes — Astro URLs require forward slashes.
    assert.equal(id.includes('\\'), false)
    assert.equal(id, 'posts/intro')
})