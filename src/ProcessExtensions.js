import { FormatError } from './Errors.js';
import { getExtensions } from './getExtensions.js';

/**
 * Process-level extensions. Formats the process on enter (documentation) and assigns
 * the result to the process variables.
 */
export class ProcessExtensions {
  constructor(bp) {
    this.process = bp;
    this.extensions = getExtensions(bp);
  }
  activate() {
    // bpmn-elements (>=18.0.3) calls activate() on `run.enter`, before `process.enter` is published.
    const bp = this.process;
    bp.broker.subscribeTmp('event', 'process.enter', (_, message) => this.#onEnter(bp.getApi(message)), {
      noAck: true,
      consumerTag: '0dep-bpmn-extensions:on-enter',
    });
  }
  deactivate() {
    this.process.broker.cancel('0dep-bpmn-extensions:on-enter');
  }
  #onEnter(elementApi) {
    try {
      // bpmn-elements (>=18.0.4) forwards a call activity's formatted input — its io mapping plus,
      // for a multi-instance, the loop element variable — on the called process's inbound content.
      // Promote it to top-level process variables (addressable by name; bpmn-elements itself only
      // exposes it nested under `input`).
      const inbound = elementApi.content.inbound;
      if (Array.isArray(inbound)) {
        for (const from of inbound) {
          if (from?.input && typeof from.input === 'object') elementApi.environment.assignVariables(from.input);
        }
      }

      const result = this.extensions.format.resolve(elementApi);
      Object.assign(elementApi.content, result);
      elementApi.environment.assignVariables(result);
    } catch (err) {
      elementApi.broker.publish(
        'event',
        'process.error',
        { ...elementApi.content, error: new FormatError(this.process.id, err) },
        { mandatory: true, type: 'error' }
      );
    }
  }
}
