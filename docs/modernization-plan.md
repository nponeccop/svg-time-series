# Codebase modernization plan

Status: proposal (no code changes yet)
Date: 2026-09-08
Scope: whole monorepo (`svg-time-series`, `segment-tree-rmq`, `samples`) plus tooling, CI and docs

## 1. Baseline: what was measured

Everything below was run on a clean checkout of `master` with `npm ci` (Node 22.22.2, npm 10.9.7):

| Check                  | Result                                                          |
| ---------------------- | --------------------------------------------------------------- |
| `npm run lint`         | pass (0 warnings)                                               |
| `npm run format:check` | pass                                                            |
| `npm run typecheck`    | pass                                                            |
| `npm test`             | pass — 44 files, 235 tests, ~11 s                               |
| `npm run build`        | pass — `svg-time-series/dist/draw.js` 151.88 kB (41.75 kB gzip) |

So this is **not** a rescue job. The repo already has: ESM everywhere, TypeScript 5.9 with a genuinely strict
`tsconfig.base.json` (`noUncheckedIndexedAccess`, `exactOptionalPropertyTypes`, `noPropertyAccessFromIndexSignature`),
ESLint 9 flat config on `strictTypeChecked`, Vitest 3, Vite 7, Prettier, commitlint + husky + lint-staged,
workspaces, Dependabot, and a decent unit-test suite. The modernization work is therefore about **closing gaps that
the green checks do not see**, not about a rewrite.

Findings are grouped by theme; each one names the evidence. The phased plan is in §9.

## 2. Packaging: the published artifact is wrong

**2.1 The library bundles its own copy of d3 (highest-impact finding).**
`svg-time-series/dist/draw.js` contains **zero `import` statements** — `rollup-plugin-node-externals` is registered
under `build.rollupOptions.plugins` (`svg-time-series/vite.config.ts:17-19`), where it never takes effect. Consumers
therefore receive a private copy of d3-brush/dispatch/scale/selection/shape/zoom _and_ of `segment-tree-rmq`.
Beyond size, this breaks object identity: the public API accepts `D3ZoomEvent`/`ZoomTransform` from the _caller's_
d3-zoom, while internals use the bundled one.

Verified fix (measured locally): move `nodeExternals()` into the top-level `plugins` array →
**151.88 kB → 35.9 kB**, with `d3-brush`, `d3-dispatch`, `d3-scale`, `d3-selection`, `d3-shape`, `d3-zoom` and
`segment-tree-rmq` emitted as real imports. One-line change; needs a regression test (§7.1) so it cannot silently
come back.

**2.2 Undeclared and stale dependencies.**

- `d3-array` is imported by `src/chart/axisData.ts` but is **not** declared in `svg-time-series/package.json`. It
  resolves only through npm's hoisting of a transitive copy, and because externalization is dependency-list-driven it
  gets silently inlined into the bundle even after 2.1 is fixed.
- `d3-timer` is declared as a runtime dependency but is imported nowhere; `src/utils/drawProc.ts` uses raw
  `requestAnimationFrame`. (README and `CLAUDE.md` still list d3-timer as part of the design.)
- `geometry-polyfill` is a runtime dependency but is only used by `src/setupDom.ts`, which exists to make jsdom
  work in tests. Modern browsers all ship `DOMMatrix`/`DOMPoint`.
- `samples` declares `buffer` — unused (the only textual hit is `buffered: true` in `samples/measure.ts`).

**2.3 No `exports` map, and the public API is too small to use.**
`svg-time-series/package.json` exposes `main: dist/draw.js` + `types: dist/draw.d.ts` with no `exports`, no
`sideEffects: false`, no `engines`. In practice the API is incomplete: the reference legend implementation reaches
into library internals by relative path — `samples/LegendController.ts:3-8` imports
`../svg-time-series/src/utils/domNodeTransform.ts`, `../svg-time-series/src/utils/drawProc.ts` and
`../svg-time-series/src/chart/legend.ts`. Anyone implementing `ILegendController` from npm cannot do that.

**2.4 Metadata drift.** `repository: "streamcode9/svg-time-series"` in `svg-time-series/package.json` (the remote is
`nponeccop/svg-time-series`); the README badges point at `streamcode9`; the root package and `LICENSE` say MIT while
both publishable workspaces declare `WTFPL`. Pick one license and make the three places agree.

**2.5 No sourcemaps are published** (`sourcemap: !isProd` in `svg-time-series/vite.config.ts`), and `vite-plugin-dts`
warns that its bundled API Extractor uses TS 5.8.2 against a 5.9.3 project.

## 3. Runtime versions and dependency majors

`.node-version`, `.github/workflows/ci.yml` and `netlify.toml` all pin **Node 20, which reached end-of-life on
2026-04-30**; `AGENTS.md` says "Node 20 or later" while `.devcontainer/devcontainer.json` uses the Node 22 image.
Recommendation: standardize on **Node 24** (active LTS) and test 22 + 24 in CI.

Majors currently available (from `npm outdated`):

| Package              | In repo | Latest | Notes                                                       |
| -------------------- | ------- | ------ | ----------------------------------------------------------- |
| eslint / @eslint/js  | 9.39    | 10.x   | flat config already in place; mostly a rule-set audit       |
| typescript-eslint    | 8.54    | 8.70   | patch-level, do first                                       |
| vitest               | 3.2     | 5.x    | two majors; config surface + `environment` handling changed |
| vite                 | 7.3     | 8.x    | affects library build and samples dev server                |
| jsdom / @types/jsdom | 26 / 21 | 30     | may remove some of the polyfilling in `setupDom.ts`         |
| @commitlint/\*       | 19.8    | 21.x   | straightforward                                             |
| lint-staged          | 16.2    | 17.x   | straightforward                                             |
| eslint-plugin-n      | 17.23   | 18.x   | re-check the `node: { version }` setting at the same time   |
| vite-plugin-dts      | 4.5     | 5.x    | should clear the API Extractor/TS mismatch warning          |
| typescript           | 5.9     | 7.x    | native compiler — **evaluate, gated**, see §9 Phase 2       |
| plotly.js / @types   | 3.x     | 4.x    | `samples/competitors` only                                  |

TypeScript 7 is the one upgrade that should not be taken on faith: it only lands once `typescript-eslint`,
`vite-plugin-dts`/API Extractor and Vitest's type tests all work under it. Treat it as a spike with a documented
go/no-go, not a scheduled bump.

Also: `"prepare": "husky install"` (root `package.json`) is the deprecated husky-9 form and is removed in husky 10 —
it should just be `husky`.

## 4. The type-safety gaps the strict config cannot see

Strict mode is on, but nine places deliberately step around it. These are the ones worth fixing, in descending order
of risk:

1. **Reflective re-wiring of the zoom behavior** — `src/draw.ts:337-347` casts `ZoomState` to
   `{ zoomBehavior?: { on?: (type, cb) => unknown } }`, checks `typeof … === "function"`, and re-registers a `"zoom"`
   handler that `ZoomState`'s constructor already registered (`src/chart/zoomState.ts:94-96`). Two owners for one
   d3-zoom callback, connected by a cast. Fix: have `ZoomState` accept a `beforeZoom` hook in its constructor and
   delete the cast.
2. **A fabricated axis model** — `src/chart/render.ts:131-133` builds `{ scale }` and casts it
   `as unknown as AxisModel` to reuse `updateAxisIfChanged`. Fix: narrow the helper's parameter to
   `{ scale: … }` (its only field used) instead of the full model.
3. **`undefined as unknown as Selection<…>`** — `src/chart/render.ts:149`, in `destroy()`. Fix: make the field
   optional, or drop the whole `RenderState` instance on teardown (which `draw.ts` already does).
4. **Untyped event payloads** — `ChartEventHandler = (payload: unknown) => void` (`src/draw.ts:30`) means every
   consumer casts; `samples/demos/common.ts:66-76` relies on bivariance to pass narrower handlers. Fix: a
   `ChartEventMap` interface (`{ afterZoom: D3ZoomEvent<…>; brushEnd: [number, number] | null; dataUpdate: number[]; … }`)
   and generic `on<K extends keyof ChartEventMap>`.
5. **The two-axis ceiling is baked into the data layer while the render layer is already generic** —
   `ChartData` has `seriesByAxis: [number[], number[]]`, `axes: [AxisData, AxisData]`, casts `axis as 0 | 1` /
   `axisIdx as 0 | 1`, and validation rejects any axis index other than 0/1 (`src/chart/data.ts:38-46`), whereas
   `setupRender` derives `axisCount` from the data and loops (`src/chart/render.ts:233-238`). Generalizing
   `ChartData` to N axes removes six casts and the `!` definite-assignment fields, and only then does the "only two
   Y axes" rule become a documented product decision rather than an implementation artifact.
6. **`src/chart/zoomState.ts`** declares two structurally identical local interfaces
   (`D3ZoomEventWithSource`, `SchedulerEvent`) and casts scheduler events back to `D3ZoomEvent` twice. Fix: one
   `ZoomEventLike` type, and let `ZoomScheduler` be generic over it.
7. **`src/chart/series.ts:59-62`** casts a `select()` result through `unknown` purely to change the parent datum
   type; the `Selection<…, HTMLElement, unknown>` parameterization used throughout the codebase is wrong for
   SVG-parented nodes and is the root cause. A single `ChartSelection<E>` alias fixes it repo-wide.
8. **`src/setupDom.ts`** is a test-only shim living in `src/` (two casts, plus a hand-rolled `SVGSVGElement`
   polyfill class). Move it to `test/`, drop the runtime dependency (§2.2), and re-check what jsdom 30 still needs.
9. **`src/axis.ts` hygiene** — the file starts with a UTF-8 BOM, its `import` statements sit at line 27 _after_
   executable code, and the class is called `MyAxis`. It is the vendored fast fork of `d3-axis` and the heart of the
   perf story, so it should stay — but rename it (`TickAxis`), move the imports, drop the BOM, and decide on the
   unused dual-scale (`scale2`) path, which no production call site uses (`grep -rn "new MyAxis"` → `render.ts` twice
   with one scale, plus tests and two excluded sample benchmarks). **Decision needed:** delete `scale2` and its
   ~40 lines of tick-merging logic, or document it as public API.

## 5. Samples and demos: 291 type errors CI never sees

`samples`' `typecheck` script runs `tsc --noEmit -p tsconfig.test.json`, whose `include` is `["*.ts", "test/**/*.ts",
"../test/**/*.ts"]` — the top-level files only. `demos/`, `benchmarks/`, `misc/` and `competitors/` are excluded from
the type check, and `eslint.config.js:22-27` additionally ignores `samples/benchmarks/**`, `samples/unused/**` and
`samples/misc/demo2-bug-60/**`. Running the real project config surfaces the gap:

```
$ cd samples && npx tsc --noEmit -p tsconfig.json   # 291 errors
   51  benchmarks/path-segment-recreate-dom/index.ts
   39  misc/demo2-bug-60/index.ts
   38  benchmarks/path-recreate-dom/index.ts
   …
   11  demos/common.ts        # <- the shipped demo
```

Related dead weight:

- `samples/unused/` holds three pre-TypeScript `.js` demos that are still **built and deployed to Netlify**
  (`samples/vite.config.ts` inputs `unused-d3-axes-grad`, `unused-d3-fixedaxis`, `unused-d3-pan-zoom`).
- `samples/misc/demo2-bug-60/` imports a module that no longer exists and is excluded from the build with a comment
  (`samples/vite.config.ts:89`); it accounts for 39 of the 291 errors.
- The dev/demo alias maps `svg-time-series` to **source** (`samples/vite.config.ts:15-19`), so nothing in the repo
  ever exercises the published package — which is how §2.1 stayed unnoticed.
- `.gitignore` is a ~300-line Visual Studio/.NET template carrying rules for a directory layout that no longer
  exists (`benchmarks/d3-myaxis-ts/*.js`, `js/**/*.js`, a repo-root `/*.js`).

## 6. Performance work that is actually still on the table

The library's headline claim is 60 FPS, and the drawing path is already careful (rasterizer-side transforms, RMQ
autoscale, RAF batching, matrix-equality guards, `d`-attribute caching). Two things in the _data_ path are not:

**6.1 Appending a point is O(N), twice over.** `SlidingWindow.append` does `data.push(values); data.shift()`
(`src/chart/slidingWindow.ts:43-48`) — an O(N) memmove per point — and then `ChartData.append` invalidates every
axis index, so the next frame rebuilds a whole `SegmentTree` from a fresh `data.map(…)` allocation
(`src/chart/axisData.ts:52-66`). `SegmentTree` already has an O(log N) `update` (`segment-tree-rmq/src/index.ts:51`),
it just cannot be used while indices shift under the window. Fix: make the window a **ring buffer** and teach the
RMQ index about rotation (or keep a fixed-capacity tree and update the rotating leaf). This turns streaming appends
from O(N) into O(log N) and removes a per-append allocation spike.

**6.2 Row-of-arrays storage.** Data lives as `number[][]` — one JS array per timestamp. A flat `Float64Array` with a
`seriesCount` stride would cut allocation and improve locality, but it means replacing `d3-shape`'s `line()` with a
small path builder. **Do this only if a benchmark justifies it**: add the bench first (`svg-time-series/bench/`
already has the harness), then decide.

Neither of the two headline perf claims is currently guarded by CI: `vitest bench` and
`scripts/run-browser-benchmarks.mjs` (Tachometer) exist but no workflow runs them, and the README's FPS table is from
an i5-4670/GTX 660 desktop.

## 7. Test and CI gaps

**7.1 No packaging test.** Nothing asserts what ends up in the tarball. Add a smoke test that runs
`npm pack`, unpacks it into a temp dir, imports it, and asserts (a) `d3-*` and `segment-tree-rmq` appear as external
imports, (b) `.d.ts` resolves, (c) the entry mounts a chart in jsdom. This is the guard for §2.1/§2.3.

**7.2 No coverage at all** — no `@vitest/coverage-*`, no `vitest.config.ts` anywhere (the root `vitest run` relies on
per-file `@vitest-environment jsdom` directives). Add a root Vitest workspace config with V8 coverage, publish the
report in CI, and set a floor at the measured baseline rather than an aspirational number.

**7.3 CI runs one Node version, no browser, no perf, no build-of-samples.** Proposed jobs: lint/format/commitlint
(as today), unit tests on Node 22 + 24 with coverage, the packaging smoke test, a `samples` build, a Playwright
smoke test that loads `demo1`/`demo2` and asserts the SVG structure from `docs/dom-structure.md` plus no console
errors, and a manually-triggerable Tachometer job. Dependabot covers npm at `/` only — add the
`github-actions` ecosystem and group the d3/eslint/vitest families so the bump PRs stop arriving one at a time.

**7.5 `npm run typecheck` silently depends on build output.** `svg-time-series` resolves `segment-tree-rmq`
through the sibling workspace's `dist/index.d.ts`, so a checkout whose `segment-tree-rmq/dist` is missing (a fresh
clone before any build, or a `dist` clean) fails type checking with `TS2307: Cannot find module
'segment-tree-rmq'` — the `prepare` script masks it after `npm ci`. Fix with TypeScript project references, or a
`"development"`/source condition in `segment-tree-rmq`'s `exports` so type checking reads `src`.

**7.4 The pre-commit hook runs the full `lint + typecheck + test`** (`.husky/pre-commit`, and again in `pre-push`).
That is ~30 s+ per commit and duplicates CI. Recommendation: pre-commit = `lint-staged` only, pre-push = typecheck +
tests, and let CI be authoritative.

## 8. Docs

- `README.md`: badges point at the old `streamcode9` org; "Install Node.js 20.x"; the benchmark table has no date or
  library version; the API example passes `zoomHandler`/`mouseMoveHandler` positionally.
- `CLAUDE.md`: says "D3.js v3.x packages (d3-zoom, d3-scale, …, d3-timer)" — they are the _v3 releases of the
  individual d3 modules_, and `d3-timer` is not used at all (§2.2).
- `AGENTS.md` still says Node 20.
- `docs/` has a single page (`dom-structure.md`). Generated API docs (typedoc) plus a short "why it is fast" page
  (the `docs/` half of the README's "Secrets of Speed") would carry their weight.

## 9. Proposed sequencing

Each phase is independently shippable and ends green on `npm run lint && npm run format:check && npm run typecheck &&
npm test`. Sizes are rough: **S** ≈ half a day, **M** ≈ 1-2 days, **L** ≈ 3-5 days.

### Phase 0 — Guardrails first (S)

No behavior change; makes every later phase verifiable.

1. Root Vitest config + V8 coverage, baseline recorded in CI.
2. Packaging smoke test (§7.1) — it **fails** on today's bundle, which is the point.
3. CI: Node 22 + 24 matrix, coverage artifact, `samples` build job, Dependabot `github-actions` + grouping.
4. Make `typecheck` independent of build output (§7.5) — project references or a source export condition.

### Phase 1 — Packaging and dependency hygiene (S-M)

5. Fix externalization (§2.1) — smoke test from Phase 0 goes green, bundle 152 kB → 36 kB.
6. Declare `d3-array`; drop `d3-timer`; move `geometry-polyfill` to devDependencies and `setupDom.ts` to `test/`;
   drop `buffer` from samples.
7. Add `exports` (root + a `./legend`-style subpath or re-exports for `drawProc`/`updateNode`/legend types),
   `sideEffects: false`, `engines`, publish sourcemaps; fix `repository`, license and README badges (§2.4).
8. `prepare: "husky"`; slim the husky hooks (§7.4); replace `.gitignore` with a Node/Vite one.
9. Point one sample (or the smoke test) at the **built** package so §2.1 cannot regress.

### Phase 2 — Toolchain majors (M)

10. Node 24 everywhere (`.node-version`, CI, `netlify.toml`, devcontainer, `AGENTS.md`, README).
11. typescript-eslint 8.70 → ESLint 10 → commitlint 21, lint-staged 17, eslint-plugin-n 18 (one PR each).
12. Vitest 3 → 5, jsdom 26/@types 30, Vite 7 → 8, vite-plugin-dts 5.
13. **Spike, gated:** TypeScript 7. Go/no-go on typescript-eslint + dts + Vitest support; keep 5.9 if any blocks.

### Phase 3 — Type-safety and API (M-L)

14. `ChartSelection<E>` alias; kill the seven `as unknown as` casts (§4.1-4.3, 4.6, 4.7).
15. Typed `ChartEventMap` for `on`/`off` (§4.4) — a breaking change for consumers who typed handlers loosely;
    ship with the release in Phase 6.
16. Generalize `ChartData` to N axes (§4.5); keep the 2-axis limit only if it is a real product decision, and then
    enforce it in one place with a clear error.
17. `axis.ts` hygiene + rename, and the `scale2` decision (§4.9).
18. Split `TimeSeriesChart` (375 lines, 16 public members, 12 of them mirrored again through `publicInteraction`) into
    chart / interaction-facade / event-bus. Worth doing _after_ items 14-17, since those remove most of the coupling.

### Phase 4 — Samples (M)

19. Delete `samples/unused/` and `samples/misc/demo2-bug-60/`, and their `vite.config.ts` inputs.
20. Fix the remaining sample type errors and put **all** of `samples` under `typecheck` and ESLint (§5). Expect this
    to be the bulk of the phase; do it directory by directory, starting with `demos/` (11 errors, user-facing).
21. Playwright smoke test for `demo1`/`demo2` (§7.3).

### Phase 5 — Performance and platform (L, benchmark-gated)

22. Ring-buffer window + rotation-aware RMQ updates (§6.1). Bench before/after with the existing harness.
23. `ResizeObserver`-driven resize (today `resize()` must be called by hand; there is no `ResizeObserver` anywhere in
    the repo) and unify hover on pointer events (`draw.ts` mixes `mousemove` with `pointerdown/up` for the cursor).
24. Accessibility: no `role`/`aria-*` is emitted on the generated SVG and there is no keyboard pan/zoom. At minimum
    `role="img"` + a configurable label, focusable zoom overlay, arrow-key pan and +/- zoom, and honour
    `prefers-reduced-motion`.
25. Only if item 22 shows the data path still dominates: `Float64Array` storage + hand-rolled path builder (§6.2).
26. Wire `vitest bench` into CI and a manual Tachometer job; refresh the README benchmark table with dates and
    hardware.

### Phase 6 — Release engineering (S-M)

27. Changesets (or equivalent) + a `release` workflow with npm provenance; a CHANGELOG; publish `segment-tree-rmq`
    and `svg-time-series` from CI rather than by hand.
28. typedoc API docs published with the samples site; a migration note for the Phase 3 breaking changes; move
    `svg-time-series` off `0.1.0`.

## 10. Non-goals

- No framework wrappers (React/Vue/Svelte) — out of scope for this plan.
- No canvas/WebGL renderer; the SVG-plus-transforms approach is the point of the project.
- No replacement of the vendored `axis.ts` with stock `d3-axis` — the fork exists because upstream would not take
  the perf fixes (README, "Improvements over Stock D3 examples").
- No move off npm workspaces (to pnpm/turbo). Worth revisiting only if CI time becomes a problem; note that pnpm's
  strict resolution would have caught §2.2 on day one.
- No test-framework change; Vitest is current.

## 11. Open decisions for the maintainer

1. **License**: MIT (root + `LICENSE` + README) or WTFPL (both workspace manifests)? They disagree today.
2. **Two Y axes**: hard product limit, or an implementation artifact to be generalized (§4.5)?
3. **`axis.ts` dual-scale (`scale2`)**: public feature or dead code (§4.9)?
4. **Breaking changes**: is the typed event API + any `exports` tightening acceptable in a `0.x` minor, or should it
   wait for a `1.0`?
5. **TypeScript 7**: adopt as soon as the ecosystem allows, or stay on 5.9 through this plan?
6. **`samples/unused/` and `misc/demo2-bug-60/`**: delete, or keep as historical artifacts outside the build?
