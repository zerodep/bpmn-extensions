import { readFile } from 'node:fs/promises';

import { createDefinition } from '../helpers/testHelpers.js';

function run(definition) {
  return new Promise((resolve, reject) => {
    definition.once('leave', resolve);
    definition.once('error', reject);
    definition.run();
  });
}

Feature('Io mapping propagation', () => {
  Scenario('a call activity propagates input to, and maps output from, the called process', () => {
    let source, definition, chargedAmount;

    Given('a call activity with input and output mappings calling a `payment` process', async () => {
      source = await readFile(new URL('../resources/call-activity-io.bpmn', import.meta.url));
    });

    When('it runs', async () => {
      definition = await createDefinition(source, {
        variables: { order: { total: 42 } },
        services: {
          charge(_, callback) {
            // The call activity input mapping `= order.total -> amount` reached the called process.
            chargedAmount = this.environment.variables.amount;
            callback(null, {});
          },
        },
      });
      await run(definition);
    });

    Then('the input mapping is visible inside the called process', () => {
      expect(chargedAmount).to.equal(42);
    });

    And('the output mapping reads the called process result back into the caller', () => {
      expect(definition.environment.output).to.deep.equal({ paid: 'receipt-42' });
    });
  });

  Scenario('an embedded sub process input is local to its children and its output maps out', () => {
    let source, definition, feeSawAmount;

    Given('a sub process with input and output mappings', async () => {
      source = await readFile(new URL('../resources/sub-process-io.bpmn', import.meta.url));
    });

    When('it runs', async () => {
      definition = await createDefinition(source, {
        variables: { order: { total: 10 } },
        services: {
          'add-fee'(_, callback) {
            feeSawAmount = this.environment.variables.amount;
            callback(null, {});
          },
        },
      });
      await run(definition);
    });

    Then('the input mapping is visible to the sub process children', () => {
      expect(feeSawAmount).to.equal(10);
    });

    And('the output mapping surfaces the sub process result', () => {
      expect(definition.environment.output).to.deep.equal({ grandTotal: 15 });
    });
  });
});
