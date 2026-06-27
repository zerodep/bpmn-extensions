import { isFeelExpression, evaluateFeel } from './feel.js';

/**
 * FEEL-aware expressions implementation for bpmn-elements.
 *
 * Plug it into the engine via the environment `expressions` option so that the whole
 * definition resolves FEEL expressions (`= ...`) instead of the default
 * `${...}` template expressions.
 *
 * @returns {import('bpmn-elements').IExpressions}
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
 * evaluated against the environment variables (overlaid with any element-local variables).
 * @param {string} templatedString
 * @param {{ environment?: import('bpmn-elements').Environment, content?: any }} [context]
 */
function resolveExpression(templatedString, context) {
  if (!isFeelExpression(templatedString)) return templatedString;
  return evaluateFeel(templatedString, getScope(context));
}

/**
 * Build the FEEL variable scope from a resolution context. Process/definition variables form
 * the base scope, overlaid with any local variables carried on the element message content
 * (e.g. a multi-instance item).
 */
function getScope(context) {
  const environment = context && context.environment;
  const variables = environment ? environment.variables : {};
  const local = context && context.content && context.content.variables;
  return { ...variables, ...local };
}
