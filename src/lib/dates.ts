// Pure date-range helpers shared by booking-management and the assistant.
// No date library: the app only ever deals in whole calendar days (YYYY-MM-DD),
// so a handful of string/UTC-math functions is less code and fewer edge cases
// than pulling in a library built for timezones and durations we don't have.

export interface DateRange {
  /** Inclusive check-in date, YYYY-MM-DD. */
  checkin: string;
  /** Exclusive check-out date, YYYY-MM-DD (matches Postgres daterange '[)'). */
  checkout: string;
}

export function toPgRange(range: DateRange): string {
  return `[${range.checkin},${range.checkout})`;
}

export function nights(range: DateRange): number {
  return daysBetween(range.checkin, range.checkout);
}

export function daysBetween(a: string, b: string): number {
  return Math.round((Date.parse(b) - Date.parse(a)) / 86_400_000);
}

export function overlaps(a: DateRange, b: DateRange): boolean {
  return a.checkin < b.checkout && b.checkin < a.checkout;
}

export function addDays(date: string, days: number): string {
  const d = new Date(`${date}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

export function shiftRange(range: DateRange, days: number): DateRange {
  return { checkin: addDays(range.checkin, days), checkout: addDays(range.checkout, days) };
}

export function isValidRange(range: DateRange): boolean {
  return range.checkin < range.checkout;
}

export function todayISO(): string {
  return new Date().toISOString().slice(0, 10);
}
