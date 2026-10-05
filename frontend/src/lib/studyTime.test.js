import { expect, it } from "vitest";
import { dateInZone, localInstant } from "./studyTime";
it("converts selected timezones and rejects DST gaps and folds", () => {
  expect(localInstant("2026-10-05", "09:00", "Asia/Colombo")).toBe("2026-10-05T03:30:00.000Z");
  expect(dateInZone("2026-10-05T22:00:00Z", "Asia/Colombo")).toBe("2026-10-06");
  expect(() => localInstant("2026-03-08", "02:30", "America/New_York")).toThrow();
  expect(() => localInstant("2026-11-01", "01:30", "America/New_York")).toThrow();
});
