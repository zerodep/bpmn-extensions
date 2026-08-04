import { FormatActivity, FormatProcess } from './extensions/formatters.js';
import { IoMapping } from './extensions/IoMapping.js';
import { TaskHeaders } from './extensions/TaskHeaders.js';
import { Properties } from './extensions/Properties.js';
import { ExecutionListeners } from './extensions/ExecutionListeners.js';
import { Form } from './extensions/Form.js';
import { LoopCharacteristics } from './extensions/LoopCharacteristics.js';
import { JobService } from './extensions/TaskDefinition.js';
import { Subscription } from './extensions/Subscription.js';

/**
 * The extension handlers assembled for one element.
 * @typedef {object} ExtensionHandlers
 * @property {FormatActivity | FormatProcess} format
 * @property {IoMapping} [io]
 * @property {TaskHeaders} [headers]
 * @property {Properties} [properties]
 * @property {ExecutionListeners} [listeners]
 * @property {Form} [form]
 * @property {LoopCharacteristics} [loop]
 * @property {any} [script]
 * @property {any} [calledDecision]
 * @property {Function} [Service]
 * @property {Subscription} [subscription]
 */

/**
 * Inspect an element's extension elements and assemble the extension handlers it needs.
 * @param {import('bpmn-elements').Activity | import('bpmn-elements').Process} element
 * @param {import('bpmn-elements').ContextInstance} [context]
 * @returns {ExtensionHandlers}
 */
export function getExtensions(element, context) {
  const result = {};
  const isProcess = element.type === 'bpmn:Process';

  let assignmentDefinition;
  const values = element.behaviour.extensionElements?.values;
  if (values) {
    for (const ext of values) {
      switch (ext.$type) {
        case 'zeebe:IoMapping':
          result.io = new IoMapping(element, ext);
          break;
        case 'zeebe:TaskHeaders':
          if (ext.values?.length) result.headers = new TaskHeaders(ext);
          break;
        case 'zeebe:Properties':
          if (ext.properties?.length) result.properties = new Properties(ext);
          break;
        case 'zeebe:AssignmentDefinition':
          assignmentDefinition = ext;
          break;
        case 'zeebe:ExecutionListeners':
          if (ext.listeners?.length) result.listeners = new ExecutionListeners(element, ext);
          break;
        case 'zeebe:TaskDefinition':
          result.Service = JobService.bind(JobService, ext.type);
          break;
        case 'zeebe:Script':
          result.script = ext;
          break;
        case 'zeebe:CalledDecision':
          // A business rule task runs as a service task (bpmn-elements maps it to ServiceTask). The
          // decision is resolved by an environment service named by the decision id; its result is
          // named by `resultVariable`.
          result.calledDecision = ext;
          result.Service = JobService.bind(JobService, ext.decisionId);
          break;
        case 'zeebe:FormDefinition':
          result.form = new Form(ext);
          break;
      }
    }
  }

  // A message catch (receive task / message event) may reference a bpmn:Message carrying a
  // zeebe:subscription with the correlation key. The subscription lives on the message element,
  // which the instantiated bpmn-elements Message strips — read it off the serialized context.
  const messageRef =
    element.behaviour.messageRef ?? element.behaviour.eventDefinitions?.find((ed) => ed.behaviour?.messageRef)?.behaviour.messageRef;
  if (messageRef?.id && context) {
    const subscription = context.definitionContext
      .getActivityById(messageRef.id)
      ?.behaviour.extensionElements?.values?.find((v) => v.$type === 'zeebe:Subscription');
    if (subscription?.correlationKey) result.subscription = new Subscription(messageRef, subscription);
  }

  // Output side of a multi-instance `zeebe:loopCharacteristics` (the input side is lifted by extendFn).
  const loopExtension = element.behaviour.loopCharacteristics?.behaviour?.extensionElements?.values?.find(
    (v) => v.$type === 'zeebe:LoopCharacteristics'
  );
  if (loopExtension?.outputCollection) result.loop = new LoopCharacteristics(loopExtension);

  result.format = isProcess ? new FormatProcess(element) : new FormatActivity(element, assignmentDefinition);

  return result;
}
