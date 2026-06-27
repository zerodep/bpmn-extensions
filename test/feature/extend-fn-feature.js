import { extendFn } from '../../src/index.js';

Feature('extendFn behaviour extender', () => {
  Scenario('a call activity with a called element', () => {
    const behaviour = {
      extensionElements: { values: [{ $type: 'zeebe:CalledElement', processId: 'subProcess' }] },
    };

    When('the behaviour is extended', () => {
      extendFn(behaviour);
    });

    Then('the called process id is lifted onto the behaviour', () => {
      expect(behaviour.calledElement).to.equal('subProcess');
    });
  });

  Scenario('a behaviour without extension elements', () => {
    const behaviour = {};

    When('the behaviour is extended', () => {
      extendFn(behaviour);
    });

    Then('nothing is added', () => {
      expect(behaviour.calledElement).to.be.undefined;
    });
  });
});
