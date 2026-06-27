# @0dep/bpmn-extensions

[![Built latest](https://github.com/zerodep/bpmn-extensions/actions/workflows/build-latest.yaml/badge.svg)](https://github.com/zerodep/bpmn-extensions/actions/workflows/build-latest.yaml)[![Coverage Status](https://coveralls.io/repos/github/zerodep/bpmn-extensions/badge.svg?branch=main)](https://coveralls.io/github/zerodep/bpmn-extensions?branch=main)[![npm version](https://img.shields.io/npm/v/@0dep/bpmn-extensions)](https://www.npmjs.com/package/@0dep/bpmn-extensions)

Flow extensions for [bpmn-elements](https://github.com/paed01/bpmn-elements) with
[FEEL](https://www.omg.org/dmn/) expression support.

It teaches a bpmn-elements engine to run BPMN that uses the `zeebe:*` extension elements and FEEL
expressions (`= ...`) — the counterpart to [`@onify/flow-extensions`](https://github.com/onify/flow-extensions),
which covers the older `camunda:*` extension elements.

## Install

```sh
npm install @0dep/bpmn-extensions bpmn-elements
```

`bpmn-elements` (>= 18) is a peer dependency. Requires Node.js >= 22.

## What it does

- **FEEL expressions** — a `FeelExpressions()` adapter resolves FEEL (`= order.total > 100`)
  everywhere bpmn-elements resolves an expression, including sequence flow conditions.
- **`zeebe:script`** — a `FeelScripts()` adapter runs a script task's FEEL `expression` and assigns
  the result to its `resultVariable`.
- **`zeebe:taskDefinition`** — maps a service task's job `type` to an environment service (job worker).
- **`zeebe:ioMapping`** — input mapping on entry (parent scope) and output mapping on completion
  (job-result scope), with dotted `target` paths. Propagates across boundaries: a call activity's
  input reaches the called process and its output maps the called process result back; a sub
  process's input becomes variables local to its children.
- **`zeebe:taskHeaders`** / **`zeebe:properties`** — exposed on the element content.
- **`zeebe:assignmentDefinition`** — assignee / candidate users / groups for user tasks.
- **`zeebe:formDefinition`** — resolves a user task's form (`formId` / `formKey` / `externalReference`,
  `bindingType`) onto the element content for a task list to render.
- **`zeebe:executionListeners`** — blocking start/end job workers around an element, called as
  `(elementApi, { retries, headers }, callback)` (`retries` and `headers` present only when the
  listener declares them).
- **`zeebe:calledElement`** — call activity target process id.
- **`zeebe:loopCharacteristics`** — collection-based multi-instance (`inputCollection` / `inputElement`),
  sequential or parallel, with `outputElement` aggregated into the `outputCollection` array in input order.

## API

- `extensions(element, context)` — the flow extensions factory; pass it as an environment extension.
- `extendFn(behaviour)` — moddle-context-serializer behaviour extender (lifts the extension data
  bpmn-elements expects on the behaviour: call activity process id and multi-instance collection).
- `FeelExpressions()` — a bpmn-elements `IExpressions` implementation backed by FEEL.
- `FeelScripts()` — a bpmn-elements `scripts` implementation that runs `zeebe:script` FEEL expressions.
- FEEL helpers: `isFeelExpression`, `stripFeel`, `evaluateFeel`, `evaluateFeelUnaryTest`, `resolveValue`.
- `JobService`, `ServiceError`, `FormatError`.

## Usage

Wire it into a bpmn-elements definition (see `test/helpers/testHelpers.js` for the full helper):

```javascript
import { createRequire } from 'node:module';
import { strict as assert } from 'node:assert';
import BpmnModdle from 'bpmn-moddle';
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

See the `camunda8-bpmn-schemas` skill (`.claude/skills/`) for a reference of the `zeebe:*`
extension elements and FEEL.

## License

MIT
