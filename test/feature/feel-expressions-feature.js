import { isFeelExpression, evaluateFeel, evaluateFeelUnaryTest, resolveValue, FeelExpressions } from '../../src/index.js';

Feature('FEEL expressions', () => {
  Scenario('recognising FEEL expressions', () => {
    Then('a string starting with = is a FEEL expression', () => {
      expect(isFeelExpression('= total > 1')).to.be.true;
      expect(isFeelExpression('=total')).to.be.true;
    });

    And('a plain string or non-string is not', () => {
      expect(isFeelExpression('total')).to.be.false;
      expect(isFeelExpression(42)).to.be.false;
      expect(isFeelExpression(undefined)).to.be.false;
    });
  });

  Scenario('evaluating expressions against variables', () => {
    let result;
    When('an arithmetic expression is evaluated', () => {
      result = evaluateFeel('= order.total * quantity', { order: { total: 10 }, quantity: 3 });
    });

    Then('the result is computed', () => {
      expect(result).to.equal(30);
    });

    When('a built-in function is used', () => {
      result = evaluateFeel('= upper case(name)', { name: 'bob' });
    });

    Then('it resolves', () => {
      expect(result).to.equal('BOB');
    });

    When('an expression is evaluated without a context', () => {
      result = evaluateFeel('= 1 + 1');
    });

    Then('it evaluates against an empty scope', () => {
      expect(result).to.equal(2);
    });

    When('a list comprehension is evaluated', () => {
      result = evaluateFeel('= for n in nums return n * 2', { nums: [1, 2, 3] });
    });

    Then('it returns a list', () => {
      expect(result).to.deep.equal([2, 4, 6]);
    });
  });

  Scenario('unary tests', () => {
    Then('an input is tested against a unary test', () => {
      expect(evaluateFeelUnaryTest('> 100', 150)).to.be.true;
      expect(evaluateFeelUnaryTest('> 100', 50)).to.be.false;
      expect(evaluateFeelUnaryTest('1, 2, 3', 2)).to.be.true;
    });
  });

  Scenario('resolving static values vs expressions', () => {
    Then('a static literal passes through untouched', () => {
      expect(resolveValue('plain text', {})).to.equal('plain text');
    });

    And('a FEEL expression is evaluated', () => {
      expect(resolveValue('= greeting', { greeting: 'hi' })).to.equal('hi');
    });
  });

  Scenario('the bpmn-elements expressions adapter', () => {
    const expressions = FeelExpressions();

    Then('isExpression / hasExpression follow the = convention', () => {
      expect(expressions.isExpression('= a')).to.be.true;
      expect(expressions.hasExpression('static')).to.be.false;
    });

    And('resolveExpression evaluates against environment variables', () => {
      const context = { environment: { variables: { a: 2, b: 5 } } };
      expect(expressions.resolveExpression('= a + b', context)).to.equal(7);
    });

    And('a static value is returned as-is', () => {
      expect(expressions.resolveExpression('hello', { environment: { variables: {} } })).to.equal('hello');
    });
  });
});
