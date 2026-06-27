/**
 * `zeebe:taskHeaders`.
 *
 * Static key/value metadata passed to the job worker. Resolved to a plain object and made
 * available on the element content as `headers`.
 */
export class TaskHeaders {
  constructor(taskHeaders) {
    this.values = taskHeaders.values || [];
  }
  resolve() {
    const result = {};
    for (const { key, value } of this.values) {
      if (key === undefined) continue;
      result[key] = value;
    }
    return result;
  }
}
