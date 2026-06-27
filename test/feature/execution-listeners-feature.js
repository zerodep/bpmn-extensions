import { readFile } from 'node:fs/promises';

import { ProcessBuilder } from '../helpers/factory.js';
import { execute } from '../helpers/testHelpers.js';

Feature('Execution listeners', () => {
  Scenario('start and end listeners run around the element', () => {
    let source, calls;

    Given('a service task with start and end execution listeners', async () => {
      calls = [];
      source = await new ProcessBuilder('p')
        .startEvent('start')
        .serviceTask('task', {
          jobType: 'work',
          executionListeners: [
            { eventType: 'start', type: 'before' },
            { eventType: 'end', type: 'after' },
          ],
        })
        .endEvent('end')
        .connect('start', 'task')
        .connect('task', 'end')
        .toXML();
    });

    When('it runs', async () => {
      await execute(source, {
        services: {
          // Listeners are called as (elementApi, { retries, headers }, callback).
          before: (_, _options, cb) => {
            calls.push('before');
            cb();
          },
          work: (_, cb) => {
            calls.push('work');
            cb(null, {});
          },
          after: (_, _options, cb) => {
            calls.push('after');
            cb();
          },
        },
      });
    });

    Then('the listeners run before and after the job', () => {
      expect(calls).to.deep.equal(['before', 'work', 'after']);
    });
  });

  Scenario('a failing start listener faults the activity', () => {
    let source, error;

    Given('a service task with a start listener that has no worker', async () => {
      source = await new ProcessBuilder('p')
        .startEvent('start')
        .serviceTask('task', { jobType: 'work', executionListeners: [{ eventType: 'start', type: 'missing' }] })
        .endEvent('end')
        .connect('start', 'task')
        .connect('task', 'end')
        .toXML();
    });

    When('it runs', async () => {
      try {
        await execute(source, { services: { work: (_, cb) => cb(null, {}) } });
      } catch (err) {
        error = err;
      }
    });

    Then('it fails', () => {
      expect(error)
        .to.be.an('error')
        .with.property('message')
        .that.match(/missing/);
    });
  });

  Scenario('start and end listeners run around a sub process', () => {
    // The factory authors flat processes, so a sub process with listeners is written inline.
    const source = `<definitions xmlns="http://www.omg.org/spec/BPMN/20100524/MODEL" xmlns:zeebe="http://camunda.org/schema/zeebe/1.0" id="d">
      <process id="p" isExecutable="true">
        <startEvent id="start" /><sequenceFlow id="f1" sourceRef="start" targetRef="sub" />
        <subProcess id="sub">
          <extensionElements>
            <zeebe:executionListeners>
              <zeebe:executionListener eventType="start" type="before" />
              <zeebe:executionListener eventType="end" type="after" />
            </zeebe:executionListeners>
          </extensionElements>
          <startEvent id="sub-start" /><sequenceFlow id="sf1" sourceRef="sub-start" targetRef="inner" />
          <task id="inner" /><sequenceFlow id="sf2" sourceRef="inner" targetRef="sub-end" />
          <endEvent id="sub-end" />
        </subProcess>
        <sequenceFlow id="f2" sourceRef="sub" targetRef="end" /><endEvent id="end" />
      </process>
    </definitions>`;
    let calls;

    When('a sub process with start and end execution listeners runs', async () => {
      calls = [];
      await execute(source, {
        services: {
          before: (_, _options, cb) => {
            calls.push('before');
            cb();
          },
          after: (_, _options, cb) => {
            calls.push('after');
            cb();
          },
        },
      });
    });

    Then('the listeners run before the sub process is entered and after it completes', () => {
      expect(calls).to.deep.equal(['before', 'after']);
    });
  });

  Scenario('a start listener whose worker errors faults the activity before the job runs', () => {
    let source, ran, error;

    Given('a service task with a start execution listener', async () => {
      source = await new ProcessBuilder('p')
        .startEvent('start')
        .serviceTask('task', { jobType: 'work', executionListeners: [{ eventType: 'start', type: 'before' }] })
        .endEvent('end')
        .connect('start', 'task')
        .connect('task', 'end')
        .toXML();
    });

    When('the start listener worker calls back with an error', async () => {
      ran = [];
      try {
        await execute(source, {
          services: {
            before: (_, _options, cb) => {
              ran.push('before');
              cb(new Error('listener boom'));
            },
            work: (_, cb) => {
              ran.push('work');
              cb(null, {});
            },
          },
        });
      } catch (err) {
        error = err;
      }
    });

    Then('the activity faults with the listener error', () => {
      expect(error)
        .to.be.an('error')
        .with.property('message')
        .that.match(/listener boom/);
    });

    And('the job never runs', () => {
      expect(ran).to.deep.equal(['before']);
    });
  });

  Scenario('an end listener whose worker errors faults the activity after the job ran', () => {
    let source, ran, error;

    Given('a service task with an end execution listener', async () => {
      source = await new ProcessBuilder('p')
        .startEvent('start')
        .serviceTask('task', { jobType: 'work', executionListeners: [{ eventType: 'end', type: 'after' }] })
        .endEvent('end')
        .connect('start', 'task')
        .connect('task', 'end')
        .toXML();
    });

    When('the end listener worker calls back with an error', async () => {
      ran = [];
      try {
        await execute(source, {
          services: {
            work: (_, cb) => {
              ran.push('work');
              cb(null, {});
            },
            after: (_, _options, cb) => {
              ran.push('after');
              cb(new Error('listener boom'));
            },
          },
        });
      } catch (err) {
        error = err;
      }
    });

    Then('it faults with the listener error', () => {
      expect(error)
        .to.be.an('error')
        .with.property('message')
        .that.match(/listener boom/);
    });

    And('the job had already run', () => {
      expect(ran).to.deep.equal(['work', 'after']);
    });
  });

  Scenario('listeners receive their retries and resolved headers', () => {
    let received;

    When('a service task with listeners carrying retries and headers runs', async () => {
      received = {};
      const source = await readFile(new URL('../resources/execution-listeners.bpmn', import.meta.url));
      await execute(source, {
        services: {
          'audit-start': (_, options, cb) => {
            received.start = options;
            cb();
          },
          work: (_, cb) => cb(null, {}),
          'audit-end': (_, options, cb) => {
            received.end = options;
            cb();
          },
        },
      });
    });

    Then('the start listener gets its retries and resolved task headers', () => {
      expect(received.start).to.deep.equal({ retries: 5, headers: { channel: 'audit', level: 'info' } });
    });

    And('a listener that declares neither retries nor headers gets an empty options object', () => {
      expect(received.end).to.deep.equal({});
    });
  });

  Scenario('a promise-returning listener blocks the activity until it settles', () => {
    let source, order;

    Given('a service task with a start listener that returns a promise instead of calling back', async () => {
      source = await new ProcessBuilder('p')
        .startEvent('start')
        .serviceTask('task', { jobType: 'work', executionListeners: [{ eventType: 'start', type: 'before' }] })
        .endEvent('end')
        .connect('start', 'task')
        .connect('task', 'end')
        .toXML();
    });

    When('it runs', async () => {
      order = [];
      await execute(source, {
        services: {
          before: async () => {
            await new Promise((resolve) => setTimeout(resolve, 10));
            order.push('before');
          },
          work: (_, cb) => {
            order.push('work');
            cb(null, {});
          },
        },
      });
    });

    Then('the job only runs after the async listener has resolved', () => {
      expect(order).to.deep.equal(['before', 'work']);
    });
  });

  Scenario('a non-numeric retries value is passed through untouched', () => {
    let source, received;

    Given('a service task with a start listener whose retries is not a number', async () => {
      source = await new ProcessBuilder('p')
        .startEvent('start')
        .serviceTask('task', { jobType: 'work', executionListeners: [{ eventType: 'start', type: 'before', retries: 'lots' }] })
        .endEvent('end')
        .connect('start', 'task')
        .connect('task', 'end')
        .toXML();
    });

    When('it runs', async () => {
      await execute(source, {
        services: {
          before: (_, options, cb) => {
            received = options;
            cb();
          },
          work: (_, cb) => cb(null, {}),
        },
      });
    });

    Then('retries keeps the raw value rather than NaN', () => {
      expect(received).to.deep.equal({ retries: 'lots' });
    });
  });
});
