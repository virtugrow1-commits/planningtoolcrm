import { describe, it, expect } from 'vitest';
import { documentKind } from './documentKind';

describe('documentKind', () => {
  it('herkent de reserveringsbevestiging ook als GHL-type proposal is', () => {
    expect(documentKind('Reserveringsbevestiging_Zakelijk_sjabloon', 'proposal')).toBe('reserveringsbevestiging');
    expect(documentKind('Bevestiging reservering Jansen', 'proposal')).toBe('reserveringsbevestiging');
  });
  it('herkent offertes', () => {
    expect(documentKind('Sjabloon-Offerte_Zakelijke bijeenkomst', 'proposal')).toBe('offerte');
    expect(documentKind('Voorstel', 'proposal')).toBe('offerte');
  });
  it('overig', () => {
    expect(documentKind('Factuur 12', 'invoice')).toBe('overig');
  });
});
