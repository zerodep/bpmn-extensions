import { Cron } from 'croner';
import * as elements from 'bpmn-elements';
import { Serializer, TypeResolver } from 'moddle-context-serializer';

import { extensions, extendFn, FeelExpressions, TimerEventDefinition } from '@0dep/bpmn-extensions';
import { ProcessBuilder } from '../helpers/factory.js';
import { createDefinition, getModdleContext, getSerializer } from '../helpers/testHelpers.js';

Feature('Timers', () => {
  Scenario('a process scheduled with a cron timer start event', () => {
    let definition;
    Given('a process starting every night at midnight', async () => {
      const source = await new ProcessBuilder('nightly')
        .startEvent('start', { timer: { timeCycle: '0 0 * * *' } })
        .serviceTask('task', { jobType: 'index' })
        .endEvent('end')
        .connect('start', 'task')
        .connect('task', 'end')
        .toXML();
      definition = await createDefinition(source, { services: { index: (_, next) => next() } });
    });

    When('run', () => {
      definition.run();
    });

    let start;
    Then('the run is paused at the start event', () => {
      [start] = definition.getPostponed();
      expect(start.type).to.equal('bpmn:StartEvent');
    });

    And('a timer expiring at the next cron run is registered', () => {
      const [timer] = definition.environment.timers.executing;
      const expected = /** @type {Date} */ (new Cron('0 0 * * *').nextRun());
      expect(timer.delay).to.be.above(0);
      expect(new Date(timer.expireAt).getTime()).to.be.closeTo(expected.getTime(), 1000);
    });

    And('the start event content exposes the schedule', () => {
      expect(start.content).to.have.property('scheduledStart', '0 0 * * *');
    });

    let end;
    When('the start event timer is cancelled', () => {
      end = definition.waitFor('leave');
      definition.cancelActivity({ id: start.id });
    });

    Then('the flow runs to completion', () => {
      return end;
    });
  });

  Scenario('a cron timer start event with the bpmn-elements default timer event definition', () => {
    let definition;
    Given('a process starting on a cron cycle, without the cron-capable definition installed', async () => {
      const source = await new ProcessBuilder('nightly')
        .startEvent('start', { timer: { timeCycle: '0 0 * * *' } })
        .endEvent('end')
        .connect('start', 'end')
        .toXML();
      const moddleContext = await getModdleContext(source);
      const serializer = Serializer(moddleContext, TypeResolver(/** @type {any} */ (elements)), extendFn);
      definition = new elements.Definition(elements.Context(serializer), {
        expressions: FeelExpressions(),
        extensions: { flowExtensions: extensions },
      });
    });

    let fail;
    When('run', () => {
      fail = definition.waitFor('error');
      definition.run();
    });

    Then('the run fails to parse the cycle as an ISO 8601 interval', async () => {
      const err = await fail;
      expect(err.content.error.message).to.match(/ISO 8601/);
    });

    And('no timer is registered', () => {
      expect(definition.environment.timers.executing).to.have.length(0);
    });
  });

  Scenario('an ISO 8601 cycle still works', () => {
    let definition;
    Given('a process starting every hour', async () => {
      const source = await new ProcessBuilder('hourly')
        .startEvent('start', { timer: { timeCycle: 'R/PT1H' } })
        .endEvent('end')
        .connect('start', 'end')
        .toXML();
      definition = await createDefinition(source);
    });

    When('run', () => {
      definition.run();
    });

    Then('a repeating hourly timer is registered', () => {
      const [timer] = definition.environment.timers.executing;
      expect(timer.delay).to.be.within(3600_000 - 1000, 3600_000);
    });

    And('the start event content exposes the schedule', () => {
      const [start] = definition.getPostponed();
      expect(start.content).to.have.property('scheduledStart', 'R/PT1H');
      definition.stop();
    });
  });

  Scenario('a FEEL timer cycle', () => {
    let definition;
    Given('a process starting on a cycle from a variable', async () => {
      const source = await new ProcessBuilder('feel')
        .startEvent('start', { timer: { timeCycle: '= schedule' } })
        .endEvent('end')
        .connect('start', 'end')
        .toXML();
      definition = await createDefinition(source, { variables: { schedule: '0 0 * * *' } });
    });

    When('run', () => {
      definition.run();
    });

    Then('the resolved cron cycle is registered as a timer', () => {
      const [timer] = definition.environment.timers.executing;
      expect(timer.delay).to.be.above(0);
      expect(new Date(timer.expireAt).getTime()).to.be.closeTo(/** @type {Date} */ (new Cron('0 0 * * *').nextRun()).getTime(), 1000);
    });

    And('the start event content exposes the unresolved schedule expression', () => {
      const [start] = definition.getPostponed();
      expect(start.content).to.have.property('scheduledStart', '= schedule');
      definition.stop();
    });
  });

  Scenario('a timer start event inside a sub process', () => {
    let definition;
    Given('a sub process with a timer start event', async () => {
      const source = `<?xml version="1.0" encoding="UTF-8"?>
      <definitions xmlns="http://www.omg.org/spec/BPMN/20100524/MODEL" id="def">
        <process id="p" isExecutable="true">
          <startEvent id="start" />
          <sequenceFlow id="to-sub" sourceRef="start" targetRef="sub" />
          <subProcess id="sub">
            <startEvent id="sub-start">
              <timerEventDefinition>
                <timeCycle xsi:type="tFormalExpression" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance">R/PT1H</timeCycle>
              </timerEventDefinition>
            </startEvent>
          </subProcess>
        </process>
      </definitions>`;
      definition = await createDefinition(source);
    });

    When('run', () => {
      definition.run();
    });

    let start;
    Then('the sub process start event waits on its timer', () => {
      const [sub] = definition.getPostponed();
      [, start] = sub.getPostponed();
      expect(start.id).to.equal('sub-start');
      expect(definition.environment.timers.executing).to.have.length(1);
    });

    And('no schedule is exposed - it runs whenever the parent does', () => {
      expect(start.content).to.not.have.property('scheduledStart');
      definition.stop();
    });
  });

  Scenario('extracting the timers of a definition without running it', () => {
    let serializer;
    Given('a process with a cron start event, a boundary duration timer, and a date timer', async () => {
      const source = `<?xml version="1.0" encoding="UTF-8"?>
      <definitions xmlns="http://www.omg.org/spec/BPMN/20100524/MODEL" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance" id="def">
        <process id="p" isExecutable="true">
          <startEvent id="start">
            <timerEventDefinition>
              <timeCycle xsi:type="tFormalExpression">0 1 * * *</timeCycle>
            </timerEventDefinition>
          </startEvent>
          <sequenceFlow id="to-task" sourceRef="start" targetRef="task" />
          <userTask id="task" />
          <boundaryEvent id="bound-timer" cancelActivity="false" attachedToRef="task">
            <timerEventDefinition>
              <timeDuration xsi:type="tFormalExpression">R3/PT1M</timeDuration>
            </timerEventDefinition>
          </boundaryEvent>
          <sequenceFlow id="to-wait" sourceRef="task" targetRef="wait" />
          <intermediateCatchEvent id="wait">
            <timerEventDefinition>
              <timeDate xsi:type="tFormalExpression">2099-01-01T00:00Z</timeDate>
            </timerEventDefinition>
          </intermediateCatchEvent>
        </process>
      </definitions>`;
      serializer = await getSerializer(source);
    });

    let timers;
    When('the serialized timers are listed', () => {
      timers = serializer.getTimers();
    });

    Then('all three timers are found with their parent element', () => {
      expect(timers.map((t) => [t.parent.id, t.timer.timerType, t.timer.value])).to.deep.equal([
        ['start', 'timeCycle', '0 1 * * *'],
        ['bound-timer', 'timeDuration', 'R3/PT1M'],
        ['wait', 'timeDate', '2099-01-01T00:00Z'],
      ]);
    });

    And('the start event is scheduled', () => {
      expect(serializer.getActivityById('start').behaviour).to.have.property('scheduledStart', '0 1 * * *');
      expect(serializer.getActivityById('wait').behaviour).to.not.have.property('scheduledStart');
    });

    And('each timer can be parsed to an expiry with the cron-capable definition', () => {
      const dummyActivity = /** @type {any} */ ({ id: 'dummy', broker: {}, environment: { Logger() {} } });
      for (const t of timers) {
        const ed = new TimerEventDefinition(dummyActivity, /** @type {any} */ ({ type: t.timer.type, behaviour: t.timer }));
        const parsed = ed.parse(/** @type {any} */ (t.timer.timerType), t.timer.value);
        expect(parsed.expireAt, t.parent.id).to.be.instanceOf(Date);
      }
    });
  });
});
