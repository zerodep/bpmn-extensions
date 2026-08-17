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

  describe('environment services in scope', () => {
    const context = {
      environment: {
        services: { double: (n) => n * 2 },
        variables: { n: 21 },
      },
    };

    it('a service is callable as a FEEL function under `services.`', () => {
      expect(expressions.resolveExpression('= services.double(n)', context)).to.equal(42);
    });

    it('FEEL named-argument invocation maps onto the JS parameter names', () => {
      expect(expressions.resolveExpression('= services.double(n: 3)', context)).to.equal(6);
    });

    it('a missing service resolves to null instead of throwing', () => {
      expect(expressions.resolveExpression('= services.nope(1)', context)).to.equal(null);
    });

    it('a variable named `services` shadows the overlay', () => {
      const shadowed = {
        environment: {
          services: { double: (n) => n * 2 },
          variables: { services: { double: 'not a function' } },
        },
      };
      expect(expressions.resolveExpression('= services.double', shadowed)).to.equal('not a function');
    });
  });
});
