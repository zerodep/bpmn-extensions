import { ProcessBuilder } from '../helpers/factory.js';
import { createDefinition } from '../helpers/testHelpers.js';

/**
 * Run a single-user-task process, capturing the user task's content when it waits, then
 * signalling it so the process completes.
 */
async function runUserTask(config, options) {
  const source = await new ProcessBuilder('p')
    .startEvent('start')
    .userTask('task', config)
    .endEvent('end')
    .connect('start', 'task')
    .connect('task', 'end')
    .toXML();

  const definition = await createDefinition(source, options);
  let waitContent;
  definition.on('activity.wait', (api) => {
    if (api.content.id === 'task') {
      waitContent = api.content;
      api.signal();
    }
  });
  await new Promise((resolve, reject) => {
    definition.once('leave', resolve);
    definition.once('error', reject);
    definition.run();
  });
  return waitContent;
}

Feature('User task', () => {
  Scenario('assignment definition resolves assignee and candidates', () => {
    let content;

    Given('a user task with an assignment definition', async () => {
      content = await runUserTask(
        { assignment: { assignee: '= owner', candidateUsers: 'alice, bob', candidateGroups: '= teams' } },
        { variables: { owner: 'carol', teams: ['admins', 'ops'] } }
      );
    });

    Then('the assignee FEEL expression is resolved', () => {
      expect(content.assignee).to.equal('carol');
    });

    And('a comma-separated candidate users string becomes a trimmed list', () => {
      expect(content.candidateUsers).to.deep.equal(['alice', 'bob']);
    });

    And('a FEEL candidate groups expression that yields a list is used as-is', () => {
      expect(content.candidateGroups).to.deep.equal(['admins', 'ops']);
    });
  });

  Scenario('documentation becomes the description', () => {
    let content;

    Given('a user task with documentation containing a FEEL expression', async () => {
      content = await runUserTask({ documentation: '= "ticket for " + customer' }, { variables: { customer: 'acme' } });
    });

    Then('the resolved documentation is the description', () => {
      expect(content.description).to.equal('ticket for acme');
    });
  });

  Scenario('properties are resolved onto the content', () => {
    let content;

    Given('a user task with properties (FEEL and static)', async () => {
      content = await runUserTask({ properties: { region: '= region', tier: 'gold' } }, { variables: { region: 'eu' } });
    });

    Then('FEEL property values are evaluated and static ones pass through', () => {
      expect(content.properties).to.deep.equal({ region: 'eu', tier: 'gold' });
    });
  });

  Scenario('a form definition is exposed on the content', () => {
    let content;

    Given('a native user task with a linked form and FEEL external reference', async () => {
      content = await runUserTask(
        { userTask: true, form: { formId: 'order-form', externalReference: '= "form-" + tenant' } },
        { variables: { tenant: 'acme' } }
      );
    });

    Then('the form is resolved onto the content so a task list can render it', () => {
      // bindingType defaults to "latest" in the schema.
      expect(content.form).to.deep.equal({ formId: 'order-form', externalReference: 'form-acme', bindingType: 'latest' });
    });
  });

  Scenario('a form referenced by key and version tag', () => {
    let content;

    Given('a user task with a form key and version tag', async () => {
      content = await runUserTask({ form: { formKey: 'order-form', versionTag: 'v2' } }, {});
    });

    Then('only the declared form fields are exposed', () => {
      expect(content.form).to.deep.equal({ formKey: 'order-form', versionTag: 'v2', bindingType: 'latest' });
    });
  });

  Scenario('candidate users that resolve to a non-string, non-list value are dropped', () => {
    let content;

    Given('a user task whose candidate users FEEL yields a number', async () => {
      content = await runUserTask({ assignment: { candidateUsers: '= 42' } }, {});
    });

    Then('no candidate users are set on the content', () => {
      expect(content.candidateUsers).to.equal(undefined);
    });
  });
});
