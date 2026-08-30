import { resolveValue, getFeelScope } from '../feel.js';

/**
 * Format an activity on enter from its behaviour and extensions: documentation, a top-level
 * timer start event's `scheduledStart` (lifted by `extendFn`) and, for user tasks, the `zeebe:assignmentDefinition` (assignee, candidate users/groups),
 * `zeebe:priorityDefinition` (priority), and `zeebe:taskSchedule` (due/follow-up date).
 */
export class FormatActivity {
  /**
   * @param {import('bpmn-elements').Activity} activity
   * @param {any} assignmentDefinition
   * @param {any} [priorityDefinition]
   * @param {any} [taskSchedule]
   */
  constructor(activity, assignmentDefinition, priorityDefinition, taskSchedule) {
    this.activity = activity;
    this.assignmentDefinition = assignmentDefinition;
    this.priorityDefinition = priorityDefinition;
    this.taskSchedule = taskSchedule;
  }
  /**
   * @param {import('bpmn-elements').IApi<import('bpmn-elements').Activity>} elementApi
   */
  resolve(elementApi) {
    const scope = getFeelScope(elementApi.environment);
    const result = {};

    const documentation = this.activity.behaviour.documentation;
    if (documentation && !elementApi.content.description) {
      const text = documentation[0]?.text;
      if (text) result.description = /** @type {string} */ (resolveValue(text, scope));
    }

    // A timer start event's cycle is only a schedule when it starts the process itself — a
    // sub-process start event runs whenever its parent does.
    const scheduledStart = this.activity.behaviour.scheduledStart;
    if (scheduledStart && this.activity.parent?.type === 'bpmn:Process') result.scheduledStart = scheduledStart;

    const assignment = this.assignmentDefinition;
    if (assignment) {
      const { assignee, candidateUsers, candidateGroups } = assignment;
      if (assignee) result.assignee = resolveValue(assignee, scope);
      const users = resolveList(candidateUsers, scope);
      if (users) result.candidateUsers = users;
      const groups = resolveList(candidateGroups, scope);
      if (groups) result.candidateGroups = groups;
    }

    const priority = this.priorityDefinition?.priority;
    if (priority !== undefined) {
      const resolved = resolveValue(priority, scope);
      // A static attribute value is a string — expose a numeric one as a number (like retries).
      const num = Number(resolved);
      /** @type {Number | string | undefined} */
      result.priority = typeof resolved === 'string' && resolved.trim() !== '' && Number.isFinite(num) ? num : resolved;
    }

    const schedule = this.taskSchedule;
    if (schedule) {
      const { dueDate, followUpDate } = schedule;
      if (dueDate !== undefined) result.dueDate = resolveDate(dueDate, scope);
      if (followUpDate !== undefined) result.followUpDate = resolveDate(followUpDate, scope);
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
      if (text) result.description = /** @type {string} */ (resolveValue(text, getFeelScope(elementApi.environment)));
    }
    return result;
  }
}

/**
 * Resolve a due/follow-up date to an ISO 8601 string. A FEEL temporal result (a luxon
 * DateTime) or a Date is ISO-stringified — content is JSON-serialized on `getState()`, so a
 * string is the shape that survives a recover round trip. Anything else passes through as-is.
 * @param {any} value
 * @param {any} scope
 * @returns {string | undefined} Date as iso string
 */
function resolveDate(value, scope) {
  const resolved = resolveValue(value, scope);
  if (typeof resolved?.toISO === 'function') return resolved.toISO();
  if (resolved instanceof Date) return resolved.toISOString();
  return resolved;
}

/**
 * Resolve a candidate users/groups value to a string array. A FEEL expression may yield an
 * array directly, otherwise a comma-separated string is split.
 * @param {any} value
 * @param {any} scope
 * @returns {string[] | undefined}
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
