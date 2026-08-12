import { describe, it, expect } from 'vitest';
import { GHOST_LIBRARY_NAMES } from './libraryUtils';

describe('libraryUtils constants', () => {
  it('defines standard ghost library names', () => {
    expect(GHOST_LIBRARY_NAMES).toContain('Movies');
    expect(GHOST_LIBRARY_NAMES).toContain('TV Shows');
    expect(GHOST_LIBRARY_NAMES).toContain('Music');
    expect(GHOST_LIBRARY_NAMES).toContain('Books');
    expect(GHOST_LIBRARY_NAMES).toContain('Collections');
  });
});
