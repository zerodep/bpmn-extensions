import { ServiceError } from '../Errors.js';

/**
 * `zeebe:executionListeners`.
 *
 * Each listener invokes a job worker (an environment service named by the listener `type`)
 * either before the element runs (`eventType: "start"`) or after it completes
 * (`eventType: "end"`). A listener is called as `(elementApi, { retries, headers }, callback)` and
 * may either call the callback or return a promise — either way the element blocks until it
 * settles. `retries` and `headers` are only present when the listener declares them (no defaults
 * are invented).
 */
export class ExecutionListeners {
  constructor(activity, executionListeners) {
    this.activity = activity;
    this.listeners = executionListeners.listeners || [];
  }
  get onStart() {
    return this.listeners.some((l) => l.eventType === 'start');
  }
  get onEnd() {
    return this.listeners.some((l) => l.eventType === 'end');
  }
  /**
   * Execute all listeners registered for an event type, in order.
   * @param {'start'|'end'} eventType
   * @param {import('bpmn-elements').IApi<any>} elementApi
   */
  async execute(eventType, elementApi) {
    const environment = this.activity.environment;
    for (const listener of this.listeners) {
      if (listener.eventType !== eventType) continue;
      const serviceFn = environment.services[listener.type];
      if (typeof serviceFn !== 'function') throw new ServiceError(listener.type);

      const options = {};
      if (listener.retries !== undefined) {
        const retries = Number(listener.retries);
        options.retries = Number.isFinite(retries) ? retries : listener.retries;
      }

      const headerValues = listener.headers?.values;
      if (headerValues?.length) {
        const headers = {};
        for (const { key, value } of headerValues) {
          if (key !== undefined) headers[key] = value;
        }
        options.headers = headers;
      }

      // A listener may either call the callback or return a promise; await whichever settles.
      await new Promise((resolve, reject) => {
        const returned = serviceFn.call(this.activity, elementApi, options, (err, result) => (err ? reject(err) : resolve(result)));
        if (returned && typeof returned.then === 'function') returned.then(resolve, reject);
      });
    }
  }
}
