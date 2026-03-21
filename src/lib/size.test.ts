import { describe, it, expect } from 'vitest';
import { formatSize } from './size';

describe('formatSize', () => {
  it('formats BigInt bytes into Go', () => {
    const oneGb = BigInt(1024 ** 3);
    const res = formatSize(oneGb);
    expect(res.unit).toBe('Go');
    expect(res.value).toBe('1.0');
  });

  it('formats BigInt terabytes correctly', () => {
    const oneTb = BigInt(1024) ** BigInt(4);
    const res = formatSize(oneTb);
    expect(res.unit).toBe('To');
    // one TB => 1.00 To
    expect(res.value).toBe('1.00');
  });

  it('handles number inputs', () => {
    const val = formatSize(500 * 1024 * 1024); // 500 MB
    expect(val.unit).toBe('Go');
    // 500 MB ~ 0.5 GB => displayed 0.5
    expect(val.value).toBe('0.5');
  });
});
