import { TaskHeaders } from '../../src/extensions/TaskHeaders.js';

Feature('TaskHeaders edge cases', () => {
  Scenario('a header without a key is skipped', () => {
    Then('only headers that declare a key are resolved', () => {
      const headers = new TaskHeaders({ values: [{ value: 'orphan' }, { key: 'a', value: '1' }] });
      expect(headers.resolve()).to.deep.equal({ a: '1' });
    });
  });

  Scenario('a task headers element with no values', () => {
    Then('it resolves to an empty object', () => {
      expect(new TaskHeaders({}).resolve()).to.deep.equal({});
    });
  });
});
