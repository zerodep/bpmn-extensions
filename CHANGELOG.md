# Changelog

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
