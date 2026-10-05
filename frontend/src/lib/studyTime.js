export const browserTimezone = () => Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC";
export function dateInZone(value = new Date(), timezone = browserTimezone()) {
  const parts = new Intl.DateTimeFormat("en-CA", { timeZone: timezone, year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(new Date(value));
  const part = type => parts.find(p => p.type === type).value;
  return `${part("year")}-${part("month")}-${part("day")}`;
}
export function shiftDate(day, count) {
  const d = new Date(`${day}T12:00:00Z`); d.setUTCDate(d.getUTCDate() + count);
  return d.toISOString().slice(0, 10);
}
export function localInstant(day, clock, timezone = browserTimezone()) {
  const wall = Date.parse(`${day}T${clock}:00Z`);
  const format = value => new Intl.DateTimeFormat("sv-SE", { timeZone: timezone, year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", second: "2-digit", hourCycle: "h23" }).format(new Date(value));
  const offsets = [...new Set([-86400000, 0, 86400000].map(delta => Date.parse(format(wall + delta).replace(" ", "T") + "Z") - (wall + delta)))];
  const matches = offsets.map(offset => wall - offset).filter(value => format(value).slice(0, 16) === `${day} ${clock}`);
  if (matches.length !== 1) throw new Error("This local time is missing or occurs twice. Choose another time.");
  return new Date(matches[0]).toISOString();
}
export function formatStudyTime(value, timezone = browserTimezone(), withDate = false, withZone = false) {
  return new Intl.DateTimeFormat(undefined, { timeZone: timezone, ...(withDate ? { weekday: "short", month: "short", day: "numeric" } : {}), ...(withZone ? { timeZoneName: "shortOffset" } : {}), hour: "numeric", minute: "2-digit" }).format(new Date(value));
}
