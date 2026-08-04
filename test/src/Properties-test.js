import { Properties } from '../../src/extensions/Properties.js';

const elementApi = { environment: { variables: { factor: 2 } } };

describe('Properties', () => {
  it('a property without a name is skipped — only named properties are resolved (and FEEL values evaluated)', () => {
    const properties = new Properties({ properties: [{ value: 'orphan' }, { name: 'doubled', value: '= factor * 3' }] });
    expect(properties.resolve(elementApi)).to.deep.equal({ doubled: 6 });
  });

  it('a properties element with no properties resolves to an empty object', () => {
    expect(new Properties({}).resolve(elementApi)).to.deep.equal({});
  });
});
