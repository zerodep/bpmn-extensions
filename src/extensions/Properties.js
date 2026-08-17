import { resolveValue, getFeelScope } from '../feel.js';

/**
 * `zeebe:properties`.
 *
 * Named properties whose values may be FEEL expressions. Resolved to a plain object and made
 * available on the element content as `properties`.
 */
export class Properties {
  constructor(properties) {
    this.properties = properties.properties || [];
  }
  resolve(elementApi) {
    const scope = getFeelScope(elementApi.environment);
    const result = {};
    for (const { name, value } of this.properties) {
      if (name === undefined) continue;
      result[name] = resolveValue(value, scope);
    }
    return result;
  }
}
