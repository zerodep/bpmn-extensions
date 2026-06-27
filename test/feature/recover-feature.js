import { createDefinition } from '../helpers/testHelpers.js';

/**
 * Run a definition until it waits, stop it, capture state, then recover into a fresh definition and
 * resume to completion — signalling the waiting element. Returns the recovered definition and the
 * content the element waited with after resume.
 */
async function stopRecoverResume(source, options) {
  const first = await createDefinition(source, options);
  first.on('activity.wait', () => first.stop());
  first.run();
  const state = first.getState();

  const recovered = await createDefinition(source, options);
  recovered.recover(state);
  let resumedWait;
  recovered.on('activity.wait', (api) => {
    resumedWait = api.content;
    api.signal();
  });
  await new Promise((resolve, reject) => {
    recovered.once('leave', resolve);
    recovered.once('error', reject);
    recovered.resume();
  });
  return { recovered, resumedWait };
}

Feature('Stop, recover and resume', () => {
  Scenario('a user task survives a stop/recover/resume cycle and its extensions re-activate', () => {
    let result;

    Given('a process waiting on a user task whose assignee comes from a variable', async () => {
      const source = `<definitions xmlns="http://www.omg.org/spec/BPMN/20100524/MODEL" xmlns:zeebe="http://camunda.org/schema/zeebe/1.0" id="d">
        <process id="p" isExecutable="true">
          <startEvent id="start" /><sequenceFlow id="f1" sourceRef="start" targetRef="task" />
          <userTask id="task">
            <extensionElements><zeebe:assignmentDefinition assignee="= &#34;assigned-&#34; + owner" /></extensionElements>
          </userTask>
          <sequenceFlow id="f2" sourceRef="task" targetRef="end" /><endEvent id="end" />
        </process>
      </definitions>`;
      result = await stopRecoverResume(source, { variables: { owner: 'ada' } });
    });

    Then('on resume the assignment definition re-resolves from the recovered variable', () => {
      expect(result.resumedWait.assignee).to.equal('assigned-ada');
    });

    And('the recovered definition runs to completion', () => {
      expect(result.recovered.counters.completed).to.equal(1);
    });
  });

  Scenario('output produced before the stop is preserved through recovery', () => {
    let result;

    Given('a service task (io output) completes before the process waits on a user task', async () => {
      const source = `<definitions xmlns="http://www.omg.org/spec/BPMN/20100524/MODEL" xmlns:zeebe="http://camunda.org/schema/zeebe/1.0" id="d">
        <process id="p" isExecutable="true">
          <startEvent id="start" /><sequenceFlow id="f1" sourceRef="start" targetRef="calc" />
          <serviceTask id="calc">
            <extensionElements>
              <zeebe:taskDefinition type="calc" />
              <zeebe:ioMapping><zeebe:output source="= 41 + 1" target="answer" /></zeebe:ioMapping>
            </extensionElements>
          </serviceTask>
          <sequenceFlow id="f2" sourceRef="calc" targetRef="task" />
          <userTask id="task" />
          <sequenceFlow id="f3" sourceRef="task" targetRef="end" /><endEvent id="end" />
        </process>
      </definitions>`;
      result = await stopRecoverResume(source, { services: { calc: (_, cb) => cb(null, {}) } });
    });

    Then('the io-mapped output is still present after recovery completes', () => {
      expect(result.recovered.environment.output.answer).to.equal(42);
    });
  });

  Scenario('a sub process waiting on an inner user task survives recovery', () => {
    let result;

    Given('a process stopped while a sub process is active', async () => {
      const source = `<definitions xmlns="http://www.omg.org/spec/BPMN/20100524/MODEL" xmlns:zeebe="http://camunda.org/schema/zeebe/1.0" id="d">
        <process id="p" isExecutable="true">
          <startEvent id="start" /><sequenceFlow id="f1" sourceRef="start" targetRef="sub" />
          <subProcess id="sub">
            <startEvent id="ss" /><sequenceFlow id="sf1" sourceRef="ss" targetRef="inner" />
            <userTask id="inner" /><sequenceFlow id="sf2" sourceRef="inner" targetRef="se" />
            <endEvent id="se" />
          </subProcess>
          <sequenceFlow id="f2" sourceRef="sub" targetRef="end" /><endEvent id="end" />
        </process>
      </definitions>`;
      result = await stopRecoverResume(source, {});
    });

    Then('the sub process re-activates on resume and the definition completes', () => {
      expect(result.recovered.counters.completed).to.equal(1);
    });
  });
});
