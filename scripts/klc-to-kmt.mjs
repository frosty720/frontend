// One-off: relabel the native token KLC -> KMT in user-facing text.
//
//   node scripts/klc-to-kmt.mjs            # dry run, prints every line it would change
//   node scripts/klc-to-kmt.mjs --apply
//
// Only standalone occurrences are touched: the pattern requires a non-word character (or
// start/end of line) on both sides. That deliberately protects
//   derivedKLC      - a field name in the V3 subgraph schema; renaming breaks the query
//   formatKLCAmount / parseKLCAmount / useKLCBalance - identifiers
//   wKLC, KLC_ADDRESS, KLC_PRICE - prefixed/suffixed identifiers
// all of which contain "KLC" but are not labels.
//
// SKIP list holds files where "KLC" is still correct: the cutover notice exists precisely to
// tell users KLC became KMT, so rewriting it would make it nonsense.
import fs from 'node:fs'
import path from 'node:path'

const ROOT = path.join(path.dirname(new URL(import.meta.url).pathname), '..', 'src')
const APPLY = process.argv.includes('--apply')
// Files where "KLC" is still the correct word:
//   CutoverNotice.tsx  - exists to tell users KLC became KMT
//   tokens.ts          - normalizeSymbol keeps KLC beside KMT on purpose, so pre-relaunch
//                        symbols in cached/user data still resolve (see its comment)
//   wrappedNative.test - asserts symbolsMatch('KMT','KLC') === false, i.e. that they differ
const SKIP = new Set(['CutoverNotice.tsx', 'tokens.ts', 'wrappedNative.test.ts'])
// Lines mixing the wrapped symbol are symbol-matching logic, not labels — left for review.
const SKIP_LINE = /wKLC|WKLC/
const EXT = new Set(['.ts', '.tsx'])

const RE = /(^|[^A-Za-z0-9_])KLC(?![A-Za-z0-9_])/g

function walk(dir, out = []) {
	for (const name of fs.readdirSync(dir)) {
		const p = path.join(dir, name)
		const st = fs.statSync(p)
		if (st.isDirectory()) walk(p, out)
		else if (EXT.has(path.extname(name))) out.push(p)
	}
	return out
}

let files = 0
let hits = 0
for (const file of walk(ROOT)) {
	if (SKIP.has(path.basename(file))) continue
	const src = fs.readFileSync(file, 'utf8')
	if (!RE.test(src)) continue
	RE.lastIndex = 0
	const lines = src.split('\n')
	const changed = []
	const skipped = []
	const out = lines.map((l, i) => {
		if (SKIP_LINE.test(l)) {
			if (RE.test(l)) skipped.push([i + 1, l.trim()])
			RE.lastIndex = 0
			return l
		}
		const next = l.replace(RE, '$1KMT')
		if (next !== l) changed.push([i + 1, l.trim(), next.trim()])
		return next
	})
	if (!changed.length && !skipped.length) continue
	if (changed.length) files++
	hits += changed.length
	console.log(`\n${path.relative(ROOT, file)}`)
	for (const [n, before, after] of changed) {
		console.log(`  ${n}: - ${before.slice(0, 118)}`)
		console.log(`  ${' '.repeat(String(n).length)}  + ${after.slice(0, 118)}`)
	}
	for (const [n, l] of skipped) console.log(`  ${n}: SKIPPED (wrapped-symbol logic) ${l.slice(0, 100)}`)
	if (APPLY && changed.length) fs.writeFileSync(file, out.join('\n'))
}
console.log(`\n${APPLY ? 'APPLIED' : 'DRY RUN'}: ${hits} occurrence(s) across ${files} file(s)`)
if (!APPLY) console.log('re-run with --apply to write')
