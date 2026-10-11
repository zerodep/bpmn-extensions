import { readFile } from 'node:fs/promises';

import { createDefinition } from '../helpers/testHelpers.js';

Feature('Inclusive gateways', () => {
  let source;

  before(async () => {
    source = await readFile(new URL('../resources/inclusive-fork-loopback.bpmn', import.meta.url));
  });

  Scenario('an inclusive fork gateway runs a loopback and an ending parallel converge', () => {
    /** @type {Awaited<ReturnType<createDefinition>>} */
    let definition;
    let leave;
    When('ran with a three-item collection', async () => {
      definition = await createDefinition(source, {
        services: {
          takeOnce: function takeOnce(name) {
            if (name in definition.environment.variables) return false;
            definition.environment.variables[name] = 1;
            return true;
          },
        },
      });

      leave = definition.waitFor('leave');
      definition.run();
    });

    Then('run completes', () => {
      return leave;
    });

    And('inclusive gateway was taken twice', () => {
      expect(definition.getActivityById('gw-loopback')?.counters).to.have.property('taken', 2);
    });

    And('converge gateway was expected to be taken once, but got hit twice - fix in bpmn-elements', () => {
      expect(definition.getActivityById('converge')?.counters).to.have.property('taken', 2);
    });
  });
});
