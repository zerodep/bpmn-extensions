import { ExecutionListeners } from '../../src/extensions/ExecutionListeners.js';

describe('ExecutionListeners', () => {
  it('an execution listeners element with no listeners has onStart and onEnd both false', () => {
    const listeners = new ExecutionListeners({}, {});
    expect(listeners.onStart).to.equal(false);
    expect(listeners.onEnd).to.equal(false);
  });
});
