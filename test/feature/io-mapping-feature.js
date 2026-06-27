import { ProcessBuilder } from '../helpers/factory.js';
import { execute } from '../helpers/testHelpers.js';

Feature('Io mapping', () => {
  Scenario('input mapping evaluates against process variables', () => {
    let source, input;

    Given('a service task with input parameters', async () => {
      source = await new ProcessBuilder('p')
        .startEvent('start')
        .serviceTask('task', {
          jobType: 'job',
          io: {
            input: [
              { source: '= customer.name', target: 'who' },
              { source: '= items[1]', target: 'first' },
              { source: 'literal', target: 'constant' },
            ],
          },
        })
        .endEvent('end')
        .connect('start', 'task')
        .connect('task', 'end')
        .toXML();
    });

    When('it runs', async () => {
      await execute(source, {
        variables: { customer: { name: 'Ada' }, items: ['a', 'b'] },
        services: {
          job(elementApi, cb) {
            input = elementApi.content.input;
            cb(null, {});
          },
        },
      });
    });

    Then('FEEL sources are evaluated and static sources pass through', () => {
      expect(input).to.deep.equal({ who: 'Ada', first: 'a', constant: 'literal' });
    });
  });

  Scenario('output mapping merges the job result back into variables', () => {
    let source, definition, downstreamInput;

    Given('two service tasks where the second reads the first task output', async () => {
      source = await new ProcessBuilder('p')
        .startEvent('start')
        .serviceTask('first', { jobType: 'a', io: { output: [{ source: '= result.token', target: 'auth.token' }] } })
        .serviceTask('second', { jobType: 'b', io: { input: [{ source: '= auth.token', target: 'bearer' }] } })
        .endEvent('end')
        .connect('start', 'first')
        .connect('first', 'second')
        .connect('second', 'end')
        .toXML();
    });

    When('it runs', async () => {
      definition = await execute(source, {
        services: {
          a: (_, cb) => cb(null, { result: { token: 'secret' } }),
          b(elementApi, cb) {
            downstreamInput = elementApi.content.input;
            cb(null, {});
          },
        },
      });
    });

    Then('the mapped output is visible to the downstream task', () => {
      expect(downstreamInput).to.deep.equal({ bearer: 'secret' });
    });

    And('the mapped output is surfaced as process output', () => {
      expect(definition.environment.output).to.deep.equal({ auth: { token: 'secret' } });
    });
  });

  Scenario('without output mapping the whole job result is merged', () => {
    let source, definition;

    Given('a service task without output mapping', async () => {
      source = await new ProcessBuilder('p')
        .startEvent('start')
        .serviceTask('task', { jobType: 'job' })
        .endEvent('end')
        .connect('start', 'task')
        .connect('task', 'end')
        .toXML();
    });

    When('the worker returns variables', async () => {
      definition = await execute(source, { services: { job: (_, cb) => cb(null, { a: 1, b: 2 }) } });
    });

    Then('all returned variables become process output', () => {
      expect(definition.environment.output).to.deep.equal({ a: 1, b: 2 });
    });
  });

  Scenario('parameters without a target are skipped', () => {
    let source, input, definition;

    Given('a service task with input and output parameters missing a target', async () => {
      source = await new ProcessBuilder('p')
        .startEvent('start')
        .serviceTask('task', {
          jobType: 'job',
          io: {
            input: [{ source: '= 1' }, { source: '= 2', target: 'kept' }],
            output: [{ source: '= 3' }, { source: '= ok', target: 'done' }],
          },
        })
        .endEvent('end')
        .connect('start', 'task')
        .connect('task', 'end')
        .toXML();
    });

    When('it runs', async () => {
      definition = await execute(source, {
        services: {
          job(elementApi, cb) {
            input = elementApi.content.input;
            cb(null, { ok: true });
          },
        },
      });
    });

    Then('only the parameters with a target are mapped', () => {
      expect(input).to.deep.equal({ kept: 2 });
      expect(definition.environment.output).to.deep.equal({ done: true });
    });
  });

  Scenario('a malformed input mapping faults the activity on enter', () => {
    let error;

    When('a service task with an invalid FEEL input source runs', async () => {
      const source = await new ProcessBuilder('p')
        .startEvent('start')
        .serviceTask('task', { jobType: 'job', io: { input: [{ source: '= 1 +', target: 'x' }] } })
        .endEvent('end')
        .connect('start', 'task')
        .connect('task', 'end')
        .toXML();
      try {
        await execute(source, { services: { job: (_, cb) => cb(null, {}) } });
      } catch (err) {
        error = err;
      }
    });

    Then('it fails', () => {
      expect(error).to.be.an('error');
    });
  });

  Scenario('a malformed output mapping faults the activity on completion', () => {
    let error;

    When('a service task with an invalid FEEL output source runs', async () => {
      const source = await new ProcessBuilder('p')
        .startEvent('start')
        .serviceTask('task', { jobType: 'job', io: { output: [{ source: '= 1 +', target: 'x' }] } })
        .endEvent('end')
        .connect('start', 'task')
        .connect('task', 'end')
        .toXML();
      try {
        await execute(source, { services: { job: (_, cb) => cb(null, {}) } });
      } catch (err) {
        error = err;
      }
    });

    Then('it fails', () => {
      expect(error).to.be.an('error');
    });
  });

  Scenario('nested output targets sharing a prefix are merged into one object', () => {
    let source, definition;

    Given('a service task with two outputs under the same dotted prefix', async () => {
      source = await new ProcessBuilder('p')
        .startEvent('start')
        .serviceTask('task', {
          jobType: 'job',
          io: {
            output: [
              { source: '= 1', target: 'totals.first' },
              { source: '= 2', target: 'totals.second' },
            ],
          },
        })
        .endEvent('end')
        .connect('start', 'task')
        .connect('task', 'end')
        .toXML();
    });

    When('it runs', async () => {
      definition = await execute(source, { services: { job: (_, cb) => cb(null, {}) } });
    });

    Then('both values land on the same object (the intermediate object is reused)', () => {
      expect(definition.environment.output).to.deep.equal({ totals: { first: 1, second: 2 } });
    });
  });
});
