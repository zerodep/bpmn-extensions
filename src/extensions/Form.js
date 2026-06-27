import { resolveValue } from '../feel.js';

/**
 * `zeebe:formDefinition`.
 *
 * User tasks (and form-bearing start events) reference their form here: a linked
 * form (`formId`), a deprecated form key (`formKey`), or an external form
 * (`externalReference`, which may be a FEEL expression). Resolved to a plain object and made
 * available on the element content as `form` so a task list can render it.
 */
export class Form {
  constructor(formDefinition) {
    this.formDefinition = formDefinition;
  }
  resolve(elementApi) {
    const scope = elementApi.environment.variables;
    const { formId, formKey, externalReference, bindingType, versionTag } = this.formDefinition;
    return {
      ...(formId !== undefined && { formId: resolveValue(formId, scope) }),
      ...(formKey !== undefined && { formKey: resolveValue(formKey, scope) }),
      ...(externalReference !== undefined && { externalReference: resolveValue(externalReference, scope) }),
      ...(bindingType !== undefined && { bindingType }),
      ...(versionTag !== undefined && { versionTag }),
    };
  }
}
