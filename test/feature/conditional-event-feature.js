import { readFile } from 'node:fs/promises';

import { ProcessBuilder } from '../helpers/factory.js';
import { createDefinition } from '../helpers/testHelpers.js';

Feature('Conditional event', () => {
  /** Run a definition until an activity waits, resolving with the waiting element api. */
  function runToWait(definition) {
    return new Promise((resolve, reject) => {
      definition.once('activity.wait', resolve);
      definition.once('error', reject);
      definition.run();
    });
  }

  function completion(definition) {
    return new Promise((resolve, reject) => {
      definition.once('leave', () => resolve(definition));
      definition.once('error', reject);
    });
  }

  Scenario('a conditional catch event guarded by a process variable', () => {
    let source, definition;
    const evaluations = [];

    Given('an approval task runs in parallel with a conditional catch event guarding on the approved variable', async () => {
      source = await readFile(new URL('../resources/conditional-event.bpmn', import.meta.url));
    });

    When('running', async () => {
      definition = await createDefinition(source);
      definition.on('activity.condition', (api) => evaluations.push(api.content.conditionResult));
      await runToWait(definition);
    });

    Then('the condition was evaluated on enter, and the event waits since approved is not set', () => {
      expect(evaluations).to.have.length(1);
      expect(evaluations[0]).to.not.be.ok;
      expect(definition.getPostponed().some((a) => a.id === 'wait-approved')).to.be.true;
    });

    When('the event is signaled before any approval', () => {
      const [api] = definition.getPostponed().filter((a) => a.id === 'wait-approved');
      api.signal();
    });

    Then('the condition was re-evaluated and the event keeps waiting', () => {
      expect(evaluations).to.have.length(2);
      expect(evaluations[1]).to.not.be.ok;
      expect(definition.getPostponed().some((a) => a.id === 'wait-approved')).to.be.true;
    });

    When('the approval task completes, output mapping approved to the process variables', () => {
      const [api] = definition.getPostponed().filter((a) => a.id === 'approve');
      api.signal({ approved: true });
    });

    Then('the event still waits — the condition is evaluated on signal, not on variable change', () => {
      expect(evaluations).to.have.length(2);
      expect(definition.getPostponed().some((a) => a.id === 'wait-approved')).to.be.true;
    });

    When('the event is signaled again', async () => {
      const ended = completion(definition);
      const [api] = definition.getPostponed().filter((a) => a.id === 'wait-approved');
      api.signal();
      await ended;
    });

    Then('the condition evaluated to true and the process completed', () => {
      expect(evaluations).to.have.length(3);
      expect(evaluations[2]).to.be.true;
      expect(definition.counters.completed).to.equal(1);
    });
  });

  Scenario('a service-backed condition', () => {
    let source, definition;
    const evaluations = [];

    Given('a process with a conditional catch event calling an environment service in its condition', async () => {
      source = await new ProcessBuilder('conditional-service')
        .startEvent('start')
        .conditionalCatchEvent('wait-ready', '= services.isReady()')
        .endEvent('end')
        .connect('start', 'wait-ready')
        .connect('wait-ready', 'end')
        .toXML();
    });

    When('running with a service that is ready on the third call', async () => {
      let calls = 0;
      definition = await createDefinition(source, {
        services: {
          isReady() {
            return ++calls >= 3;
          },
        },
      });
      definition.on('activity.condition', (api) => evaluations.push(api.content.conditionResult));
      await runToWait(definition);
    });

    Then('the service was consulted on enter and the event waits', () => {
      expect(evaluations).to.deep.equal([false]);
    });

    When('the event is signaled twice, the service consulted on each signal', async () => {
      const ended = completion(definition);
      const [api] = definition.getPostponed().filter((a) => a.id === 'wait-ready');
      api.signal();
      api.signal();
      await ended;
    });

    Then('the second signal met the condition and the process completed', () => {
      expect(evaluations).to.deep.equal([false, false, true]);
      expect(definition.counters.completed).to.equal(1);
    });
  });

  Scenario('a condition that is already met on enter', () => {
    let source, definition;

    Given('a process with a conditional catch event guarding on the approved variable', async () => {
      source = await new ProcessBuilder('conditional-met')
        .startEvent('start')
        .conditionalCatchEvent('wait-approved', '= approved')
        .endEvent('end')
        .connect('start', 'wait-approved')
        .connect('wait-approved', 'end')
        .toXML();
    });

    When('running with approved already true', async () => {
      definition = await createDefinition(source, { variables: { approved: true } });
      const ended = completion(definition);
      definition.run();
      await ended;
    });

    Then('the event passed through without waiting', () => {
      expect(definition.counters.completed).to.equal(1);
      expect(definition.getActivityById('wait-approved').counters.taken).to.equal(1);
    });
  });
});
