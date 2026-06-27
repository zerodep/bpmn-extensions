import { LoopCharacteristics } from '../../src/extensions/LoopCharacteristics.js';

Feature('LoopCharacteristics output aggregation edge cases', () => {
  Scenario('service-task instances are not wrapped in { executionId, output }', () => {
    Then('outputElement is evaluated against the raw instance output', () => {
      const loop = new LoopCharacteristics({ outputCollection: 'results', outputElement: '= n * 2' });
      // No executionId wrapper — this is what a multi-instance service task produces.
      expect(loop.aggregate({ 0: { n: 1 }, 1: { n: 2 }, 2: { n: 3 } }, {})).to.deep.equal([2, 4, 6]);
    });
  });

  Scenario('without an outputElement the whole instance output is collected', () => {
    Then('each (unwrapped) instance output is pushed as-is, in index order', () => {
      const loop = new LoopCharacteristics({ outputCollection: 'results' });
      const indexed = { 1: { executionId: 'b', output: { ok: 2 } }, 0: { executionId: 'a', output: { ok: 1 } } };
      expect(loop.aggregate(indexed, {})).to.deep.equal([{ ok: 1 }, { ok: 2 }]);
    });
  });

  Scenario('a missing or non-object instance map', () => {
    Then('aggregation yields an empty array', () => {
      const loop = new LoopCharacteristics({ outputCollection: 'results', outputElement: '= 1' });
      expect(loop.aggregate(undefined, {})).to.deep.equal([]);
      expect(loop.aggregate('not-an-object', {})).to.deep.equal([]);
    });
  });
});
