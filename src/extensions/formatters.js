import { resolveValue } from '../feel.js';

/**
 * Format an activity on enter from its behaviour and extensions: documentation and,
 * for user tasks, the `zeebe:assignmentDefinition` (assignee, candidate users/groups).
 */
export class FormatActivity {
  /**
   * @param {import('bpmn-elements').Activity} activity
   * @param {any} assignmentDefinition
   */
  constructor(activity, assignmentDefinition) {
    this.activity = activity;
    this.assignmentDefinition = assignmentDefinition;
  }
  /**
   * @param {import('bpmn-elements').IApi<import('bpmn-elements').Activity>} elementApi
   */
  resolve(elementApi) {
    const scope = elementApi.environment.variables;
    const result = {};

    const documentation = this.activity.behaviour.documentation;
    if (documentation && !elementApi.content.description) {
      const text = documentation[0]?.text;
      if (text) result.description = resolveValue(text, scope);
    }

    const assignment = this.assignmentDefinition;
    if (assignment) {
      const { assignee, candidateUsers, candidateGroups } = assignment;
      if (assignee) result.assignee = resolveValue(assignee, scope);
      const users = resolveList(candidateUsers, scope);
      if (users) result.candidateUsers = users;
      const groups = resolveList(candidateGroups, scope);
      if (groups) result.candidateGroups = groups;
    }

    return result;
  }
}

/**
 * Format a process on enter: documentation.
 */
export class FormatProcess {
  /**
   * @param {import('bpmn-elements').Process} bp
   */
  constructor(bp) {
    this.process = bp;
  }
  /**
   * @param {import('bpmn-elements').IApi<import('bpmn-elements').Process>} elementApi
   */
  resolve(elementApi) {
    const result = {};
    const documentation = this.process.behaviour.documentation;
    if (documentation && !elementApi.content.description) {
      const text = documentation[0]?.text;
      if (text) result.description = resolveValue(text, elementApi.environment.variables);
    }
    return result;
  }
}

/**
 * Resolve a candidate users/groups value to a string array. A FEEL expression may yield an
 * array directly, otherwise a comma-separated string is split.
 */
function resolveList(value, scope) {
  if (!value) return undefined;
  const resolved = resolveValue(value, scope);
  if (Array.isArray(resolved)) return resolved.filter(Boolean);
  if (typeof resolved !== 'string') return undefined;
  return resolved
    .split(',')
    .map((v) => v.trim())
    .filter(Boolean);
}
