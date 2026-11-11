'use strict'

const fs = require('node:fs')
const path = require('node:path')
const { spawnSync } = require('node:child_process')
const { parse, compileTemplate } = require('@vue/compiler-sfc')
const root = path.resolve(__dirname, '..')
const excluded = new Set(['.git', '.codex', 'node_modules', '.tools', '.artifacts', 'dist', 'coverage', 'tmp', 'temp', 'exports', 'screenshots', 'test-results', 'playwright-report'])
const localOnly = new Set([
  'project.config.json', 'project.private.config.json',
  'src/config.local.json', 'src/version.json', 'src/manifest.json',
  'cloudfunctions/xishiTuotuoApi/local-config.json',
])
const failures = []
const files = []
function visit(directory) {
  for (const item of fs.readdirSync(directory, { withFileTypes: true })) {
    if (excluded.has(item.name) || item.name.startsWith('.env')) continue
    const absolute = path.join(directory, item.name)
    if (item.isDirectory()) visit(absolute)
    else if (item.isFile()) files.push(absolute)
  }
}
visit(root)
const relative = (filename) => path.relative(root, filename).split(path.sep).join('/')
const read = (filename) => fs.readFileSync(filename, 'utf8').replace(/^\uFEFF/, '')
const report = (filename, message) => failures.push(`${relative(filename)}: ${message}`)
let javascriptCount = 0
let jsonCount = 0
for (const filename of files) {
  const extension = path.extname(filename)
  if (extension === '.vue') {
    const parsed = parse(read(filename), { filename })
    for (const error of parsed.errors) report(filename, String(error))
    if (parsed.descriptor.script?.lang !== 'ts') report(filename, 'Vue components must use TypeScript')
    if (parsed.descriptor.template) {
      const result = compileTemplate({ source: parsed.descriptor.template.content, filename, id: relative(filename) })
      for (const error of result.errors) report(filename, String(error))
    }
  }
  if (extension === '.json') {
    jsonCount++
    try { JSON.parse(read(filename)) } catch (error) { report(filename, error.message) }
  }
  if (extension !== '.js' && extension !== '.cjs') continue
  javascriptCount++
  const result = spawnSync(process.execPath, ['--check', filename], { encoding: 'utf8', windowsHide: true })
  if (result.error || result.status !== 0) report(filename, result.error?.message || result.stderr.trim() || 'Syntax check failed')
  const imports = read(filename).matchAll(/\brequire\s*\(\s*(['"])(\.{1,2}\/[^'"]+)\1\s*\)/g)
  for (const match of imports) {
    const modulePath = path.resolve(path.dirname(filename), match[2])
    const candidates = [modulePath, modulePath + '.js', modulePath + '.cjs', modulePath + '.json', path.join(modulePath, 'index.js'), path.join(modulePath, 'index.cjs')]
    if (!candidates.some((candidate) => fs.existsSync(candidate) && fs.statSync(candidate).isFile())) {
      report(filename, `Missing relative module ${match[2]}; generate local configuration with npm run setup if needed`)
    }
  }
}

const appPath = path.join(root, 'src/pages.json')
let pageCount = 0
try {
  const app = JSON.parse(read(appPath))
  const pages = app.pages.map(page => page.path)
  pageCount = pages.length
  if (!pageCount || new Set(pages).size !== pages.length) report(appPath, 'Missing or duplicate pages')
  for (const page of pages) {
    if (!/^[\w/-]+$/.test(page) || page.includes('..') || !fs.existsSync(path.join(root, 'src', page + '.vue'))) report(appPath, 'Missing or invalid Vue page: ' + page)
  }
} catch (error) { report(appPath, error.message) }

// Inspect shared product files, not local generated configuration or identity test fixtures.
const sharedRoots = ['src/', 'cloudfunctions/']
const sharedFiles = new Set(['README.md', 'README.en.md', 'AGENTS.md', 'project.config.template.json', 'package.json'])
const scan = files.filter((filename) => {
  const name = relative(filename)
  return !localOnly.has(name) && (sharedFiles.has(name) || sharedRoots.some((prefix) => name.startsWith(prefix))) && /\.(?:js|ts|vue|cjs|json|md)$/.test(name)
})
const envExample = path.join(root, '.env.example')
if (fs.existsSync(envExample)) scan.push(envExample)
for (const filename of scan) {
  const source = read(filename)
  if (/\bwx[0-9a-f]{16}\b/i.test(source)) report(filename, 'A real-looking AppID must not be in shared source; use local configuration')
  if (/\bcloud\d+-[a-zA-Z0-9_-]+\b/i.test(source)) report(filename, 'A deployment environment ID must not be in shared source; use local configuration')
  if (/\bquickstart\b/i.test(source)) report(filename, 'Remove the starter template content')
}
if (failures.length) {
  for (const failure of failures) console.error(failure)
  console.error(`Static checks failed: ${failures.length} problem(s)`)
  process.exitCode = 1
} else {
  console.log(`Static checks passed: ${javascriptCount} JavaScript files, ${jsonCount} JSON files, ${pageCount} registered pages`)
}
