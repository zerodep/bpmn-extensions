import { readFile } from 'node:fs/promises';

import { ProcessBuilder } from '../helpers/factory.js';
import { execute } from '../helpers/testHelpers.js';

Feature('Business rule task', () => {
  Scenario('a called decision result is assigned to its result variable', () => {
    let source, definition, decisionInput;

    Given('a business rule task with a `zeebe:calledDecision`', async () => {
      source = await readFile(new URL('../resources/business-rule-task.bpmn', import.meta.url));
    });

    When('it runs with a decision service registered under the decision id', async () => {
      definition = await execute(source, {
        variables: { score: 720 },
        services: {
          'risk-rating'(elementApi, callback) {
            decisionInput = this.environment.variables.score;
            callback(null, this.environment.variables.score >= 700 ? 'gold' : 'silver');
          },
        },
      });
    });

    Then('the decision is resolved by the service named by the decision id', () => {
      expect(decisionInput).to.equal(720);
    });

    And('the decision result is named by the result variable', () => {
      expect(definition.environment.output).to.deep.equal({ rating: 'gold' });
    });
  });

  Scenario('a structured decision result is held whole under the result variable', () => {
    let source, definition;

    Given('a business rule task whose decision returns an object', async () => {
      source = await new ProcessBuilder('p')
        .startEvent('start')
        .businessRuleTask('decide', { calledDecision: { decisionId: 'pricing', resultVariable: 'quote' } })
        .endEvent('end')
        .connect('start', 'decide')
        .connect('decide', 'end')
        .toXML();
    });

    When('it runs', async () => {
      definition = await execute(source, {
        services: { pricing: (_, cb) => cb(null, { price: 99, currency: 'EUR' }) },
      });
    });

    Then('the whole decision output is the result variable value', () => {
      expect(definition.environment.output).to.deep.equal({ quote: { price: 99, currency: 'EUR' } });
    });
  });

  Scenario('a business rule task can also be a plain job worker', () => {
    let source, definition;

    Given('a business rule task with a `zeebe:taskDefinition` instead of a decision', async () => {
      source = await new ProcessBuilder('p')
        .startEvent('start')
        .businessRuleTask('rules', { jobType: 'apply-rules', io: { output: [{ source: '= approved', target: 'ok' }] } })
        .endEvent('end')
        .connect('start', 'rules')
        .connect('rules', 'end')
        .toXML();
    });

    When('it runs', async () => {
      definition = await execute(source, {
        services: { 'apply-rules': (_, cb) => cb(null, { approved: true }) },
      });
    });

    Then('it is dispatched to the worker like a service task', () => {
      expect(definition.environment.output).to.deep.equal({ ok: true });
    });
  });
});
