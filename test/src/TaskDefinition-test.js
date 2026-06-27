import { JobService } from '../../src/extensions/TaskDefinition.js';

Feature('JobService edge cases', () => {
  Scenario('called without new', () => {
    Then('it still returns a JobService instance bound to the task type', () => {
      const service = JobService('charge', { type: 'bpmn:ServiceTask' });
      expect(service).to.be.an.instanceof(JobService);
      expect(service.taskType).to.equal('charge');
      expect(service.type).to.equal('bpmn:ServiceTask:taskDefinition');
    });
  });
});
