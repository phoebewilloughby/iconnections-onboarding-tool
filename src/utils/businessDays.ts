function isWeekend(date: Date): boolean {
  const day = date.getDay();
  return day === 0 || day === 6;
}

export function addBusinessDays(from: Date, days: number): Date {
  const result = new Date(from);
  const sign = days >= 0 ? 1 : -1;
  let remaining = Math.abs(days);
  while (remaining > 0) {
    result.setDate(result.getDate() + sign);
    if (!isWeekend(result)) remaining--;
  }
  return result;
}

export function subtractBusinessDays(from: Date, days: number): Date {
  return addBusinessDays(from, -days);
}

export function businessDaysBetween(start: Date, end: Date): number {
  const from = new Date(Math.min(start.getTime(), end.getTime()));
  const to = new Date(Math.max(start.getTime(), end.getTime()));
  let count = 0;
  const cursor = new Date(from);
  while (cursor < to) {
    cursor.setDate(cursor.getDate() + 1);
    if (!isWeekend(cursor)) count++;
  }
  return start <= end ? count : -count;
}

export function addMonths(date: Date, months: number): Date {
  const result = new Date(date);
  result.setMonth(result.getMonth() + months);
  return result;
}

export function nudge1Date(dueDate: Date): Date {
  return subtractBusinessDays(dueDate, 3);
}

export function nudge2Date(dueDate: Date): Date {
  return addBusinessDays(dueDate, 2);
}
