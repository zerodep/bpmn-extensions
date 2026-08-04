import { getExtensions } from './getExtensions.js';

const SUBPROCESS_TYPES = new Set(['bpmn:SubProcess', 'bpmn:AdHocSubProcess', 'bpmn:Transaction']);

// Consumer tags shared between activate (here and in the SubProcessExtensions override) and
// deactivate — deactivate cancels by tag, so both must subscribe with these exact tags.
export const ON_ENTER_TAG = '0dep-bpmn-extensions:on-enter';
export const ON_EXECUTED_TAG = '0dep-bpmn-extensions:on-executed';
export const ON_START_TAG = '0dep-bpmn-extensions:on-start';
export const ON_END_TAG = '0dep-bpmn-extensions:on-end';

/**
 * Activity-level extensions.
 *
 * Formatting and io/listener side effects are injected through the activity's `format-run-q`
 * queue so the activity waits for them (including async execution listeners) before
 * proceeding — the same mechanism bpmn-elements uses for extension formatting.
 */
export class ElementExtensions {
  /**
   * @param {import('bpmn-elements').Activity} activity
   * @param {import('bpmn-elements').ContextInstance} context
   */
  constructor(activity, context) {
    this.activity = activity;
    this.formatQ = activity.broker.getQueue('format-run-q');

    /** @type {import('./getExtensions.js').ExtensionHandlers} */
    this.extensions = getExtensions(activity, context);
    const Service = this.extensions.Service;
    if (Service) activity.behaviour.Service = Service;
  }
  /**
   * Activate extensions
   * @param {import('bpmn-elements').ElementBrokerMessage} message
   */
  activate(message) {
    const activity = this.activity;
    const listeners = this.extensions.listeners;

    if (message.fields.redelivered && message.fields.routingKey === 'run.start') {
      activity.on('start', (api) => this._onEnter(api), { consumerTag: ON_ENTER_TAG });
    } else {
      activity.on('enter', (api) => this._onEnter(api), { consumerTag: ON_ENTER_TAG });
    }

    activity.on('activity.execution.completed', (api) => this._onExecuted(api), {
      consumerTag: ON_EXECUTED_TAG,
    });

    if (listeners?.onStart) {
      activity.on('start', (api) => this._onListener('start', api), { consumerTag: ON_START_TAG });
    }
    if (listeners?.onEnd) {
      activity.on('end', (api) => this._onListener('end', api), { consumerTag: ON_END_TAG });
    }
  }
  deactivate() {
    const broker = this.activity.broker;
    broker.cancel(ON_ENTER_TAG);
    broker.cancel(ON_EXECUTED_TAG);
    broker.cancel(ON_START_TAG);
    broker.cancel(ON_END_TAG);
  }
  /**
   * @internal Shared with SubProcessExtensions.
   * @param {import('bpmn-elements').IApi<import('bpmn-elements').Activity>} elementApi
   */
  async _onEnter(elementApi) {
    this.formatQ.queueMessage({ routingKey: 'run.enter.format' }, { endRoutingKey: 'run.enter.complete' }, { persistent: false });
    try {
      const format = await this.#formatOnEnter(elementApi);
      elementApi.broker.publish('format', 'run.enter.complete', format, { persistent: false });
    } catch (err) {
      elementApi.broker.publish('format', 'run.enter.error', { error: err }, { persistent: false });
    }
  }
  /**
   * @internal Shared with SubProcessExtensions.
   * @param {import('bpmn-elements').IApi<import('bpmn-elements').Activity>} elementApi
   */
  async _onExecuted(elementApi) {
    this.formatQ.queueMessage({ routingKey: 'run.end.format' }, { endRoutingKey: 'run.end.complete' }, { persistent: false });
    try {
      const format = await this.#formatOnExecuted(elementApi);
      elementApi.broker.publish('format', 'run.end.complete', { ...format }, { persistent: false });
    } catch (err) {
      elementApi.broker.publish('format', 'run.end.error', { error: err }, { persistent: false });
    }
  }
  /**
   * @internal Shared with SubProcessExtensions.
   * @param {import('bpmn-elements').IApi<import('bpmn-elements').Activity>} elementApi
   */
  async _onListener(eventType, elementApi) {
    const routingKey = `run.listener.${eventType}`;
    this.formatQ.queueMessage({ routingKey }, { endRoutingKey: `${routingKey}.complete` }, { persistent: false });
    try {
      await this.extensions.listeners.execute(eventType, elementApi);
      elementApi.broker.publish('format', `${routingKey}.complete`, {}, { persistent: false });
    } catch (err) {
      this.activity.logger.error(`<${this.activity.id}> ${eventType} execution listener error`, err);
      elementApi.broker.publish('format', `${routingKey}.error`, { error: err }, { persistent: false });
    }
  }
  /**
   * @param {import('bpmn-elements').IApi<import('bpmn-elements').Activity>} elementApi
   */
  #formatOnEnter(elementApi) {
    const { format, io, headers, properties, form, subscription } = this.extensions;
    const result = { ...format.resolve(elementApi) };

    if (headers) result.headers = headers.resolve();
    if (properties) result.properties = properties.resolve(elementApi);
    if (form) result.form = form.resolve(elementApi);
    if (subscription) result.subscription = subscription.resolve(elementApi);
    if (io?.hasInput) {
      result.input = io.getInput(elementApi);
      // A (sub) process input mapping creates local variables visible to its children; a job
      // (service task) or call activity keeps the input on the content (passed to the worker /
      // propagated to the called process) instead of polluting the variables.
      if (SUBPROCESS_TYPES.has(this.activity.type)) this.activity.environment.assignVariables(result.input);
    }

    Object.assign(elementApi.content, result);
    return result;
  }
  /**
   * @param {import('bpmn-elements').IApi<import('bpmn-elements').Activity>} elementApi
   */
  #formatOnExecuted(elementApi) {
    const { io, script, calledDecision, loop } = this.extensions;
    let jobResult = elementApi.content.output;

    // Multi-instance: aggregate the per-instance outputs into the `outputCollection` array.
    if (loop?.hasOutputCollection) {
      const output = { [loop.outputCollection]: loop.aggregate(jobResult, elementApi.environment.variables) };
      this.#assignOutput(elementApi, output);
      return { output };
    }

    // A call activity wraps the called process output as `{ executionId, output }`. Unwrap it so
    // output mapping / the variable merge operates on the called process's variables.
    if (this.activity.type === 'bpmn:CallActivity' && jobResult?.executionId && jobResult.output) {
      jobResult = jobResult.output;
    }

    // A script task (`zeebe:script`) or business rule task (`zeebe:calledDecision`) names its single
    // result with `resultVariable`. A plain job's result is already an object of variables.
    const named = script || calledDecision;
    const resultObject = named ? (named.resultVariable ? { [named.resultVariable]: jobResult } : undefined) : jobResult;

    let output;
    if (io?.hasOutput) {
      output = io.getOutput(elementApi, resultObject);
    } else if (resultObject !== null && typeof resultObject === 'object') {
      // No output mapping: merge the whole result into the process variables.
      output = resultObject;
    }

    if (output) {
      this.#assignOutput(elementApi, output);
      return { output };
    }
    return {};
  }
  /**
   * @param {import('bpmn-elements').IApi<import('bpmn-elements').Activity>} elementApi
   * @param {any} output
   */
  #assignOutput(elementApi, output) {
    const environment = this.activity.environment;
    // Visible to downstream FEEL within the process, and surfaced as process output
    // (bpmn-elements bubbles process `environment.output` up to the definition on completion).
    environment.assignVariables(output);
    Object.assign(environment.output, output);
    Object.assign(elementApi.content, { output });
  }
}
