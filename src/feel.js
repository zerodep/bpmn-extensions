import { evaluate, unaryTest } from 'feelin';

/**
 * A value is a FEEL expression when it is a string prefixed with `=`.
 * Anything else is a static literal.
 */
const FEEL_PREFIX = /^\s*=/;

/**
 * Is the value a FEEL expression, i.e. a string starting with `=`?
 * @param {unknown} value
 * @returns {boolean}
 */
export function isFeelExpression(value) {
  return typeof value === 'string' && FEEL_PREFIX.test(value);
}

/**
 * Strip the leading `=` from a FEEL expression.
 * @param {string} expression
 * @returns {string}
 */
export function stripFeel(expression) {
  return expression.replace(FEEL_PREFIX, '');
}

/**
 * Evaluate a FEEL expression against a context (the variables in scope).
 * @param {string} expression FEEL expression, with or without the leading `=`
 * @param {Record<string, any>} [context] Variables in scope
 * @returns {any}
 */
export function evaluateFeel(expression, context) {
  const { value } = evaluate(stripFeel(expression), context || {});
  return value;
}

/**
 * Evaluate a FEEL unary test, e.g. `> 100` or `1, 2, 3`, against an input value.
 * @param {string} expression FEEL unary test
 * @param {any} input The value being tested, available as `?` in the test
 * @param {Record<string, any>} [context] Additional variables in scope
 * @returns {boolean} true only when the test is satisfied — an undecidable (null) test is false
 */
export function evaluateFeelUnaryTest(expression, input, context) {
  const { value } = unaryTest(stripFeel(expression), { ...(context || {}), '?': input });
  return value === true;
}

/**
 * Resolve a value: evaluate it as FEEL when it starts with `=`, otherwise
 * return the static literal untouched.
 * @param {any} value
 * @param {Record<string, any>} [context] Variables in scope for FEEL evaluation
 * @returns {any}
 */
export function resolveValue(value, context) {
  if (isFeelExpression(value)) return evaluateFeel(value, context);
  return value;
}
