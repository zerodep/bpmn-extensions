import { readFile } from 'node:fs/promises';

import { execute } from '../helpers/testHelpers.js';

Feature('Transaction with compensation', () => {
  Scenario('the transaction completes and compensation never runs', () => {
    let source, definition, released;

    Given('a transaction with a reserve job, a compensation handler, and a service-driven cancel route', async () => {
      source = await readFile(new URL('../resources/transaction-compensation.bpmn', import.meta.url));
    });

    When('it runs with a condition service that never takes the cancel route', async () => {
      released = 0;
      definition = await execute(source, {
        services: {
          takeOnce() {
            return false;
          },
          reserve(_, callback) {
            callback(null, { id: 'res-1' });
          },
          release(_, callback) {
            released++;
            callback(null);
          },
        },
      });
    });

    Then('the transaction output mapping surfaces the reservation', () => {
      expect(definition.environment.output).to.deep.equal({ booked: 'res-1' });
    });

    And('the compensation handler never ran', () => {
      expect(released).to.equal(0);
    });
  });

  Scenario('the transaction is canceled, compensated, and retried', () => {
    let source, definition, reservations, released;

    Given('the same transaction flow', async () => {
      source = await readFile(new URL('../resources/transaction-compensation.bpmn', import.meta.url));
    });

    When('it runs with a condition service that takes the cancel route once', async () => {
      let takes = 0;
      reservations = 0;
      released = [];
      definition = await execute(source, {
        services: {
          takeOnce() {
            return takes++ === 0;
          },
          reserve(_, callback) {
            callback(null, { id: `res-${++reservations}` });
          },
          /** @this {import('bpmn-elements').Activity} */
          release(_, callback) {
            // The reserve output mapping `= id -> reservationId` is in scope for the handler.
            released.push(this.environment.variables.reservationId);
            callback(null);
          },
        },
      });
    });

    Then('the compensation handler released the first reservation', () => {
      expect(released).to.deep.equal(['res-1']);
    });

    And('the cancel boundary event retried the transaction with a fresh reservation', () => {
      expect(reservations).to.equal(2);
      expect(definition.environment.output).to.deep.equal({ booked: 'res-2' });
    });
  });
});
