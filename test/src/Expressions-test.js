import { FeelExpressions } from '../../src/Expressions.js';

Feature('FeelExpressions scope edge cases', () => {
  const expressions = FeelExpressions();

  Scenario('element-local variables on the message content overlay the environment variables', () => {
    Then('the local value (e.g. a multi-instance item) wins', () => {
      const context = {
        environment: { variables: { item: 'global' } },
        content: { variables: { item: 'local' } },
      };
      expect(expressions.resolveExpression('= item', context)).to.equal('local');
    });
  });

  Scenario('resolving with no environment', () => {
    Then('the scope is empty and an unbound reference is null', () => {
      expect(expressions.resolveExpression('= missing', {})).to.equal(null);
    });
  });
});
