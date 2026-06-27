import { ElementExtensions } from './ElementExtensions.js';
import { ProcessExtensions } from './ProcessExtensions.js';
import { SubProcessExtensions } from './SubProcessExtensions.js';

export { ElementExtensions, ProcessExtensions, SubProcessExtensions };
export { FeelExpressions } from './Expressions.js';
export { FeelScripts } from './extensions/FeelScripts.js';
export { isFeelExpression, stripFeel, evaluateFeel, evaluateFeelUnaryTest, resolveValue } from './feel.js';
export { JobService } from './extensions/TaskDefinition.js';
export { ServiceError, FormatError } from './Errors.js';

/**
 * A flow extension activated by bpmn-elements around an element's run.
 * @typedef {object} FlowExtension
 * @property {(message: any) => void} activate
 * @property {(message?: any) => void} deactivate
 */

/**
 * Flow extensions factory. Pass it to the engine via the environment `extensions` option.
 * @param {import('bpmn-elements').Activity | import('bpmn-elements').Process} element
 * @param {import('bpmn-elements').ContextInstance} context
 * @returns {FlowExtension}
 */
export function extensions(element, context) {
  switch (element.type) {
    case 'bpmn:Process':
      return new ProcessExtensions(element, context);
    case 'bpmn:SubProcess':
    case 'bpmn:AdHocSubProcess':
    case 'bpmn:Transaction':
      return new SubProcessExtensions(element, context);
    default:
      return new ElementExtensions(element, context);
  }
}

/**
 * Behaviour extend function for moddle-context-serializer.
 *
 * Lifts extension data onto the places bpmn-elements expects to find it on the element
 * behaviour: the call activity's called process id (`zeebe:calledElement`) and the multi-instance
 * input collection/element (`zeebe:loopCharacteristics`).
 * @param {any} behaviour
 */
export function extendFn(behaviour) {
  const values = behaviour.extensionElements?.values;
  if (Array.isArray(values)) {
    for (const ext of values) {
      if (ext.$type === 'zeebe:CalledElement' && ext.processId) {
        behaviour.calledElement = ext.processId;
      }
    }
  }

  // Map zeebe:loopCharacteristics (nested in the multi-instance loop) onto the bpmn-elements
  // multi-instance behaviour: `inputCollection` -> `collection`, `inputElement` -> `elementVariable`.
  const loop = behaviour.loopCharacteristics?.behaviour;
  const loopExtension = loop?.extensionElements?.values?.find((v) => v.$type === 'zeebe:LoopCharacteristics');
  if (loopExtension) {
    if (loopExtension.inputCollection) loop.collection = loopExtension.inputCollection;
    if (loopExtension.inputElement) loop.elementVariable = loopExtension.inputElement;
  }
}
