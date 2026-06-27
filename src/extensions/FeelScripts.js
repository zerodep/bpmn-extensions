import { isFeelExpression, evaluateFeel } from '../feel.js';

/**
 * A bpmn-elements `scripts` implementation for script tasks.
 *
 * A script task carries a `zeebe:script` extension with a FEEL `expression` (and a
 * `resultVariable`). There is no embedded script body and no `scriptFormat` attribute, so this
 * registry ignores the script format and reads the expression straight off the element.
 *
 * Install it on the environment via the `scripts` option, alongside `FeelExpressions()`.
 *
 * @returns {import('bpmn-elements').IScripts}
 */
export function FeelScripts() {
  return new FeelScriptRegistry();
}

class FeelScriptRegistry {
  register() {}
  getScript(_scriptFormat, activity) {
    const expression = getScriptExpression(activity);
    if (expression === undefined) return undefined;
    return new FeelScript(expression);
  }
}

class FeelScript {
  constructor(expression) {
    this.expression = expression;
  }
  execute(scope, callback) {
    try {
      const value = isFeelExpression(this.expression) ? evaluateFeel(this.expression, { ...scope.environment.variables }) : this.expression;
      callback(null, value);
    } catch (err) {
      callback(err);
    }
  }
}

/**
 * Read the `zeebe:script` FEEL expression from a script task's extension elements.
 */
function getScriptExpression(activity) {
  const values = activity.behaviour?.extensionElements?.values;
  if (!values) return undefined;
  const script = values.find((v) => v.$type === 'zeebe:Script');
  return script?.expression;
}
