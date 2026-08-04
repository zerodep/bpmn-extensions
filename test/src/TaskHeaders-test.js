import { TaskHeaders } from '../../src/extensions/TaskHeaders.js';

describe('TaskHeaders', () => {
  it('a header without a key is skipped — only headers that declare a key are resolved', () => {
    const headers = new TaskHeaders({ values: [{ value: 'orphan' }, { key: 'a', value: '1' }] });
    expect(headers.resolve()).to.deep.equal({ a: '1' });
  });

  it('a task headers element with no values resolves to an empty object', () => {
    expect(new TaskHeaders({}).resolve()).to.deep.equal({});
  });
});
