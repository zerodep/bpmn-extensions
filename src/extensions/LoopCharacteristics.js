import { resolveValue } from '../feel.js';

/**
 * Output side of `zeebe:loopCharacteristics`.
 *
 * A multi-instance is aggregated into an `outputCollection` array: for each instance the
 * `outputElement` FEEL expression is evaluated in that instance's result scope and collected, in
 * input order, into the named collection variable.
 *
 * bpmn-elements collects instance outputs into an index-keyed object on the activity content
 * (`{ 0: <out>, 1: <out>, ... }`, where a call activity instance wraps its result as
 * `{ executionId, output }`). This reduces that to the output-collection array.
 */
export class LoopCharacteristics {
  constructor(loopCharacteristics) {
    this.outputCollection = loopCharacteristics.outputCollection;
    this.outputElement = loopCharacteristics.outputElement;
  }
  get hasOutputCollection() {
    return Boolean(this.outputCollection);
  }
  /**
   * @param {Record<string, any>|undefined} indexedOutput bpmn-elements index-keyed instance outputs
   * @param {Record<string, any>} baseScope process variables in scope for `outputElement`
   * @returns {any[]}
   */
  aggregate(indexedOutput, baseScope) {
    const result = [];
    if (!indexedOutput || typeof indexedOutput !== 'object') return result;

    const indexes = Object.keys(indexedOutput)
      .filter((key) => /^\d+$/.test(key))
      .sort((a, b) => Number(a) - Number(b));

    for (const index of indexes) {
      const instance = indexedOutput[index];
      // A call activity instance wraps its result as { executionId, output }.
      const instanceOutput = instance?.executionId && instance.output ? instance.output : instance;
      const scope = { ...baseScope, ...instanceOutput };
      result.push(this.outputElement ? resolveValue(this.outputElement, scope) : instanceOutput);
    }
    return result;
  }
}
