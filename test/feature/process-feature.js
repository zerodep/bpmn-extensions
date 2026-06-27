import { ProcessBuilder } from '../helpers/factory.js';
import { createDefinition } from '../helpers/testHelpers.js';

function buildProcess(options) {
  return new ProcessBuilder('p', options).startEvent('start').endEvent('end').connect('start', 'end').toXML();
}

Feature('Process extensions', () => {
  Scenario('process documentation becomes the description variable', () => {
    let definition;

    Given('a process with documentation containing a FEEL expression', async () => {
      const source = await buildProcess({ documentation: '= "hello " + who' });
      definition = await createDefinition(source, { variables: { who: 'world' } });
    });

    When('it runs', async () => {
      await new Promise((resolve, reject) => {
        definition.once('leave', resolve);
        definition.once('error', reject);
        definition.run();
      });
    });

    Then('the resolved documentation is assigned to the process variables', () => {
      expect(definition.getProcesses()[0].environment.variables.description).to.equal('hello world');
    });
  });

  Scenario('a failing format faults the process', () => {
    let definition, error;

    Given('a process whose documentation is an invalid FEEL expression', async () => {
      const source = await buildProcess({ documentation: '= 1 +' });
      definition = await createDefinition(source, {});
    });

    When('it runs', async () => {
      await new Promise((resolve) => {
        definition.once('leave', () => resolve());
        definition.once('error', (err) => {
          error = err;
          resolve();
        });
        definition.run();
      });
    });

    Then('a format error is raised', () => {
      expect(error).to.be.an('error');
      expect(error.message).to.match(/<p>/);
    });
  });
});
