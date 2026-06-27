import { ServiceError } from '../Errors.js';
import { resolveValue } from '../feel.js';

/**
 * `zeebe:taskDefinition`.
 *
 * A job worker subscribed to the task `type` executes the activity. Here the
 * `type` is mapped to an environment service of the same name: the job worker is a service
 * function `(executionMessage, callback) => void` registered under the job type.
 *
 * The service receives the task headers and resolved io input on the execution message
 * content, and its result (the second callback argument) becomes the job variables that
 * output mapping operates on.
 *
 * Bind the task type to use as the activity `Service`:
 *   activity.behaviour.Service = JobService.bind(JobService, taskType);
 */
export function JobService(taskType, activity) {
  if (!(this instanceof JobService)) return new JobService(taskType, activity);
  this.type = `${activity.type}:taskDefinition`;
  this.taskType = taskType;
  this.activity = activity;
}

JobService.prototype.execute = function execute(executionMessage, callback) {
  const activity = this.activity;
  const environment = activity.environment;

  let jobType;
  try {
    jobType = resolveValue(this.taskType, environment.variables);
  } catch (err) {
    return callback(err);
  }

  const serviceFn = environment.services[jobType];
  if (typeof serviceFn !== 'function') return callback(new ServiceError(jobType));

  return serviceFn.call(activity, executionMessage, (err, result) => callback(err, result));
};
