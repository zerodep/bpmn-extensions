import { Properties } from '../../src/extensions/Properties.js';

const elementApi = { environment: { variables: { factor: 2 } } };

Feature('Properties edge cases', () => {
  Scenario('a property without a name is skipped', () => {
    Then('only named properties are resolved (and FEEL values evaluated)', () => {
      const properties = new Properties({ properties: [{ value: 'orphan' }, { name: 'doubled', value: '= factor * 3' }] });
      expect(properties.resolve(elementApi)).to.deep.equal({ doubled: 6 });
    });
  });

  Scenario('a properties element with no properties', () => {
    Then('it resolves to an empty object', () => {
      expect(new Properties({}).resolve(elementApi)).to.deep.equal({});
    });
  });
});
