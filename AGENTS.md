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
  Keep the `extensions()` entry point decoupled from the class shapes: it has an explicit
  `@returns {FlowExtension}` (a typedef of `{ activate, deactivate }`), so consumers program against
  that contract. The `ElementExtensions`/`ProcessExtensions`/`SubProcessExtensions` classes **are**
  exported from `index.js` and therefore do appear in the `.d.ts` (including the `ExtensionHandlers`
  typedef their `extensions` member carries). dts-buddy does **not**
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
- **Tests**: feature tests are BDD with **mocha-cakes-2** (`Feature/Scenario/Given/When/Then`);
  the `test/src` **unit tests use plain mocha `describe`/`it`** (the mocha-cakes-2 UI keeps both, so
  one `.mocharc.cjs` `ui` setting covers the whole suite). Flows under test are
  authored programmatically with **bpmn-moddle** via `ProcessBuilder` (`test/helpers/factory.js`),
  then run on a **real bpmn-elements `Definition`** (not bpmn-engine) via `test/helpers/testHelpers.js`.
  `expect` is a **global** — `.mocharc.cjs` does `require: 'chai/register-expect.js'`, so test files
  don't import it (it's also declared in the eslint test-files globals).
- **Tests are type-checked** with `tsc -p test/tsconfig.json` (extends the root config: `checkJs`,
  `noEmit`, `noImplicitAny` off — plain-JS tests, so only real type mismatches surface;
  `test/globals.d.ts` declares `expect` and the mocha-cakes-2 globals). The name-import
  (`@0dep/bpmn-extensions`) resolves through the `types` export condition to the generated
  `types/index.d.ts`, so this checks the **published** surface; `test/src` unit tests pull raw
  `src/` JSDoc in as well. Conventions this forces: a service function that reads `this` annotates
  `/** @this {import('bpmn-elements').Activity} */` (that is what `serviceFn.call(activity, ...)`
  binds); minimal unit-test fakes are cast with `/** @type {any} */ (...)` rather than fleshed out.
  Known upstream (bpmn-elements) type gaps worked around here: `IScripts.getScript` is declared to
  return a bare `Script` (ours can return undefined — any-cast in `FeelScripts`), and the
  `services` record's `CallableFunction` says nothing about `this`.
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
  (process activation needs **bpmn-elements >= 18.0.3**; the peer dep floor is **>= 18.0.12**,
  set by same-instance resume — see Stop / recover / resume). `ProcessExtensions`
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
- **Business rule tasks**: bpmn-elements maps `bpmn:BusinessRuleTask` to the **ServiceTask**
  behaviour (`ServiceTask as BusinessRuleTask`), so a `zeebe:taskDefinition` one just works as a job
  worker. A `zeebe:calledDecision` one resolves `decisionId` via an environment service (same
  `JobService` trick, bound to the decision id — we don't evaluate DMN) and its result is named by
  `resultVariable`. `resultVariable` handling in `ElementExtensions.#formatOnExecuted` is shared by
  script tasks (`zeebe:script`) and business rule tasks (`script || calledDecision`): the single
  result is wrapped as `{ [resultVariable]: result }` (a plain job result is merged whole instead).
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
- **Stop / recover / resume** works: on resume, an activity stopped mid-execution re-activates with
  a redelivered `run.execute`; one stopped between start and execute (e.g. on the start event, or
  mid start-listener) re-activates with a redelivered `run.start` and re-formats — hence the
  `message.fields.redelivered` branch in `ElementExtensions`/`SubProcessExtensions.activate`.
  Same-instance resume of those in-between states needs **bpmn-elements >= 18.0.12** (earlier
  versions stalled or skipped re-activation — the peer dep floor and the devDep are set
  accordingly; recover-into-fresh was always fine). `recover-feature.js` covers it — a user task, io output preserved across a stop,
  a sub process, and same-instance stop/resume (mid-wait and on the start event). Recovery may re-invoke a service that had
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
- **Message subscription** (`zeebe:subscription`): correlation is **app-layer routing** — we only
  resolve and expose. The subscription rides on the referenced `bpmn:Message` element (not the
  catching element); the instantiated bpmn-elements `Message` strips `behaviour`, so
  `getExtensions` reads it off the raw serialized context — `context.definitionContext` — which is
  the reason `getExtensions`/`ElementExtensions` take the context argument.
  The `correlationKey` FEEL is resolved in the activity scope on enter and exposed as
  content `subscription: { message: { id, name }, correlationKey }` (visible on `activity.wait` /
  `getPostponed()`); the app matches an incoming message against it and signals that specific api.
  Delivery filtering stays out of bpmn-elements — broadcast signal matches by message id only, the
  targeted per-execution api path is the discriminator. Known edges (fine, forgiving): a top-level
  message start event resolves against an empty scope → `undefined`; a multi-instance receive task
  resolves once on enter, not per iteration. Tests: `message-feature.js`.
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

User-task priority/schedule. The
`zeebe-bpmn-moddle` schema covers these — extend `getExtensions.js`/`extendFn` and add a module per element.
