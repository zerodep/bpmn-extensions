# Changelog

## Unreleased

## v0.0.5 - 2026-08-24

### Breaking

- stop publishing on activity format queue if there is nothing to format

### Additions

- support task priority and task schedule, published on user task wait message as `priority`, `dueDate` and `followUpDate`

## v0.0.4 - 2026-08-17

- Environment services are in FEEL scope under `services`, callable as functions in every expression (conditions, io mapping, scripts, correlation keys, ...) — e.g. `= services.isEligible(order)`. Unlike functions passed through variables, services survive `getState()`/`recover()`, so they are resume-safe. A variable named `services` shadows the overlay. New exported helper `getFeelScope(environment, localVariables)` builds the scope.
- `FeelScripts` `getScript` declares `Script | undefined` (bpmn-elements fixed the upstream type).

## v0.0.3 - 2026-07-26

- Message `zeebe:subscription`: the correlation key is resolved on enter and exposed on the waiting element content as `subscription: { message, correlationKey }`, so the embedding application can route an incoming message to the right waiting activity.
- Fix: a FEEL unary test that is undecidable (evaluates to null) is now false — `evaluateFeelUnaryTest` returns strictly boolean.
- Types: `FeelExpressions()` declares `isExpression`/`hasExpression`; JSDoc polish in `FeelScripts`.
- Tests are type-checked against the published type surface (`tsc -p test/tsconfig.json`).
- Peer `bpmn-elements` floor raised to `>= 18.0.12` — earlier versions could stall or skip extension re-activation when resuming a stopped instance in place.

## v0.0.2 - 2026-06-28

- FEEL (`= ...`) expressions and sequence-flow conditions (`FeelExpressions`); `zeebe:script` script tasks (`FeelScripts`).
- Service tasks (`zeebe:taskDefinition`) and business rule tasks (`zeebe:calledDecision`) with `resultVariable`.
- `zeebe:ioMapping` input/output, propagated across call activities and sub processes.
- Multi-instance `zeebe:loopCharacteristics`: collection, parallel/sequential, `outputCollection` aggregation.
- User tasks: `zeebe:assignmentDefinition`, `zeebe:formDefinition`; plus `zeebe:taskHeaders` and `zeebe:properties`.
- Blocking `zeebe:executionListeners`, called as `(elementApi, { retries, headers }, callback)`.
- Call activities (`zeebe:calledElement`); stop/recover/resume.
- Dual ESM/CJS build with generated types; peer `bpmn-elements >= 18.0.4`.
