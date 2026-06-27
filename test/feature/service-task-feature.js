import { ProcessBuilder } from '../helpers/factory.js';
import { execute } from '../helpers/testHelpers.js';

Feature('Service task', () => {
  Scenario('a service task backed by a task definition', () => {
    let source, calledWith, definition;

    Given('a process with a service task that has a task definition and io mapping', async () => {
      source = await new ProcessBuilder('billing')
        .startEvent('start')
        .serviceTask('charge', {
          jobType: 'charge-card',
          io: {
            input: [{ source: '= order.total', target: 'amount' }],
            output: [{ source: '= transactionId', target: 'receipt.id' }],
          },
        })
        .endEvent('end')
        .connect('start', 'charge')
        .connect('charge', 'end')
        .toXML();
    });

    When('it runs with a worker registered for the job type', async () => {
      definition = await execute(source, {
        variables: { order: { total: 199 } },
        services: {
          'charge-card'(elementApi, callback) {
            calledWith = elementApi.content.input;
            callback(null, { transactionId: 'tx-1' });
          },
        },
      });
    });

    Then('the worker received the mapped input', () => {
      expect(calledWith).to.deep.equal({ amount: 199 });
    });

    And('the output mapping wrote the job result to the process output', () => {
      expect(definition.environment.output).to.deep.equal({ receipt: { id: 'tx-1' } });
    });
  });

  Scenario('a missing worker', () => {
    let source, error;

    Given('a process with a service task whose job type has no worker', async () => {
      source = await new ProcessBuilder('p')
        .startEvent('start')
        .serviceTask('task', { jobType: 'unknown-job' })
        .endEvent('end')
        .connect('start', 'task')
        .connect('task', 'end')
        .toXML();
    });

    When('it runs', async () => {
      try {
        await execute(source, { services: {} });
      } catch (err) {
        error = err;
      }
    });

    Then('it fails because the service is not implemented', () => {
      expect(error).to.be.an('error');
      expect(error.message).to.match(/unknown-job/);
    });
  });

  Scenario('task headers passed to the worker', () => {
    let headers, source;

    Given('a service task with task headers', async () => {
      source = await new ProcessBuilder('p')
        .startEvent('start')
        .serviceTask('task', { jobType: 'job', headers: { priority: 'high', queue: 'orders' } })
        .endEvent('end')
        .connect('start', 'task')
        .connect('task', 'end')
        .toXML();
    });

    When('it runs', async () => {
      await execute(source, {
        services: {
          job(elementApi, callback) {
            headers = elementApi.content.headers;
            callback(null, {});
          },
        },
      });
    });

    Then('the worker can read the headers', () => {
      expect(headers).to.deep.equal({ priority: 'high', queue: 'orders' });
    });
  });

  Scenario('a job type that is an invalid FEEL expression', () => {
    let source, error;

    Given('a service task whose task definition type is invalid FEEL', async () => {
      source = await new ProcessBuilder('p')
        .startEvent('start')
        .serviceTask('task', { jobType: '= 1 +' })
        .endEvent('end')
        .connect('start', 'task')
        .connect('task', 'end')
        .toXML();
    });

    When('it runs', async () => {
      try {
        await execute(source, { services: {} });
      } catch (err) {
        error = err;
      }
    });

    Then('resolving the job type fails the activity', () => {
      expect(error).to.be.an('error');
    });
  });
});
