import { describe, it, expect } from 'vitest';
import { isFullyDeparted } from './employment';

describe('isFullyDeparted', () => {
  it('uit dienst bij bedrijf A, in dienst bij B: niet uit dienst', () => {
    expect(isFullyDeparted([{ departedAt: '2026-11-23' }, { departedAt: null }])).toBe(false);
  });
  it('uit dienst bij alle bedrijven: uit dienst', () => {
    expect(isFullyDeparted([{ departedAt: '2026-11-23' }, { departedAt: '2026-10-01' }])).toBe(true);
  });
  it('geen koppelingen: niet uit dienst', () => {
    expect(isFullyDeparted([])).toBe(false);
  });
});
