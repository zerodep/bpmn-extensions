import { FeelScripts } from '../../src/extensions/FeelScripts.js';

describe('FeelScripts', () => {
  const scripts = FeelScripts();

  describe('a script task without a zeebe:script extension', () => {
    it('getScript returns undefined (no FEEL script to run)', () => {
      const activity = { id: 'task', behaviour: {} };
      expect(scripts.getScript('feel', activity)).to.equal(undefined);
    });

    it('an element with extension elements but no zeebe:Script also returns undefined', () => {
      const activity = { id: 'task', behaviour: { extensionElements: { values: [{ $type: 'zeebe:TaskDefinition', type: 'x' }] } } };
      expect(scripts.getScript('feel', activity)).to.equal(undefined);
    });
  });

  describe('a script task with a zeebe:script expression', () => {
    it('the returned script evaluates the FEEL expression against the environment variables', () => {
      const activity = { id: 'task', behaviour: { extensionElements: { values: [{ $type: 'zeebe:Script', expression: '= a + b' }] } } };
      const script = scripts.getScript('feel', activity);
      let result;
      script.execute(/** @type {any} */ ({ environment: { variables: { a: 2, b: 3 } } }), (_, value) => (result = value));
      expect(result).to.equal(5);
    });

    it('a non-FEEL (static) expression is returned raw without evaluation', () => {
      const activity = { id: 'task', behaviour: { extensionElements: { values: [{ $type: 'zeebe:Script', expression: 'literal' }] } } };
      const script = scripts.getScript('feel', activity);
      let result;
      script.execute(/** @type {any} */ ({ environment: { variables: {} } }), (_, value) => (result = value));
      expect(result).to.equal('literal');
    });
  });
});
