import { describe, it, expect } from 'vitest';
import { resolutionFromDimensions } from './resolution';

describe('resolutionFromDimensions', () => {
  it('classifies 1440x1080 as 1080p (height-preferred)', () => {
    expect(resolutionFromDimensions(1440, 1080)).toBe('1080p');
  });

  it('falls back to width when height is missing (1440 -> 720p)', () => {
    expect(resolutionFromDimensions(1440, null)).toBe('720p');
  });

  it('classifies 2160 height as 4K', () => {
    expect(resolutionFromDimensions(3840, 2160)).toBe('4K');
  });

  it('classifies small heights as SD', () => {
    expect(resolutionFromDimensions(320, 240)).toBe('SD');
  });

  it('returns Unknown when no dims provided', () => {
    expect(resolutionFromDimensions(undefined, undefined)).toBe('Unknown');
  });
});
