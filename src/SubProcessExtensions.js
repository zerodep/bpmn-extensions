import { ElementExtensions, ON_ENTER_TAG, ON_EXECUTED_TAG, ON_START_TAG, ON_END_TAG } from './ElementExtensions.js';

/**
 * Sub-process extensions.
 *
 * A sub-process shares its broker with the child activities it contains, so their
 * `activity.*` events bubble through it. Subscribing with `activity.on(...)` (as a leaf
 * element does) would therefore fire the extension handlers for every child and spam the
 * sub-process format queue, stalling it. Instead, subscribe on the broker and filter to the
 * sub-process's own id.
 */
export class SubProcessExtensions extends ElementExtensions {
  activate(message) {
    const listeners = this.extensions.listeners;
    const enterKey = message.fields.redelivered && message.fields.routingKey === 'run.start' ? 'activity.start' : 'activity.enter';

    this.#subscribe(enterKey, (api) => this._onEnter(api), ON_ENTER_TAG);
    this.#subscribe('activity.execution.completed', (api) => this._onExecuted(api), ON_EXECUTED_TAG);

    if (listeners?.onStart) {
      this.#subscribe('activity.start', (api) => this._onListener('start', api), ON_START_TAG);
    }
    if (listeners?.onEnd) {
      this.#subscribe('activity.end', (api) => this._onListener('end', api), ON_END_TAG);
    }
  }
  #subscribe(routingKey, callback, consumerTag) {
    const activity = this.activity;
    activity.broker.subscribeTmp(
      'event',
      routingKey,
      (_, message) => {
        if (activity.id !== message.content.id) return;
        return callback(activity.getApi(message));
      },
      { noAck: true, consumerTag }
    );
  }
}
