import { ProcessBuilder } from '../helpers/factory.js';
import { createDefinition, run } from '../helpers/testHelpers.js';

Feature('Extension loading', () => {
  Scenario('elements without zeebe extension data get no extension attached', () => {
    let definition;

    Given('a flow mixing plain elements with zeebe-configured ones', async () => {
      const source = await new ProcessBuilder('p')
        .startEvent('start')
        .task('bpmn:Task', 'plain')
        .userTask('marked', { userTask: true })
        .userTask('documented', { documentation: 'needs a look' })
        .serviceTask('job', { jobType: 'work' })
        .endEvent('end')
        .connect('start', 'plain')
        .connect('plain', 'marked')
        .connect('marked', 'documented')
        .connect('documented', 'job')
        .connect('job', 'end')
        .toXML();
      definition = await createDefinition(source, { services: { work: (_, cb) => cb(null) } });
    });

    Then('the plain task and the start and end events have none', () => {
      expect(definition.getActivityById('plain').extensions, 'plain task').to.be.undefined;
      expect(definition.getActivityById('start').extensions, 'start event').to.be.undefined;
      expect(definition.getActivityById('end').extensions, 'end event').to.be.undefined;
    });

    And('the zeebe-marked, documented and job-worker tasks have theirs', () => {
      expect(definition.getActivityById('marked').extensions, 'zeebe:userTask marker').to.be.ok;
      expect(definition.getActivityById('documented').extensions, 'documentation').to.be.ok;
      expect(definition.getActivityById('job').extensions, 'zeebe:taskDefinition').to.be.ok;
    });

    And('the process is always attached — a called process needs its input promoted', () => {
      expect(definition.getProcesses()[0].extensions).to.be.ok;
    });
  });

  Scenario('a zeebe-marked user task merges its completion payload, a plain one does not', () => {
    let definition;

    Given('a flow with a plain user task followed by a zeebe:userTask-marked one', async () => {
      const source = await new ProcessBuilder('p')
        .startEvent('start')
        .userTask('plain')
        .userTask('marked', { userTask: true })
        .endEvent('end')
        .connect('start', 'plain')
        .connect('plain', 'marked')
        .connect('marked', 'end')
        .toXML();
      definition = await createDefinition(source);
    });

    When('running, signalling each task with a payload', async () => {
      definition.on('activity.wait', (api) => {
        api.signal(api.content.id === 'plain' ? { fromPlain: 1 } : { fromMarked: 2 });
      });
      await run(definition);
    });

    Then('only the marked task payload was merged into the process output', () => {
      expect(definition.environment.output).to.deep.equal({ fromMarked: 2 });
    });
  });
});
