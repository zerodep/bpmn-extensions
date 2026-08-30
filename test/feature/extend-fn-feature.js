import { extendFn } from '@0dep/bpmn-extensions';

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

  Scenario('a timer start event', () => {
    const behaviour = {
      $type: 'bpmn:StartEvent',
      eventDefinitions: [{ type: 'bpmn:TimerEventDefinition', behaviour: { timeCycle: '0 0 * * *' } }],
    };

    When('the behaviour is extended', () => {
      extendFn(behaviour);
    });

    Then('the time cycle is lifted onto the behaviour as scheduledStart', () => {
      expect(behaviour.scheduledStart).to.equal('0 0 * * *');
    });
  });

  Scenario('a timer start event with a duration', () => {
    const behaviour = {
      $type: 'bpmn:StartEvent',
      eventDefinitions: [{ type: 'bpmn:TimerEventDefinition', behaviour: { timeDuration: 'PT1H' } }],
    };

    When('the behaviour is extended', () => {
      extendFn(behaviour);
    });

    Then('no scheduledStart is added - only a cycle is a schedule', () => {
      expect(behaviour.scheduledStart).to.be.undefined;
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
