import { ProcessBuilder } from '../helpers/factory.js';
import { execute } from '../helpers/testHelpers.js';

Feature('Sequence flow FEEL conditions', () => {
  /**
   * Build a process that forks on an exclusive gateway: the `big` flow is taken when
   * `total > 100`, otherwise the `small` flow.
   */
  function buildRouter() {
    return new ProcessBuilder('router')
      .startEvent('start')
      .exclusiveGateway('decide')
      .serviceTask('big', { jobType: 'mark', io: { output: [{ source: '= "big"', target: 'size' }] } })
      .serviceTask('small', { jobType: 'mark', io: { output: [{ source: '= "small"', target: 'size' }] } })
      .endEvent('end')
      .connect('start', 'decide')
      .connect('decide', 'big', '= total > 100')
      .connect('decide', 'small', '= total <= 100')
      .connect('big', 'end')
      .connect('small', 'end')
      .toXML();
  }

  const services = { mark: (_, cb) => cb(null, {}) };

  Scenario('the condition that evaluates to true is taken', () => {
    let source, definition;

    Given('a process forking on a FEEL condition', async () => {
      source = await buildRouter();
    });

    When('it runs with a total above the threshold', async () => {
      definition = await execute(source, { variables: { total: 250 }, services });
    });

    Then('the big branch is taken', () => {
      expect(definition.environment.output).to.deep.equal({ size: 'big' });
    });
  });

  Scenario('the other branch when the condition is false', () => {
    let source, definition;

    Given('a process forking on a FEEL condition', async () => {
      source = await buildRouter();
    });

    When('it runs with a total below the threshold', async () => {
      definition = await execute(source, { variables: { total: 10 }, services });
    });

    Then('the small branch is taken', () => {
      expect(definition.environment.output).to.deep.equal({ size: 'small' });
    });
  });
});
