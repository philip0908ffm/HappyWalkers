import { nextWeekdayDate } from './dates';

describe('nextWeekdayDate', () => {
  // Dienstag, 17. November 2026, 15:00 Ortszeit
  const tue15 = new Date(2026, 10, 17, 15, 0);
  it('nimmt heute, wenn die Uhrzeit noch kommt', () => {
    expect(nextWeekdayDate(2, tue15, '18:00')).toBe('2026-11-17');
  });
  it('nimmt nächste Woche, wenn die Uhrzeit heute schon vorbei ist', () => {
    expect(nextWeekdayDate(2, tue15, '10:00')).toBe('2026-11-24');
  });
  it('findet den nächsten anderen Wochentag', () => {
    expect(nextWeekdayDate(4, tue15, '10:00')).toBe('2026-11-19');
  });
});
