import { isFeelExpression, evaluateFeel, getFeelScope } from './feel.js';

/**
 * FEEL-aware expressions implementation for bpmn-elements.
 *
 * Plug it into the engine via the environment `expressions` option so that the whole
 * definition resolves FEEL expressions (`= ...`) instead of the default
 * `${...}` template expressions.
 *
 * @returns {import('bpmn-elements').IExpressions & {isExpression: (text:string) => boolean, hasExpression: (text:string) => boolean}}
 */
export function FeelExpressions() {
  return {
    resolveExpression,
    isExpression,
    hasExpression,
  };
}

function isExpression(text) {
  return isFeelExpression(text);
}

function hasExpression(text) {
  return isFeelExpression(text);
}

/**
 * Resolve a templated string. Static literals are returned as-is; FEEL expressions are
 * evaluated in the environment scope (see `getFeelScope`), overlaid with any element-local
 * variables carried on the message content (e.g. a multi-instance item).
 * @param {string} templatedString
 * @param {{ environment?: import('bpmn-elements').Environment, content?: any }} [context]
 */
function resolveExpression(templatedString, context) {
  if (!isFeelExpression(templatedString)) return templatedString;
  return evaluateFeel(templatedString, getFeelScope(context?.environment, context?.content?.variables));
}
