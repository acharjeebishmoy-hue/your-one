// Detect low-end device (≤2GB RAM or slow CPU)
const nav = typeof navigator !== "undefined" ? navigator : null;
export const LOW_END =
  (nav?.deviceMemory && nav.deviceMemory <= 2) ||
  (nav?.hardwareConcurrency && nav.hardwareConcurrency <= 2) ||
  (nav?.connection?.saveData === true) ||
  (nav?.connection?.effectiveType === "2g") ||
  (nav?.connection?.effectiveType === "slow-2g") ||
  (nav?.msSaveBlob !== undefined); // IE/old Edge = old device

// User prefers reduced motion (accessibility + slow devices)
const mq = typeof window !== "undefined" ? window.matchMedia("(prefers-reduced-motion: reduce)") : null;
export const REDUCED_MOTION = LOW_END || (mq?.matches === true);

// Reduce polling on low-end: 30s instead of 10s
export const POLL_MS = LOW_END ? 30000 : 10000;

// Disable heavy features on low-end
export const SKIP_STORIES = LOW_END; // don't poll stories on slow phones
export const SKIP_PRESENCE = LOW_END; // don't ping presence on slow phones
