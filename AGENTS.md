# AGENTS.md

Significant context and decisions for `@0dep/bpmn-extensions`. Keep this current as the project evolves.

## What this is

Flow extensions for **bpmn-elements (>= 18, peer dep)** that run BPMN using the `zeebe:*` extension
elements and FEEL. The counterpart to `@onify/flow-extensions` (which covers the older `camunda:*`
elements); modeled on that project's architecture but adapted for the `zeebe:*` elements and FEEL.

## Key decisions

- **Forgiving, not validating.** This project executes flows; it does not validate them. Read
  whatever extension data is present, resolve it, and run. Do not add checks that reject a model
  for missing/contradictory configuration (e.g. a user task with no form or implementation) — that
  is the modeler's/platform's job. Missing data just means the corresponding behaviour is skipped.
- **Package name**: `@0dep/bpmn-extensions`.
- **Module format**: dual. Source is ESM (`src/`, `type: module`); the CommonJS build is bundled
  with **rollup** into `dist/`. `feelin` is ESM-only so it is **bundled into the CJS output**;
  `bpmn-elements` stays external (peer dep). A generated `dist/package.json` (`{"type":"commonjs"}`)
  marks the bundle as CommonJS — required because the root package is `type: module`.
- **Types**: generated from JSDoc with **dts-buddy** into `types/index.d.ts` (`npm run types`,
  also run by `prepack`; `tsconfig.json` is dts-buddy's config). `types/` is gitignored like `dist/`.
  Keep the public surface clean by **not** leaking the internal extension classes: `extensions()`
  has an explicit `@returns {FlowExtension}` (a typedef of `{ activate, deactivate }`), so the
  `ElementExtensions`/`ProcessExtensions`/etc. shapes never reach the `.d.ts`. dts-buddy does **not**
  honour `stripInternal`, so don't rely on `@internal` to hide members — use `#private` methods
  (which TS omits) or keep them off the public return types. **JSDoc must reference real
  bpmn-elements type names** or `tsc` rejects the generated `.d.ts` (`TS2694`): the element api is
  `import('bpmn-elements').IApi<any>` (there is no `Api`); other valid names are `Activity`,
  `Process`, `ContextInstance`, `IExpressions`, `IScripts`. (Consumers need `skipLibCheck` anyway —
  `bpmn-moddle`, reached transitively via `moddle-context-serializer`, ships no types.)
- **Method privacy**: class-internal methods use `#private` (hash). The exception is the three
  handlers shared from `ElementExtensions` to its `SubProcessExtensions` subclass
  (`_onEnter`/`_onExecuted`/`_onListener`) — JS has no `protected`, and `#private` isn't visible to
  subclasses, so these stay `_`-prefixed and tagged `@internal`.
- **Node 22** (`engines: ">=22"`, `.node-version`). Use `fnm use` (the dev uses fnm). Tests import
  the moddle schema with `import ... with { type: 'json' }` (eslint `ecmaVersion: 'latest'`).
- **Tests**: BDD with **mocha-cakes-2** (`Feature/Scenario/Given/When/Then`). Flows under test are
  authored programmatically with **bpmn-moddle** via `ProcessBuilder` (`test/helpers/factory.js`),
  then run on a **real bpmn-elements `Definition`** (not bpmn-engine) via `test/helpers/testHelpers.js`.
  `expect` is a **global** — `.mocharc.cjs` does `require: 'chai/register-expect.js'`, so test files
  don't import it (it's also declared in the eslint test-files globals).
- **README examples are executed** with **texample** (`npm run test:md`, part of `posttest` and
  `test:lcov`). It runs every ` ```javascript ` block and **ignores** ` ```js ` blocks — so a
  runnable, self-contained example uses `javascript`; a non-runnable snippet uses `js`. The example
  imports the package by name (`@0dep/bpmn-extensions`), resolved via the package self-reference to
  `src/index.js` (the `import` export condition) — no build needed.
- **Temp files** go in `tmp/` (gitignored).

## How it works (the non-obvious bits)

- **FEEL convention**: a value starting with `=` is a FEEL expression; anything else is a static
  literal. `FeelExpressions()` plugs into the bpmn-elements environment `expressions` option and
  replaces the default `${...}` resolution. `feelin`'s `evaluate()` returns `{ value, warnings }`
  — always unwrap `.value`.
- **`$type` is PascalCase** in the serialized moddle context (`zeebe:TaskDefinition`), even though
  the XML tag is lowerCase (`<zeebe:taskDefinition>`). Switch on PascalCase in `getExtensions.js`.
- **Extension contract**: `extensions(element, context)` returns an object with `activate(message)`
  / `deactivate(message)`; bpmn-elements calls these for activities **and processes**
  (process activation needs **bpmn-elements >= 18.0.3** — the peer dep floor). `ProcessExtensions`
  subscribes to `process.enter` in `activate()` (called on `run.enter`, just before the event is
  published). Activity formatting and async work (io, execution listeners) are injected through the
  activity's `format-run-q` queue so the activity waits for them — see `ElementExtensions`.
- **Sub-processes need their own extension class** (`SubProcessExtensions`, routed for
  `bpmn:SubProcess` / `bpmn:AdHocSubProcess` / `bpmn:Transaction`). A sub-process shares its broker
  with its children, so child `activity.*` events bubble through it. Subscribing with
  `activity.on(...)` as a leaf does would fire the handlers for every child and spam the
  sub-process format queue, **stalling the sub-process** (it sits `executing` with nothing pending
  inside). The fix mirrors `@onify`: subscribe on the broker and filter to `activity.id ===
message.content.id`. Regression test: the `mother-of-all-feel` resource in `resources-feature.js`.
- **Environments are cloned per scope.** Within one process, all activities share one environment,
  so `environment.assignVariables(...)` propagates output-mapped variables to downstream FEEL. The
  definition has a _separate_ environment; process `environment.output` is bubbled up to
  `definition.environment.output` on completion (DefinitionExecution). So output mapping writes to
  **both** process variables (downstream visibility) and `environment.output` (final result).
- **Service tasks**: `zeebe:taskDefinition type="x"` → the environment service named `x`. The
  service callback result becomes the job variables that `zeebe:ioMapping` output operates on. With
  no output mapping, the whole job result is merged into the process.
- **Io mapping propagation across processes.** (1) **input** — bpmn-elements (>= 18.0.4) forwards a
  call activity's formatted input (its io mapping + the multi-instance loop element) on the called
  process's `content.inbound[0].input`, but exposes it nested under `input`; `ProcessExtensions`
  promotes it to **top-level** variables on enter (so they are addressable by name). (2) **output** — a call
  activity wraps the called process output as `{ executionId, output }`; `ElementExtensions`
  unwraps it (`type === 'bpmn:CallActivity'`) before applying the call activity's output mapping.
  (3) **sub process input** — for `bpmn:SubProcess`/`AdHocSubProcess`/`Transaction` the input
  mapping is `assignVariables`'d (local-ish, shared scope) so children see it; for a service
  task/call activity the input stays on the content (passed to the worker / propagated), not the
  variables. Tests: `io-propagation-feature.js` + `call-activity-io.bpmn` / `sub-process-io.bpmn`.
- **Sequence flow conditions** need no custom flow class: a `conditionExpression` body of `= ...`
  with no language flows through bpmn-elements' default `ExpressionCondition` into `FeelExpressions`.
- **Stop / recover / resume** works: on resume, activities re-activate with a redelivered `run.start`
  message and the extensions re-format (hence the `message.fields.redelivered` branch in
  `ElementExtensions`/`SubProcessExtensions.activate`). `recover-feature.js` covers it — a user task,
  io output preserved across a stop, and a sub process. Recovery may re-invoke a service that had
  completed before the stop, so workers should be idempotent.
- **Execution listeners** are job workers, and they **block**: the activity waits (via the
  `format-run-q` mechanism in `ElementExtensions._onListener`) for a start listener to finish before
  it executes, and for an end listener to finish before it leaves — async listeners included. A
  listener service is called as `(elementApi, { retries, headers }, callback)` (options second-to-last).
  `retries`/`headers` are only present when the listener declares them — **no defaults are invented**.
  A `zeebe:taskDefinition` job worker keeps the plain `(executionMessage, callback)`
  signature (its headers ride on `content.headers`). Resource to eyeball: `execution-listeners.bpmn`.
- **Logging, not throwing.** Use the bpmn-elements logger (`activity.logger` / `elementApi.logger`,
  from the environment `Logger` factory; default is a no-op) to surface conditions rather than
  failing. Start small, mirroring `@onify/flow-extensions`: it logs `logger.error` on caught
  execution-listener errors (and timer-parse errors). The test harness wires `Logger` to the
  **`debug`** package, so `DEBUG=bpmn-extensions:*` (or `:error:*`) traces the engine and extensions.
- **Script tasks** (`zeebe:script`) run through the bpmn-elements `scripts` handler, not a Service:
  `ScriptTaskBehaviour` calls `environment.getScript(scriptFormat, activity)`. `FeelScripts()`
  ignores the (absent) script format, reads the FEEL `expression` off the element, and evaluates it.
  Install it on the environment via the `scripts` option (the harness does this by default). The
  FEEL result is assigned to the `zeebe:script` `resultVariable` in `ElementExtensions._formatOnExecuted`
  (which also lets `zeebe:ioMapping` output remap it).

## Layout

- `src/` — `index.js` (public API: `extensions`, `extendFn`, re-exports), `Expressions.js` (FEEL
  adapter), `feel.js` (feelin wrappers), `ElementExtensions.js` / `ProcessExtensions.js` /
  `SubProcessExtensions.js`, `getExtensions.js`, `extensions/*` (one module per `zeebe:*` element),
  `Errors.js`.
- **No `helpers`/`utils` files.** Inline trivial logic (e.g. `environment.variables`, the io-mapping
  `setPath`) at its single use site rather than extracting a shared helper. Prefer duplication over a
  catch-all utils module — DRY is not a goal here.
- `test/feature/*-feature.js` (behavioural BDD specs, `-feature.js` suffix), `test/helpers/`, and
  `test/src/<File>-test.js` (unit tests of a single `src` module — for real edge cases / guards
  that are awkward to reach through a full flow, e.g. a header with no key, a non-wrapped
  multi-instance output). `.mocharc.cjs` picks up both `*-feature.js` and `*-test.js`.
- `rollup.config.js` (CJS bundle), `tsconfig.json` (dts-buddy), `eslint.config.js`, `.mocharc.cjs`.
- `.claude/skills/camunda8-bpmn-schemas/` — reference skill for the `zeebe:*` schema + FEEL.

## Multi-instance (`zeebe:loopCharacteristics`)

`extendFn` maps the nested `zeebe:loopCharacteristics` onto the bpmn-elements multi-instance
behaviour: `inputCollection` → `loopCharacteristics.behaviour.collection` (a FEEL expression that
resolves to an array), `inputElement` → `elementVariable`. With `isSequential="false"` the
collection drives parallel instances. Regression/feature test:
`multi-instance-call-activity.bpmn` + `multi-instance-feature.js` (a parallel MI **call activity**
calling a sub process once per item).

**Per-item passing works** (bpmn-elements >= 18.0.4): `CallActivity` forwards the loop element
variable as part of the called process's input, and the `ProcessExtensions` input hook promotes it
to a top-level variable in the child — so each instance's `item` reaches the called sub process.

**Output collection.** bpmn-elements collects per-instance outputs into an index-keyed object on the
activity content (`{ 0: <out>, 1: <out>, ... }`; a call activity instance wraps its result as
`{ executionId, output }`). `LoopCharacteristics.aggregate` (wired in `ElementExtensions.#formatOnExecuted`)
reduces that to the `outputCollection` array by evaluating `outputElement` in each instance's
result scope, in input order.

## Not yet implemented

Called decisions, user-task priority/schedule, message `zeebe:subscription`. The
`zeebe-bpmn-moddle` schema covers these — extend `getExtensions.js`/`extendFn` and add a module per element.
