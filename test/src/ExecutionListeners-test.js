import { ExecutionListeners } from '../../src/extensions/ExecutionListeners.js';

Feature('ExecutionListeners edge cases', () => {
  Scenario('an execution listeners element with no listeners', () => {
    Then('onStart and onEnd are both false', () => {
      const listeners = new ExecutionListeners({}, {});
      expect(listeners.onStart).to.equal(false);
      expect(listeners.onEnd).to.equal(false);
    });
  });
});
