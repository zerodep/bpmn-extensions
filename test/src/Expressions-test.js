import { FeelExpressions } from '../../src/Expressions.js';

describe('FeelExpressions', () => {
  const expressions = FeelExpressions();

  it('element-local variables on the message content overlay the environment variables (e.g. a multi-instance item)', () => {
    const context = {
      environment: { variables: { item: 'global' } },
      content: { variables: { item: 'local' } },
    };
    expect(expressions.resolveExpression('= item', context)).to.equal('local');
  });

  it('with no environment the scope is empty and an unbound reference is null', () => {
    expect(expressions.resolveExpression('= missing', {})).to.equal(null);
  });
});
