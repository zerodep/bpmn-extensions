import { resolveValue } from '../feel.js';

/**
 * `zeebe:subscription` — rides on the referenced `bpmn:Message`, not on the catching element.
 *
 * Resolves the correlation key in the activity's variable scope on enter and exposes it on the
 * element content as `subscription`. Correlation itself is the embedding application's job:
 * read the resolved key off the waiting activity (`getPostponed()` → `content.subscription`)
 * and signal the matching one (`api.signal(...)`).
 */
export class Subscription {
  /**
   * @param {{ id: string, name?: string }} messageRef The serialized message reference
   * @param {{ correlationKey: string }} subscription The `zeebe:Subscription` behaviour
   */
  constructor(messageRef, subscription) {
    this.message = { id: messageRef.id, name: messageRef.name };
    this.correlationKey = subscription.correlationKey;
  }
  /**
   * @param {import('bpmn-elements').IApi<any>} elementApi
   * @returns {{ message: { id: string, name?: string }, correlationKey: any }}
   */
  resolve(elementApi) {
    return {
      message: this.message,
      correlationKey: resolveValue(this.correlationKey, elementApi.environment.variables),
    };
  }
}
