import { Cron } from 'croner';
import { TimerEventDefinition } from '../../src/TimerEventDefinition.js';

describe('TimerEventDefinition', () => {
  const activity = /** @type {any} */ ({ id: 'timer', broker: {}, environment: { Logger: () => ({ error() {} }) } });
  const ed = new TimerEventDefinition(activity, /** @type {any} */ ({ type: 'bpmn:TimerEventDefinition', behaviour: {} }));

  it('supports cron and iso8601', () => {
    expect(ed.supports).to.deep.equal(['cron', 'iso8601']);
  });

  it('parses an ISO 8601 timeCycle', () => {
    const parsed = ed.parse('timeCycle', 'R3/PT1H');
    expect(parsed.repeat).to.equal(3);
    expect(parsed.delay).to.be.within(3600_000 - 100, 3600_000);
  });

  it('parses a cron timeCycle as the next run', () => {
    const parsed = ed.parse('timeCycle', '*/5 * * * *');
    expect(parsed.expireAt?.getTime()).to.be.closeTo(/** @type {Date} */ (new Cron('*/5 * * * *').nextRun()).getTime(), 100);
    expect(parsed.delay)
      .to.be.above(0)
      .and.at.most(5 * 60_000);
    expect(parsed.repeat).to.be.undefined;
  });

  it('parses a timeDuration and a timeDate as before', () => {
    expect(ed.parse('timeDuration', 'PT1M').delay).to.be.within(60_000 - 100, 60_000);
    expect(ed.parse('timeDate', '2099-01-01T00:00Z').expireAt?.toISOString()).to.equal('2099-01-01T00:00:00.000Z');
  });

  it('throws a RangeError with cause for a timeCycle that is neither ISO 8601 nor cron', () => {
    expect(() => ed.parse('timeCycle', 'every full moon'))
      .to.throw(RangeError, /every full moon/)
      .with.property('cause')
      .that.is.instanceOf(Error);
  });

  it('throws a RangeError for a cron that never runs (February 30th)', () => {
    expect(() => ed.parse('timeCycle', '0 0 30 2 *'))
      .to.throw(RangeError, /Failed to parse timeCycle <0 0 30 2 \*>/)
      .with.property('cause')
      .that.has.property('message', 'cron has no next run');
  });

  it('throws a RangeError for an invalid cron pattern', () => {
    expect(() => ed.parse('timeCycle', '0 0 1 1 * 2000')).to.throw(RangeError, /Failed to parse/);
  });

  it('still throws for a cron timeDuration', () => {
    expect(() => ed.parse('timeDuration', '0 0 * * *')).to.throw();
  });
});
