import { readFile } from 'node:fs/promises';

import { createDefinition } from '../helpers/testHelpers.js';

Feature('Collection parallel multi-instance call activity', () => {
  let source;

  before(async () => {
    source = await readFile(new URL('../resources/multi-instance-call-activity.bpmn', import.meta.url));
  });

  Scenario('a parallel multi-instance call activity runs the called sub process once per collection item', () => {
    let definition, processedItems, calledStarts, left;

    Given('a call activity with a parallel `zeebe:loopCharacteristics` over `= items`, calling `handleItem`', () => {
      expect(source).to.be.ok;
    });

    When('it runs with a three-item collection', async () => {
      processedItems = [];
      calledStarts = [];
      definition = await createDefinition(source, {
        variables: { items: ['a', 'b', 'c'] },
        services: {
          // The multi-instance element (`item`) is forwarded into the called process.
          /** @this {import('bpmn-elements').Activity} */
          'process-item'(_, callback) {
            processedItems.push(this.environment.variables.item);
            callback(null, {});
          },
        },
      });
      // The called process is non-executable, so it only starts via the call activity.
      definition.broker.subscribeTmp('event', 'process.start', (_, msg) => calledStarts.push(msg.content.id), { noAck: true });
      left = await new Promise((resolve, reject) => {
        definition.once('leave', () => resolve(true));
        definition.once('error', reject);
        definition.run();
      });
    });

    Then('the called sub process started once per collection item', () => {
      expect(calledStarts.filter((id) => id === 'handleItem')).to.have.length(3);
    });

    And('each instance received its own item from the collection', () => {
      expect(processedItems).to.have.members(['a', 'b', 'c']);
    });

    And('the output collection aggregates each instance result in input order', () => {
      expect(definition.environment.output.results).to.deep.equal(['done-a', 'done-b', 'done-c']);
    });

    And('the batch process completes', () => {
      expect(left).to.equal(true);
    });
  });

  Scenario('an empty collection runs no instances', () => {
    let definition, processed, left;

    Given('the same process', () => {
      expect(source).to.be.ok;
    });

    When('it runs with an empty collection', async () => {
      processed = [];
      definition = await createDefinition(source, {
        variables: { items: [] },
        services: {
          'process-item': (_, callback) => {
            processed.push(true);
            callback(null, {});
          },
        },
      });
      left = await new Promise((resolve, reject) => {
        definition.once('leave', () => resolve(true));
        definition.once('error', reject);
        definition.run();
      });
    });

    Then('the called sub process never runs and the process still completes', () => {
      expect(processed).to.have.length(0);
      expect(left).to.equal(true);
    });

    And('the output collection is empty', () => {
      expect(definition.environment.output.results).to.deep.equal([]);
    });
  });
});
