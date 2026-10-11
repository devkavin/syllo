import { describe, it, expect } from "vitest";
import { shouldNotifyDigest } from "./reminderPolicy";

describe("optional daily reminders", () => {
  const digest = { date: "2026-10-11", quiet: false, notification_due: true, total_count: 3 };
  it("requires explicit opt-in, browser permission, due work, and a time outside quiet hours", () => {
    const base = { enabled: true, permission: "granted", digest, deliveredDate: null };
    expect(shouldNotifyDigest(base)).toBe(true);
    for (const patch of [{ enabled: false }, { permission: "default" }, { permission: "denied" }, { deliveredDate: digest.date }, { digest: { ...digest, quiet: true } }, { digest: { ...digest, notification_due: false } }, { digest: { ...digest, total_count: 0 } }]) expect(shouldNotifyDigest({ ...base, ...patch })).toBe(false);
  });
});
