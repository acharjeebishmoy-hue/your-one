export function parseDate(iso) {
  if (!iso) return NaN;
  const s = String(iso);
  // SQLite stores "YYYY-MM-DD HH:MM:SS" as UTC — V8 would misread it as
  // local time, so detect the space-form and force UTC before anything else.
  if (/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}/.test(s)) {
    return new Date(s.replace(" ", "T") + "Z").getTime();
  }
  const d = new Date(s);
  if (!Number.isNaN(d.getTime())) return d.getTime();
  return NaN;
}

export function timeAgo(iso) {
  const then = parseDate(iso);
  if (Number.isNaN(then)) return "";
  const s = Math.max(0, Math.floor((Date.now() - then) / 1000));
  if (s < 60) return "just now";
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h`;
  const d = Math.floor(h / 24);
  if (d < 7) return `${d}d`;
  const w = Math.floor(d / 7);
  if (w < 5) return `${w}w`;
  return new Date(then).toLocaleDateString();
}

export function formatDate(iso) {
  const t = parseDate(iso);
  return Number.isNaN(t) ? "" : new Date(t).toLocaleString();
}

export function formatEventDate(iso) {
  const t = parseDate(iso);
  if (Number.isNaN(t)) return "";
  const d = new Date(t);
  const month = d.toLocaleString("en", { month: "short" });
  const day = d.getDate();
  const hour = d.toLocaleString("en", { hour: "numeric", minute: "2-digit" });
  const now = new Date();
  const isToday = d.toDateString() === now.toDateString();
  const tomorrow = new Date(now);
  tomorrow.setDate(tomorrow.getDate() + 1);
  const isTomorrow = d.toDateString() === tomorrow.toDateString();
  if (isToday) return `Today at ${hour}`;
  if (isTomorrow) return `Tomorrow at ${hour}`;
  return `${month} ${day} at ${hour}`;
}

export function plural(n, word) {
  return `${n} ${word}${n === 1 ? "" : "s"}`;
}

export function isOnline(lastSeen, withinMs = 120000) {
  if (!lastSeen) return false;
  const t = parseDate(lastSeen);
  if (Number.isNaN(t)) return false;
  return Date.now() - t < withinMs;
}

export const REACTION_EMOJI = { like: "👍", love: "❤️", haha: "😂", wow: "😮", sad: "😢", angry: "😡" };

export function reactionSummary(reactions, total) {
  if (!reactions || total === 0) return null;
  const order = ["like", "love", "haha", "wow", "sad", "angry"];
  const emojis = order.filter((t) => (reactions[t] || 0) > 0).map((t) => REACTION_EMOJI[t]);
  return emojis.length ? `${emojis.join("")} ${total}` : null;
}
