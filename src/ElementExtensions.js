import { getExtensions } from './getExtensions.js';

const SUBPROCESS_TYPES = new Set(['bpmn:SubProcess', 'bpmn:AdHocSubProcess', 'bpmn:Transaction']);

/**
 * Activity-level extensions.
 *
 * Formatting and io/listener side effects are injected through the activity's `format-run-q`
 * queue so the activity waits for them (including async execution listeners) before
 * proceeding — the same mechanism bpmn-elements uses for extension formatting.
 */
export class ElementExtensions {
  constructor(activity) {
    this.activity = activity;
    this.formatQ = activity.broker.getQueue('format-run-q');

    this.extensions = getExtensions(activity);
    const Service = this.extensions.Service;
    if (Service) activity.behaviour.Service = Service;
  }
  activate(message) {
    const activity = this.activity;
    const listeners = this.extensions.listeners;

    if (message.fields.redelivered && message.fields.routingKey === 'run.start') {
      activity.on('start', (api) => this._onEnter(api), { consumerTag: '0dep-bpmn-extensions:on-enter' });
    } else {
      activity.on('enter', (api) => this._onEnter(api), { consumerTag: '0dep-bpmn-extensions:on-enter' });
    }

    activity.on('activity.execution.completed', (api) => this._onExecuted(api), {
      consumerTag: '0dep-bpmn-extensions:on-executed',
    });

    if (listeners?.onStart) {
      activity.on('start', (api) => this._onListener('start', api), { consumerTag: '0dep-bpmn-extensions:on-start' });
    }
    if (listeners?.onEnd) {
      activity.on('end', (api) => this._onListener('end', api), { consumerTag: '0dep-bpmn-extensions:on-end' });
    }
  }
  deactivate() {
    const broker = this.activity.broker;
    broker.cancel('0dep-bpmn-extensions:on-enter');
    broker.cancel('0dep-bpmn-extensions:on-executed');
    broker.cancel('0dep-bpmn-extensions:on-start');
    broker.cancel('0dep-bpmn-extensions:on-end');
  }
  /** @internal Shared with SubProcessExtensions. */
  async _onEnter(elementApi) {
    this.formatQ.queueMessage({ routingKey: 'run.enter.format' }, { endRoutingKey: 'run.enter.complete' }, { persistent: false });
    try {
      const format = await this.#formatOnEnter(elementApi);
      elementApi.broker.publish('format', 'run.enter.complete', format, { persistent: false });
    } catch (err) {
      elementApi.broker.publish('format', 'run.enter.error', { error: err }, { persistent: false });
    }
  }
  /** @internal Shared with SubProcessExtensions. */
  async _onExecuted(elementApi) {
    this.formatQ.queueMessage({ routingKey: 'run.end.format' }, { endRoutingKey: 'run.end.complete' }, { persistent: false });
    try {
      const format = await this.#formatOnExecuted(elementApi);
      elementApi.broker.publish('format', 'run.end.complete', { ...format }, { persistent: false });
    } catch (err) {
      elementApi.broker.publish('format', 'run.end.error', { error: err }, { persistent: false });
    }
  }
  /** @internal Shared with SubProcessExtensions. */
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
  #formatOnEnter(elementApi) {
    const { format, io, headers, properties, form } = this.extensions;
    const result = { ...format.resolve(elementApi) };

    if (headers) result.headers = headers.resolve();
    if (properties) result.properties = properties.resolve(elementApi);
    if (form) result.form = form.resolve(elementApi);
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
  #formatOnExecuted(elementApi) {
    const { io, script, loop } = this.extensions;
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

    // A script task's FEEL result is named by its `resultVariable`; a job's result is already
    // an object of variables.
    const resultObject = script ? (script.resultVariable ? { [script.resultVariable]: jobResult } : undefined) : jobResult;

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
  #assignOutput(elementApi, output) {
    const environment = this.activity.environment;
    // Visible to downstream FEEL within the process, and surfaced as process output
    // (bpmn-elements bubbles process `environment.output` up to the definition on completion).
    environment.assignVariables(output);
    Object.assign(environment.output, output);
    Object.assign(elementApi.content, { output });
  }
}
