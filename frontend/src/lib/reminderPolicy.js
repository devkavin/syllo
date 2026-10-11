export function shouldNotifyDigest({ enabled, permission, digest, deliveredDate }) {
  return Boolean(enabled && permission === "granted" && digest?.date && digest.notification_due && !digest.quiet && digest.total_count > 0 && deliveredDate !== digest.date);
}
