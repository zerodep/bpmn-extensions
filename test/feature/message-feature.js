import { ProcessBuilder } from '../helpers/factory.js';
import { createDefinition } from '../helpers/testHelpers.js';

Feature('Message subscription', () => {
  /**
   * Build a process waiting on an order-paid message, correlated on the `orderId` variable.
   * @param {string} [correlationKey]
   */
  function buildWaitingReceiveTask(correlationKey) {
    return new ProcessBuilder('correlate')
      .message('Message_1', 'order-paid', { correlationKey })
      .startEvent('start')
      .receiveTask('receive', { messageRef: 'Message_1' })
      .endEvent('end')
      .connect('start', 'receive')
      .connect('receive', 'end')
      .toXML();
  }

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

  Scenario('a receive task referencing a message with a subscription', () => {
    let source, definition, waiting;

    Given('a process waiting for order-paid, correlated on the orderId variable', async () => {
      source = await buildWaitingReceiveTask('= orderId');
    });

    When('running with an orderId', async () => {
      definition = await createDefinition(source, { variables: { orderId: 42 } });
      waiting = await runToWait(definition);
    });

    Then('the waiting task exposes the message and the resolved correlation key', () => {
      expect(waiting.content.subscription).to.deep.equal({
        message: { id: 'Message_1', name: 'order-paid' },
        correlationKey: 42,
      });
    });

    When('the message is delivered to the waiting task', async () => {
      const ended = completion(definition);
      const [api] = definition.getPostponed().filter((a) => a.id === 'receive');
      api.signal({ receipt: 'r-42' });
      await ended;
    });

    Then('the process completes with the message payload as output', () => {
      expect(definition.environment.output).to.deep.equal({ receipt: 'r-42' });
    });
  });

  Scenario('an intermediate catch event referencing the message', () => {
    let source, definition, waiting;

    Given('a process with a message catch event, correlated on the orderId variable', async () => {
      source = await new ProcessBuilder('catch-correlate')
        .message('Message_1', 'order-paid', { correlationKey: '= orderId' })
        .startEvent('start')
        .messageCatchEvent('catch', 'Message_1')
        .endEvent('end')
        .connect('start', 'catch')
        .connect('catch', 'end')
        .toXML();
    });

    When('running with an orderId', async () => {
      definition = await createDefinition(source, { variables: { orderId: 'order-1' } });
      waiting = await runToWait(definition);
    });

    Then('the waiting event exposes the message and the resolved correlation key', () => {
      expect(waiting.content.subscription).to.deep.equal({
        message: { id: 'Message_1', name: 'order-paid' },
        correlationKey: 'order-1',
      });
    });

    When('the message is delivered to the waiting event', async () => {
      const ended = completion(definition);
      const [api] = definition.getPostponed().filter((a) => a.id === 'catch');
      api.signal();
      await ended;
    });

    Then('the process completes', () => {
      expect(definition.counters.completed).to.equal(1);
    });
  });

  Scenario('an incoming message is routed to the instance with the matching key', () => {
    let source;
    /** @type {import('bpmn-elements').Definition[]} */
    let instances;

    Given('a process waiting for order-paid, correlated on the orderId variable', async () => {
      source = await buildWaitingReceiveTask('= orderId');
    });

    And('two instances are waiting, with different orderIds', async () => {
      instances = [
        await createDefinition(source, { variables: { orderId: 1 } }),
        await createDefinition(source, { variables: { orderId: 2 } }),
      ];
      await Promise.all(instances.map(runToWait));
    });

    When('a message with the second orderId arrives, routed by correlation key', async () => {
      const incoming = { name: 'order-paid', correlationKey: 2, payload: { receipt: 'r-2' } };

      for (const instance of instances) {
        const match = instance
          .getPostponed()
          .find(
            (a) =>
              a.content.subscription?.message.name === incoming.name && a.content.subscription.correlationKey === incoming.correlationKey
          );
        if (!match) continue;
        const ended = completion(instance);
        match.signal(incoming.payload);
        await ended;
      }
    });

    Then('the matching instance completed with the message payload', () => {
      expect(instances[1].counters.completed).to.equal(1);
      expect(instances[1].environment.output).to.deep.equal({ receipt: 'r-2' });
    });

    And('the other instance is still waiting', () => {
      expect(instances[0].counters.completed).to.equal(0);
      expect(instances[0].getPostponed().some((a) => a.id === 'receive')).to.be.true;
    });
  });

  Scenario('a message without a subscription', () => {
    let source, definition, waiting;

    Given('a process waiting for a message that declares no correlation key', async () => {
      source = await buildWaitingReceiveTask(undefined);
    });

    When('running', async () => {
      definition = await createDefinition(source, {});
      waiting = await runToWait(definition);
    });

    Then('the waiting task content has no subscription', () => {
      expect(waiting.content).to.not.have.property('subscription');
    });

    When('the message is delivered by name alone', async () => {
      const ended = completion(definition);
      const [api] = definition.getPostponed().filter((a) => a.id === 'receive');
      api.signal();
      await ended;
    });

    Then('the process completes', () => {
      expect(definition.counters.completed).to.equal(1);
    });
  });
});
