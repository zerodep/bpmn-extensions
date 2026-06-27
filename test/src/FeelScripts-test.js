import { FeelScripts } from '../../src/extensions/FeelScripts.js';

Feature('FeelScripts edge cases', () => {
  const scripts = FeelScripts();

  Scenario('a script task without a zeebe:script extension', () => {
    Then('getScript returns undefined (no FEEL script to run)', () => {
      const activity = { behaviour: {} };
      expect(scripts.getScript('feel', activity)).to.equal(undefined);
    });

    And('an element with extension elements but no zeebe:Script also returns undefined', () => {
      const activity = { behaviour: { extensionElements: { values: [{ $type: 'zeebe:TaskDefinition', type: 'x' }] } } };
      expect(scripts.getScript('feel', activity)).to.equal(undefined);
    });
  });

  Scenario('a script task with a zeebe:script expression', () => {
    Then('the returned script evaluates the FEEL expression against the environment variables', () => {
      const activity = { behaviour: { extensionElements: { values: [{ $type: 'zeebe:Script', expression: '= a + b' }] } } };
      const script = scripts.getScript('feel', activity);
      let result;
      script.execute({ environment: { variables: { a: 2, b: 3 } } }, (_, value) => (result = value));
      expect(result).to.equal(5);
    });
  });

  Scenario('a non-FEEL (static) script expression', () => {
    Then('the raw value is returned without evaluation', () => {
      const activity = { behaviour: { extensionElements: { values: [{ $type: 'zeebe:Script', expression: 'literal' }] } } };
      const script = scripts.getScript('feel', activity);
      let result;
      script.execute({ environment: { variables: {} } }, (_, value) => (result = value));
      expect(result).to.equal('literal');
    });
  });
});
