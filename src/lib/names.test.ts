import { describe, it, expect } from 'vitest';
import { normalizePersonName, normalizeCompanyName } from './names';

describe('normalizePersonName', () => {
  it('starts names with a capital', () => expect(normalizePersonName('jansen')).toBe('Jansen'));
  it('lowercases tussenvoegsels in the middle', () => expect(normalizePersonName('Jan Van Der Berg')).toBe('Jan van der Berg'));
  it('treats IJ as one letter', () => expect(normalizePersonName('ijsbrand')).toBe('IJsbrand'));
  it('IJ after a tussenvoegsel', () => expect(normalizePersonName('Piet van der ijssel')).toBe('Piet van der IJssel'));
  it('double names', () => expect(normalizePersonName('jan-willem')).toBe('Jan-Willem'));
  it('keeps typed capitals', () => expect(normalizePersonName('McDonald')).toBe('McDonald'));
  it('infix field is lowercase', () => expect(normalizePersonName('Van Der', { infix: true })).toBe('van der'));
});

describe('normalizeCompanyName', () => {
  it('keeps company name as typed', () => expect(normalizeCompanyName('Hotel De Kroon')).toBe('Hotel De Kroon'));
  it('first letter capital', () => expect(normalizeCompanyName('bakker en Zn')).toBe('Bakker en Zn'));
});
