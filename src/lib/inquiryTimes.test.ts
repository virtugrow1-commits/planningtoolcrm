import { describe, it, expect } from 'vitest';
import { timesFromInquiry, parseHHMM, localDateFromIso } from './inquiryTimes';

describe('timesFromInquiry', () => {
  it('neemt de voorkeurstijd (dagdeel avond) over', () => {
    expect(timesFromInquiry({ preferredStartTime: '18:00', preferredEndTime: '22:00' })).toEqual({ startHour: 18, startMinute: 0, endHour: 22, endMinute: 0 });
  });
  it('houdt minuten', () => {
    expect(timesFromInquiry({ preferredStartTime: '13:30:00', preferredEndTime: '17:00:00' })).toEqual({ startHour: 13, startMinute: 30, endHour: 17, endMinute: 0 });
  });
  it('alleen starttijd: drie uur', () => {
    expect(timesFromInquiry({ preferredStartTime: '15:00' })).toEqual({ startHour: 15, startMinute: 0, endHour: 18, endMinute: 0 });
  });
  it('geen voorkeur: 09:00–17:00', () => {
    expect(timesFromInquiry({})).toEqual({ startHour: 9, startMinute: 0, endHour: 17, endMinute: 0 });
  });
  it('helpers', () => {
    expect(parseHHMM('25:00')).toBeNull();
    expect(localDateFromIso('2027-02-14')?.getDate()).toBe(14);
  });
});
