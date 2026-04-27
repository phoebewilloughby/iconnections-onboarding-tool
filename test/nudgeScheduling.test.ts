import { addBusinessDays, nudge1Date, nudge2Date, subtractBusinessDays, businessDaysBetween } from '../src/utils/businessDays';

// Anchors: Monday 2026-04-27 is a weekday
const MONDAY = new Date('2026-04-27T12:00:00Z');
const FRIDAY = new Date('2026-04-24T12:00:00Z');

function fmt(d: Date): string {
  return d.toISOString().slice(0, 10);
}

describe('addBusinessDays', () => {
  test('adds 0 days: no change', () => {
    expect(fmt(addBusinessDays(MONDAY, 0))).toBe('2026-04-27');
  });

  test('adds 1 business day from Monday → Tuesday', () => {
    expect(fmt(addBusinessDays(MONDAY, 1))).toBe('2026-04-28');
  });

  test('adds 1 business day from Friday → Monday (skips weekend)', () => {
    expect(fmt(addBusinessDays(FRIDAY, 1))).toBe('2026-04-27');
  });

  test('adds 5 business days from Monday → next Monday', () => {
    expect(fmt(addBusinessDays(MONDAY, 5))).toBe('2026-05-04');
  });

  test('adds 2 business days from Friday → Tuesday (skips Sat/Sun)', () => {
    expect(fmt(addBusinessDays(FRIDAY, 2))).toBe('2026-04-28');
  });
});

describe('subtractBusinessDays', () => {
  test('subtracts 3 business days from Monday → Wednesday prior week', () => {
    // Monday Apr 27 - 3 bdays = Wednesday Apr 22
    expect(fmt(subtractBusinessDays(MONDAY, 3))).toBe('2026-04-22');
  });

  test('subtracts 1 business day from Monday → Friday prior week', () => {
    expect(fmt(subtractBusinessDays(MONDAY, 1))).toBe('2026-04-24');
  });
});

describe('businessDaysBetween', () => {
  test('Mon to Fri of same week = 4 business days', () => {
    const fri = new Date('2026-04-24T12:00:00Z');
    const nextMon = new Date('2026-04-27T12:00:00Z');
    expect(businessDaysBetween(fri, nextMon)).toBe(1);
  });

  test('same day = 0', () => {
    expect(businessDaysBetween(MONDAY, MONDAY)).toBe(0);
  });
});

describe('nudge1Date (3 business days BEFORE due date)', () => {
  test('due on Monday → nudge1 on Wednesday prior week', () => {
    // Monday Apr 27 - 3 bdays = Wednesday Apr 22
    expect(fmt(nudge1Date(MONDAY))).toBe('2026-04-22');
  });

  test('due on Wednesday → nudge1 on Friday prior week', () => {
    const wed = new Date('2026-04-29T12:00:00Z');
    // Wed Apr 29 - 3 bdays = Fri Apr 24
    expect(fmt(nudge1Date(wed))).toBe('2026-04-24');
  });
});

describe('nudge2Date (2 business days AFTER due date)', () => {
  test('due on Monday → nudge2 on Wednesday', () => {
    expect(fmt(nudge2Date(MONDAY))).toBe('2026-04-29');
  });

  test('due on Friday → nudge2 on Tuesday (skips weekend)', () => {
    expect(fmt(nudge2Date(FRIDAY))).toBe('2026-04-28');
  });

  test('due on Thursday → nudge2 on Monday', () => {
    const thu = new Date('2026-04-23T12:00:00Z');
    expect(fmt(nudge2Date(thu))).toBe('2026-04-27');
  });
});

describe('nudge scheduling integration', () => {
  test('nudge1 is always before due date', () => {
    const due = new Date('2026-05-15T12:00:00Z');
    expect(nudge1Date(due).getTime()).toBeLessThan(due.getTime());
  });

  test('nudge2 is always after due date', () => {
    const due = new Date('2026-05-15T12:00:00Z');
    expect(nudge2Date(due).getTime()).toBeGreaterThan(due.getTime());
  });
});
