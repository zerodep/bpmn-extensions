import { ProcessBuilder } from '../helpers/factory.js';
import { execute } from '../helpers/testHelpers.js';

Feature('Script task', () => {
  Scenario('a zeebe:script evaluates FEEL and assigns to its result variable', () => {
    let source, definition;

    Given('a script task with a FEEL expression and result variable', async () => {
      source = await new ProcessBuilder('p')
        .startEvent('start')
        .scriptTask('calc', { script: { expression: '= order.total * quantity', resultVariable: 'amount' } })
        .endEvent('end')
        .connect('start', 'calc')
        .connect('calc', 'end')
        .toXML();
    });

    When('it runs', async () => {
      definition = await execute(source, { variables: { order: { total: 10 }, quantity: 3 } });
    });

    Then('the result variable holds the evaluated value', () => {
      expect(definition.environment.output).to.deep.equal({ amount: 30 });
    });
  });

  Scenario('the script result is visible to downstream elements', () => {
    let source, downstreamInput;

    Given('a script task followed by a service task that reads its result', async () => {
      source = await new ProcessBuilder('p')
        .startEvent('start')
        .scriptTask('classify', { script: { expression: '= if total > 100 then "big" else "small"', resultVariable: 'size' } })
        .serviceTask('handle', { jobType: 'handle', io: { input: [{ source: '= size', target: 'kind' }] } })
        .endEvent('end')
        .connect('start', 'classify')
        .connect('classify', 'handle')
        .connect('handle', 'end')
        .toXML();
    });

    When('it runs', async () => {
      await execute(source, {
        variables: { total: 250 },
        services: {
          handle(elementApi, cb) {
            downstreamInput = elementApi.content.input;
            cb(null, {});
          },
        },
      });
    });

    Then('the downstream task sees the script result', () => {
      expect(downstreamInput).to.deep.equal({ kind: 'big' });
    });
  });

  Scenario('a script result can be remapped by output mapping', () => {
    let source, definition;

    Given('a script task with both a result variable and an output mapping', async () => {
      source = await new ProcessBuilder('p')
        .startEvent('start')
        .scriptTask('calc', {
          script: { expression: '= a + b', resultVariable: 'sum' },
          io: { output: [{ source: '= sum', target: 'totals.sum' }] },
        })
        .endEvent('end')
        .connect('start', 'calc')
        .connect('calc', 'end')
        .toXML();
    });

    When('it runs', async () => {
      definition = await execute(source, { variables: { a: 2, b: 5 } });
    });

    Then('the output mapping reads the script result', () => {
      expect(definition.environment.output).to.deep.equal({ totals: { sum: 7 } });
    });
  });

  Scenario('a failing FEEL expression faults the activity', () => {
    let source, error;

    Given('a script task with an invalid FEEL expression', async () => {
      source = await new ProcessBuilder('p')
        .startEvent('start')
        .scriptTask('boom', { script: { expression: '= 1 +', resultVariable: 'x' } })
        .endEvent('end')
        .connect('start', 'boom')
        .connect('boom', 'end')
        .toXML();
    });

    When('it runs', async () => {
      try {
        await execute(source, {});
      } catch (err) {
        error = err;
      }
    });

    Then('it fails', () => {
      expect(error).to.be.an('error');
    });
  });
});
