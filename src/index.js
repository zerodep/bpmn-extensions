import { ElementExtensions } from './ElementExtensions.js';
import { ProcessExtensions } from './ProcessExtensions.js';
import { SubProcessExtensions } from './SubProcessExtensions.js';

export { ElementExtensions, ProcessExtensions, SubProcessExtensions };
export { FeelExpressions } from './Expressions.js';
export { FeelScripts } from './extensions/FeelScripts.js';
export { TimerEventDefinition } from './TimerEventDefinition.js';
export { isFeelExpression, stripFeel, evaluateFeel, evaluateFeelUnaryTest, resolveValue, getFeelScope } from './feel.js';
export { JobService } from './extensions/TaskDefinition.js';
export { ServiceError, FormatError } from './Errors.js';

/**
 * A flow extension activated by bpmn-elements around an element's run.
 * @typedef {object} FlowExtension
 * @property {(message: import('bpmn-elements').ElementBrokerMessage) => void} activate
 * @property {(message?: import('bpmn-elements').ElementBrokerMessage) => void} deactivate
 */

/**
 * Flow extensions factory. Pass it to the engine via the environment `extensions` option.
 *
 * Returns undefined for an element that carries no zeebe extension data and nothing else to
 * format (no documentation, not a call activity) — bpmn-elements skips falsy extensions, so
 * plain elements run untouched, with no broker subscriptions or format-queue traffic.
 * @param {import('bpmn-elements').Activity | import('bpmn-elements').Process} element
 * @param {import('bpmn-elements').ContextInstance} context
 * @returns {FlowExtension | undefined}
 */
export function extensions(element, context) {
  switch (element.type) {
    case 'bpmn:Process':
      // A process is always attached: a called process needs its inbound input promoted
      // even when it carries no zeebe extension data of its own.
      return new ProcessExtensions(element, context);
    case 'bpmn:SubProcess':
    case 'bpmn:AdHocSubProcess':
    case 'bpmn:Transaction': {
      const subProcessExtensions = new SubProcessExtensions(element, context);
      if (subProcessExtensions.extensions.isEmpty) return undefined;
      return subProcessExtensions;
    }
    default: {
      const elementExtensions = new ElementExtensions(element, context);
      if (elementExtensions.extensions.isEmpty) return undefined;
      return elementExtensions;
    }
  }
}

/**
 * Behaviour extend function for moddle-context-serializer.
 *
 * Lifts extension data onto the places bpmn-elements expects to find it on the element
 * behaviour: the call activity's called process id (`zeebe:calledElement`) and the multi-instance
 * input collection/element (`zeebe:loopCharacteristics`). A timer start event's `timeCycle`
 * (ISO 8601 or cron) is lifted as `scheduledStart`, so a scheduler can find it without running
 * the flow.
 * @param {any} behaviour
 */
export function extendFn(behaviour) {
  if (behaviour.$type === 'bpmn:StartEvent' && Array.isArray(behaviour.eventDefinitions)) {
    const timer = behaviour.eventDefinitions.find((ed) => ed?.type === 'bpmn:TimerEventDefinition' && ed.behaviour?.timeCycle);
    if (timer) behaviour.scheduledStart = timer.behaviour.timeCycle;
  }

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
