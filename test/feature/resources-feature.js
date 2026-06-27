import { readFile } from 'node:fs/promises';

import { createDefinition } from '../helpers/testHelpers.js';

/**
 * Run a definition from BPMN source and collect the ids of the tasks that start, in order.
 */
async function runAndCollectTasks(source, options) {
  const definition = await createDefinition(source, options);
  const taken = [];
  definition.broker.subscribeTmp(
    'event',
    'activity.start',
    (_, msg) => {
      if (msg.content.type === 'bpmn:Task') taken.push(msg.content.id);
    },
    { noAck: true }
  );
  await new Promise((resolve, reject) => {
    definition.once('leave', resolve);
    definition.once('error', reject);
    definition.run();
  });
  return taken;
}

Feature('Resource: link-to-bypass-logic', () => {
  let source;

  before(async () => {
    source = await readFile(new URL('../resources/link-to-bypass-logic.bpmn', import.meta.url));
  });

  Scenario('the bypass link is taken when the FEEL condition is true', () => {
    let taken;

    Given('a process whose gateway forks to a throwing link event on `= condition`', () => {
      expect(source).to.be.ok;
    });

    When('it runs with condition true', async () => {
      taken = await runAndCollectTasks(source, { variables: { condition: true } });
    });

    Then('the throw/catch link jumps straight to the completing task', () => {
      expect(taken).to.deep.equal(['task1', 'complete-task']);
    });

    And('the bypassed middle task does not run', () => {
      expect(taken).to.not.include('task2');
    });
  });

  Scenario('the full path runs when the FEEL condition is false', () => {
    let taken;

    Given('the same process', () => {
      expect(source).to.be.ok;
    });

    When('it runs with condition false', async () => {
      taken = await runAndCollectTasks(source, { variables: { condition: false } });
    });

    Then('the gateway default flow runs the middle task and its branches', () => {
      expect(taken).to.include('task2');
      expect(taken).to.include.members(['Activity_1e4kj77', 'Activity_1n8tidw', 'Activity_1tbp4uv']);
    });

    And('the process still completes', () => {
      expect(taken).to.include('complete-task');
    });
  });
});

Feature('Resource: mother-of-all-feel', () => {
  let source;

  before(async () => {
    source = await readFile(new URL('../resources/mother-of-all-feel.bpmn', import.meta.url));
  });

  Scenario('the converted model runs its loop once and completes', () => {
    let ran, definition;

    Given('the converted mother-of-all flow (script tasks, sub process, gateways, loop)', () => {
      expect(source).to.be.ok;
    });

    When('it runs, auto-signalling user tasks', async () => {
      definition = await createDefinition(source, { variables: {}, services: { serviceFn: (_, cb) => cb(null, {}) } });
      ran = [];
      definition.broker.subscribeTmp('event', 'activity.start', (_, msg) => ran.push(msg.content.id), { noAck: true });
      definition.on('activity.wait', (api) => {
        if (api.content.type === 'bpmn:UserTask') api.signal();
      });
      await new Promise((resolve, reject) => {
        definition.once('leave', resolve);
        definition.once('error', reject);
        definition.run();
      });
    });

    Then('the sub process completes (regression: extensions must not stall a sub process)', () => {
      expect(ran).to.include('subScriptTask1');
    });

    And('the loop script runs exactly once — its `= true` result sets stopLoop and the FEEL condition short-circuits', () => {
      expect(ran.filter((id) => id === 'scriptTask2')).to.have.length(1);
      expect(definition.environment.output.stopLoop).to.equal(true);
    });

    And('the process reaches the end event', () => {
      expect(ran).to.include('theEnd');
    });
  });
});
