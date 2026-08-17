import { ProcessBuilder } from '../helpers/factory.js';
import { createDefinition, execute } from '../helpers/testHelpers.js';

Feature('Environment services in FEEL scope', () => {
  /**
   * Build a process that forks on an exclusive gateway where the routing decision is a
   * service-backed FEEL function call, not an inline comparison.
   */
  function buildRouter() {
    return new ProcessBuilder('router')
      .startEvent('start')
      .exclusiveGateway('decide')
      .serviceTask('big', { jobType: 'mark', io: { output: [{ source: '= "big"', target: 'size' }] } })
      .serviceTask('small', { jobType: 'mark', io: { output: [{ source: '= "small"', target: 'size' }] } })
      .endEvent('end')
      .connect('start', 'decide')
      .connect('decide', 'big', '= services.isBig(total)')
      .connect('decide', 'small', '= not(services.isBig(total))')
      .connect('big', 'end')
      .connect('small', 'end')
      .toXML();
  }

  const routerServices = {
    isBig: (total) => total > 100,
    mark: (_, cb) => cb(null, {}),
  };

  Scenario('a sequence flow condition calls a service-backed function', () => {
    let source;

    Given('a process forking on a condition that calls `services.isBig(total)`', async () => {
      source = await buildRouter();
    });

    Then('the big branch is taken when the function returns true', async () => {
      const definition = await execute(source, { variables: { total: 250 }, services: routerServices });
      expect(definition.environment.output).to.deep.equal({ size: 'big' });
    });

    And('the small branch when it returns false', async () => {
      const definition = await execute(source, { variables: { total: 10 }, services: routerServices });
      expect(definition.environment.output).to.deep.equal({ size: 'small' });
    });
  });

  Scenario('io mapping resolves service-backed functions', () => {
    let source, definition;

    Given('a service task whose input and output mappings call services', async () => {
      source = await new ProcessBuilder('io')
        .startEvent('start')
        .serviceTask('charge', {
          jobType: 'charge',
          io: {
            input: [{ source: '= services.vat(net)', target: 'gross' }],
            output: [{ source: '= services.round(gross)', target: 'total' }],
          },
        })
        .endEvent('end')
        .connect('start', 'charge')
        .connect('charge', 'end')
        .toXML();
    });

    When('it runs with a worker that echoes its resolved input', async () => {
      definition = await execute(source, {
        variables: { net: 100 },
        services: {
          vat: (net) => net * 1.256,
          round: (value) => Math.round(value),
          charge: (executionMessage, callback) => callback(null, executionMessage.content.input),
        },
      });
    });

    Then('both mappings applied the service functions', () => {
      expect(definition.environment.output).to.deep.equal({ total: 126 });
    });
  });

  Scenario('a script task expression calls a service-backed function', () => {
    let source, definition;

    Given('a script task with a `zeebe:script` calling `services.discount(total)`', async () => {
      source = await new ProcessBuilder('scripted')
        .startEvent('start')
        .scriptTask('apply', { script: { expression: '= services.discount(total)', resultVariable: 'discounted' } })
        .endEvent('end')
        .connect('start', 'apply')
        .connect('apply', 'end')
        .toXML();
    });

    When('it runs', async () => {
      definition = await execute(source, {
        variables: { total: 200 },
        services: { discount: (total) => total * 0.9 },
      });
    });

    Then('the script result comes from the service function', () => {
      expect(definition.environment.output).to.deep.equal({ discounted: 180 });
    });
  });

  Scenario('a service-backed condition survives stop, state serialization and recovery', () => {
    let source, state;
    const services = {
      isBig: (total) => total > 100,
      mark: (_, cb) => cb(null, {}),
    };

    Given('a process where a user task precedes the service-backed routing condition', async () => {
      source = await new ProcessBuilder('resumable')
        .startEvent('start')
        .userTask('review')
        .exclusiveGateway('decide')
        .serviceTask('big', { jobType: 'mark', io: { output: [{ source: '= "big"', target: 'size' }] } })
        .serviceTask('small', { jobType: 'mark', io: { output: [{ source: '= "small"', target: 'size' }] } })
        .endEvent('end')
        .connect('start', 'review')
        .connect('review', 'decide')
        .connect('decide', 'big', '= services.isBig(total)')
        .connect('decide', 'small', '= not(services.isBig(total))')
        .connect('big', 'end')
        .connect('small', 'end')
        .toXML();
    });

    When('it is stopped on the user task and the state is JSON-serialized', async () => {
      const first = await createDefinition(source, { variables: { total: 250 }, services });
      first.on('activity.wait', () => first.stop());
      first.run();
      // The round-trip is the point: a function smuggled through variables would be dropped
      // here, while services are re-supplied by the host at recover time.
      state = JSON.parse(JSON.stringify(first.getState()));
    });

    Then('a fresh definition recovered with re-supplied services resumes through the condition', async () => {
      const recovered = await createDefinition(source, { services });
      recovered.recover(state);
      recovered.on('activity.wait', (api) => api.signal());
      await new Promise((resolve, reject) => {
        recovered.once('leave', resolve);
        recovered.once('error', reject);
        recovered.resume();
      });
      expect(recovered.environment.output).to.deep.equal({ size: 'big' });
    });
  });
});
