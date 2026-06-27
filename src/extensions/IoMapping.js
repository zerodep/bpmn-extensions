import { resolveValue } from '../feel.js';

/**
 * `zeebe:ioMapping`.
 *
 * Input parameters are evaluated in the parent (process) scope when the element is entered,
 * producing the local variables the job runs with. Output parameters are evaluated in the
 * job-result scope when the element completes, merging the result back into the process
 * variables.
 *
 * Each parameter has a `source` (a FEEL expression or static value) and a `target`
 * (a, possibly dotted, variable name).
 */
export class IoMapping {
  constructor(activity, ioMapping) {
    this.activity = activity;
    this.inputParameters = ioMapping.inputParameters || [];
    this.outputParameters = ioMapping.outputParameters || [];
  }
  get hasInput() {
    return this.inputParameters.length > 0;
  }
  get hasOutput() {
    return this.outputParameters.length > 0;
  }
  /**
   * Resolve input parameters against the current process variables.
   * @param {import('bpmn-elements').IApi<any>} elementApi
   */
  getInput(elementApi) {
    const scope = elementApi.environment.variables;
    const result = {};
    for (const { source, target } of this.inputParameters) {
      if (!target) continue;
      setPath(result, target, resolveValue(source, scope));
    }
    return result;
  }
  /**
   * Resolve output parameters against the job result overlaid on the process variables.
   * @param {import('bpmn-elements').IApi<any>} elementApi
   * @param {Record<string, any>} [jobResult] Variables produced by the job
   */
  getOutput(elementApi, jobResult) {
    const scope = { ...elementApi.environment.variables, ...jobResult };
    const result = {};
    for (const { source, target } of this.outputParameters) {
      if (!target) continue;
      setPath(result, target, resolveValue(source, scope));
    }
    return result;
  }
}

/**
 * Assign a value to a (possibly dotted) `target` path, creating intermediate objects as needed —
 * mirrors how an output `target` such as `order.id` maps to a nested object.
 */
function setPath(target, path, value) {
  const keys = String(path).split('.');
  let cursor = target;
  for (let i = 0; i < keys.length - 1; i++) {
    const key = keys[i];
    if (typeof cursor[key] !== 'object' || cursor[key] === null) cursor[key] = {};
    cursor = cursor[key];
  }
  cursor[keys[keys.length - 1]] = value;
}
