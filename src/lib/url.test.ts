import { describe, expect, it } from 'vitest';
import { joinBase, ogSlugForPath } from './url';

describe('joinBase', () => {
  it('leaves root-relative paths alone when there is no base', () => {
    expect(joinBase('/', '/about/')).toBe('/about/');
    expect(joinBase('/', '/')).toBe('/');
  });

  it('prefixes the base without doubling the slash, whichever way the base is written', () => {
    expect(joinBase('/mental-models/', '/about/')).toBe('/mental-models/about/');
    expect(joinBase('/mental-models', '/about/')).toBe('/mental-models/about/');
    expect(joinBase('/mental-models/', '/')).toBe('/mental-models/');
  });
});

describe('ogSlugForPath', () => {
  it('maps the home page to index', () => {
    expect(ogSlugForPath('/', '/')).toBe('index');
    expect(ogSlugForPath('/mental-models/', '/mental-models/')).toBe('index');
  });

  it('uses the entry id for model pages and the first segment otherwise', () => {
    expect(ogSlugForPath('/mental-models/models/quorum-write/', '/mental-models/')).toBe('quorum-write');
    expect(ogSlugForPath('/models/quorum-write/', '/')).toBe('quorum-write');
    expect(ogSlugForPath('/mental-models/about/', '/mental-models/')).toBe('about');
    expect(ogSlugForPath('/mental-models/styleguide/', '/mental-models/')).toBe('styleguide');
  });
});
