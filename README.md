# @0dep/bpmn-extensions

[![Built latest](https://github.com/zerodep/bpmn-extensions/actions/workflows/build-latest.yaml/badge.svg)](https://github.com/zerodep/bpmn-extensions/actions/workflows/build-latest.yaml)[![Coverage Status](https://coveralls.io/repos/github/zerodep/bpmn-extensions/badge.svg?branch=main)](https://coveralls.io/github/zerodep/bpmn-extensions?branch=main)

Flow extensions for [bpmn-elements](https://github.com/paed01/bpmn-elements) with
[FEEL](https://www.omg.org/dmn/) expression support.

It teaches a bpmn-elements engine to run BPMN that uses the `zeebe:*` extension elements and FEEL
expressions (`= ...`) — the counterpart to [`@onify/flow-extensions`](https://github.com/onify/flow-extensions),
which covers the older `camunda:*` extension elements.

## Install

```sh
npm install @0dep/bpmn-extensions bpmn-elements croner
```

`bpmn-elements` (>= 18) and [`croner`](https://www.npmjs.com/package/croner) (cron timer cycles) are
peer dependencies. Requires Node.js >= 22.

## What it does

- **FEEL expressions** — a `FeelExpressions()` adapter resolves FEEL (`= order.total > 100`)
  everywhere bpmn-elements resolves an expression, including sequence flow conditions.
- **Environment services in FEEL scope** — every FEEL expression can call the environment services
  as functions, namespaced under `services` (e.g. a condition `= services.isEligible(order)`).
  This strays from strict Camunda 8 conformance on purpose: unlike functions smuggled through
  variables, services survive `getState()`/`recover()` — state is JSON-serialized (functions are
  dropped), while services are re-supplied by the host at recover time — so service-backed
  conditions are resume-safe. A variable named `services` shadows the overlay.
- **`zeebe:script`** — a `FeelScripts()` adapter runs a script task's FEEL `expression` and assigns
  the result to its `resultVariable`.
- **`zeebe:taskDefinition`** — maps a service task's job `type` to an environment service (job worker).
- **`zeebe:calledDecision`** — a business rule task resolves its `decisionId` via an environment
  service (you bring the decision; we don't evaluate DMN) and assigns the result to `resultVariable`.
- **`zeebe:ioMapping`** — input mapping on entry (parent scope) and output mapping on completion
  (job-result scope), with dotted `target` paths. Propagates across boundaries: a call activity's
  input reaches the called process and its output maps the called process result back; a sub
  process's input becomes variables local to its children.
- **`zeebe:taskHeaders`** / **`zeebe:properties`** — exposed on the element content.
- **`zeebe:assignmentDefinition`** — assignee / candidate users / groups for user tasks.
- **`zeebe:priorityDefinition`** / **`zeebe:taskSchedule`** — a user task's `priority` and
  `dueDate` / `followUpDate` resolved onto the element content for a task list to order and
  remind by; FEEL date results are exposed as ISO 8601 strings.
- **`zeebe:formDefinition`** — resolves a user task's form (`formId` / `formKey` / `externalReference`,
  `bindingType`) onto the element content for a task list to render.
- **`zeebe:executionListeners`** — blocking start/end job workers around an element, called as
  `(elementApi, { retries, headers }, callback)` (`retries` and `headers` present only when the
  listener declares them).
- **`zeebe:calledElement`** — call activity target process id.
- **`zeebe:loopCharacteristics`** — collection-based multi-instance (`inputCollection` / `inputElement`),
  sequential or parallel, with `outputElement` aggregated into the `outputCollection` array in input order.
- **Timer start events with cron** — a `TimerEventDefinition` that also parses a **cron** `timeCycle`
  (`0 0 * * *`, as Camunda 8 schedules timer start events) besides ISO 8601 intervals. A top-level
  timer start event's cycle is lifted onto its behaviour as `scheduledStart` by `extendFn` and exposed
  on the start event content, so a scheduler can find the flows to start without running them.
- **`zeebe:subscription`** — the referenced message's `correlationKey` is resolved when the catching
  element (receive task, message event) starts waiting, and exposed on its content as
  `subscription: { message, correlationKey }` — route an incoming message by matching it against the
  waiting elements (`getPostponed()`) and signalling the right one.

## API

- `extensions(element, context)` — the flow extensions factory; pass it as an environment extension.
  Elements that carry no zeebe extension data (and nothing else to format) get no extension attached
  at all and run untouched; call activities and processes are always attached, since they propagate
  io across process boundaries.
- `extendFn(behaviour)` — moddle-context-serializer behaviour extender (lifts the extension data
  bpmn-elements expects on the behaviour: call activity process id, multi-instance collection, and a
  timer start event's cycle as `scheduledStart`).
- `TimerEventDefinition` — a bpmn-elements timer event definition that accepts cron `timeCycle`s;
  install it through the type resolver: `TypeResolver({ ...elements, TimerEventDefinition })`.
- `FeelExpressions()` — a bpmn-elements `IExpressions` implementation backed by FEEL.
- `FeelScripts()` — a bpmn-elements `scripts` implementation that runs `zeebe:script` FEEL expressions.
- FEEL helpers: `isFeelExpression`, `stripFeel`, `evaluateFeel`, `evaluateFeelUnaryTest`, `resolveValue`,
  `getFeelScope` (the scope every expression is evaluated in: `services` + environment variables + local overlay).
- `JobService`, `ServiceError`, `FormatError`.

## Usage

Wire it into a bpmn-elements definition (see `test/helpers/testHelpers.js` for the full helper):

```javascript
import { createRequire } from 'node:module';
import { strict as assert } from 'node:assert';
import { BpmnModdle } from 'bpmn-moddle';
import * as elements from 'bpmn-elements';
import { Serializer, TypeResolver } from 'moddle-context-serializer';
import { extensions, extendFn, FeelExpressions, FeelScripts } from '@0dep/bpmn-extensions';

const require = createRequire(import.meta.url);
const moddle = new BpmnModdle({ zeebe: require('zeebe-bpmn-moddle/resources/zeebe.json') });

const source = `<?xml version="1.0" encoding="UTF-8"?>
<definitions xmlns="http://www.omg.org/spec/BPMN/20100524/MODEL" xmlns:zeebe="http://camunda.org/schema/zeebe/1.0" id="def">
  <process id="orders" isExecutable="true">
    <startEvent id="start" />
    <sequenceFlow id="to-charge" sourceRef="start" targetRef="charge" />
    <serviceTask id="charge">
      <extensionElements>
        <zeebe:taskDefinition type="charge-card" />
        <zeebe:ioMapping>
          <zeebe:input source="= order.total" target="amount" />
          <zeebe:output source="= transactionId" target="receipt.id" />
        </zeebe:ioMapping>
      </extensionElements>
    </serviceTask>
    <sequenceFlow id="to-end" sourceRef="charge" targetRef="end" />
    <endEvent id="end" />
  </process>
</definitions>`;

const moddleContext = await moddle.fromXML(source);
const serializer = Serializer(moddleContext, TypeResolver(elements), extendFn);

const definition = new elements.Definition(elements.Context(serializer), {
  expressions: FeelExpressions(),
  scripts: FeelScripts(),
  extensions: { flowExtensions: extensions },
  variables: { order: { total: 199 } },
  services: {
    'charge-card'(elementApi, callback) {
      // elementApi.content.input  — resolved zeebe:ioMapping input (here `{ amount: 199 }`)
      // elementApi.content.headers — resolved zeebe:taskHeaders
      callback(null, { transactionId: 'tx-1' }); // becomes the job variables for output mapping
    },
  },
});

definition.once('leave', () => {
  console.log(definition.environment.output); // { receipt: { id: 'tx-1' } }
  assert.deepEqual(definition.environment.output, { receipt: { id: 'tx-1' } });
});
definition.run();
```

A service task's `zeebe:taskDefinition type="charge-card"` is dispatched to the environment
service named `charge-card`. Its callback result is the job's variables, which `zeebe:ioMapping`
output parameters map back into the process.

## Extract timers

List the timers of a definition without running it — e.g. to schedule flows by their timer start
event. The serializer collects every timer event definition; `extendFn` marks a timer start event's
cycle as `scheduledStart`, and the cron-capable `TimerEventDefinition` parses each one to its next
expiry:

```javascript
import { createRequire } from 'node:module';
import { strict as assert } from 'node:assert';
import { BpmnModdle } from 'bpmn-moddle';
import * as elements from 'bpmn-elements';
import { Serializer, TypeResolver } from 'moddle-context-serializer';
import { extendFn, TimerEventDefinition } from '@0dep/bpmn-extensions';

const require = createRequire(import.meta.url);
const moddle = new BpmnModdle({ zeebe: require('zeebe-bpmn-moddle/resources/zeebe.json') });

const source = `<?xml version="1.0" encoding="UTF-8"?>
<definitions xmlns="http://www.omg.org/spec/BPMN/20100524/MODEL" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance" id="def">
  <process id="nightly" isExecutable="true">
    <startEvent id="start">
      <timerEventDefinition>
        <timeCycle xsi:type="tFormalExpression">0 1 * * *</timeCycle>
      </timerEventDefinition>
    </startEvent>
    <sequenceFlow id="to-task" sourceRef="start" targetRef="task" />
    <userTask id="task" />
    <boundaryEvent id="reminder" cancelActivity="false" attachedToRef="task">
      <timerEventDefinition>
        <timeDuration xsi:type="tFormalExpression">R3/PT1M</timeDuration>
      </timerEventDefinition>
    </boundaryEvent>
  </process>
</definitions>`;

const moddleContext = await moddle.fromXML(source);
const serializer = Serializer(moddleContext, TypeResolver({ ...elements, TimerEventDefinition }), extendFn);

const dummyActivity = { id: 'dummy', broker: {}, environment: { Logger() {} } };
const timers = serializer.getTimers().map((t) => ({
  ...t,
  parsed: new TimerEventDefinition(dummyActivity, { type: t.timer.type, behaviour: t.timer }).parse(t.timer.timerType, t.timer.value),
}));

console.log(timers.map((t) => [t.parent.id, t.timer.timerType, t.timer.value, t.parsed.expireAt]));
assert.equal(timers.length, 2);
assert.equal(timers[0].parent.id, 'start');
assert.ok(timers[0].parsed.expireAt instanceof Date);

// A timer start event is a schedule: the cycle is lifted onto the behaviour
assert.equal(serializer.getActivityById('start').behaviour.scheduledStart, '0 1 * * *');
```

## Development

```sh
npm test           # mocha (BDD, mocha-cakes-2) + lint + run README examples (texample)
npm run test:md     # run the README javascript examples with texample
npm run dist        # bundle the CommonJS build with rollup
npm run types       # generate types/index.d.ts from JSDoc with dts-buddy
npm run format      # eslint --fix && prettier --write
```

Flows under test are authored programmatically with `bpmn-moddle` via the `ProcessBuilder` helper
in `test/helpers/factory.js`, then run on a real bpmn-elements `Definition`. The test harness wires
the engine's `Logger` to the [`debug`](https://www.npmjs.com/package/debug) package, so
`DEBUG=bpmn-extensions:* npm test` traces the engine and extensions (`:error:*` for errors only).

# Ecosystem

- [0dep.se/run](https://0dep.se/run) — Run a BPMN diagram in the browser: `bpmn-elements` wired with `@0dep/bpmn-extensions`, drawn with bpmn-js; step through, signal waiting tasks, and drop DMN files for business rule tasks.
- [bpmn-engine](https://github.com/paed01/bpmn-engine) — BPMN 2.0 execution engine wrapping `bpmn-elements`; the batteries-included way to run, stop, resume, and recover flows.
- [bpmn-middleware](https://github.com/zerodep/bpmn-middleware) — Express middleware exposing the engine over HTTP, with pluggable state storage.
- [@onify/flow-extensions](https://github.com/onify/flow-extensions) — Onify Flow extensions for `bpmn-elements`.
- [dmn-elements](https://github.com/zerodep/dmn-elements) — Executable DMN 1.3 decision elements; back a Business Rule Task with it (see [Conformance](/docs/Conformance.md#business-rule-task-and-dmn)).

## License

MIT
