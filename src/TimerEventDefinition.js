import { Cron } from 'croner';
import { TimerEventDefinition as BaseTimerEventDefinition } from 'bpmn-elements';

/**
 * bpmn-elements timer event definition that also accepts a **cron** `timeCycle` (Camunda 8
 * timer start events schedule with cron, e.g. `0 0 * * *`). An ISO 8601 interval is tried
 * first; on failure the value is parsed as cron and the next run is the expiry.
 *
 * Install it via the type resolver so it replaces the bpmn-elements default:
 * `TypeResolver({ ...elements, TimerEventDefinition })`.
 */
export class TimerEventDefinition extends BaseTimerEventDefinition {
  /**
   * Supported timeCycle formats
   * @returns {string[]}
   */
  get supports() {
    return ['cron', 'iso8601'];
  }
  /**
   * @param {import('bpmn-elements').TimerType} timerType
   * @param {string} value
   * @returns {import('bpmn-elements').parsedTimer}
   */
  parse(timerType, value) {
    if (timerType !== 'timeCycle') return super.parse(timerType, value);

    /** @type {any} */
    let isoError;
    try {
      return super.parse(timerType, value);
    } catch (err) {
      isoError = err;
    }

    try {
      const expireAt = new Cron(value).nextRun();
      if (!expireAt) throw new RangeError('cron has no next run');
      return { expireAt, delay: expireAt.getTime() - Date.now() };
    } catch (/** @type {any} */ err) {
      this.logger.error(`<${this.activity?.id}> failed to parse timeCycle: ${isoError.message}`);
      this.logger.error(`<${this.activity?.id}> failed to parse timeCycle as cron: ${err.message}`);
      throw new RangeError(`Failed to parse timeCycle <${value?.substring(0, 255)}> as ISO 8601 interval or cron`, { cause: err });
    }
  }
}
