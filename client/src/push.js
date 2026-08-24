import { api } from "./api.js";

// Shared helpers for Web Push — used by the bell toggle and the first-run banner.

export const pushSupported = () =>
  "serviceWorker" in navigator && "PushManager" in window && "Notification" in window;

// loading | unsupported | denied | default | on | off
export async function getPushState() {
  if (!pushSupported()) return "unsupported";
  if (Notification.permission === "denied") return "denied";
  if (Notification.permission !== "granted") return "default";
  try {
    // Wait for SW with a timeout — if SW failed to register, this hangs forever.
    const reg = await Promise.race([
      navigator.serviceWorker.ready,
      new Promise((_, rej) => setTimeout(() => rej(new Error("sw-timeout")), 3000)),
    ]);
    const sub = await reg.pushManager.getSubscription();
    if (!sub) return "off";
    const d = await api.post("/api/push/status", { endpoint: sub.endpoint }).catch(() => null);
    return d && d.on ? "on" : "off";
  } catch {
    return "off";
  }
}

// Enables real notifications. Returns { ok: true } on success, or { ok: false, reason }.
export async function enablePush() {
  const perm = await Notification.requestPermission();
  if (perm !== "granted") return { ok: false, reason: "denied" };
  try {
    // Wait for SW with timeout — don't hang forever if SW is dead
    const reg = await Promise.race([
      navigator.serviceWorker.ready,
      new Promise((_, rej) => setTimeout(() => rej(new Error("sw-timeout")), 5000)),
    ]);
    const { publicKey } = await api.get("/api/push/vapid-key");
    // Drop any old subscription first — if it was created with older push keys,
    // reusing it would silently fail forever. A fresh one always matches.
    const old = await reg.pushManager.getSubscription();
    if (old) {
      try {
        await old.unsubscribe();
      } catch {
        /* subscribe() below replaces it anyway */
      }
    }
    const sub = await reg.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: publicKey,
    });
    await api.post("/api/push/subscribe", {
      endpoint: sub.endpoint,
      p256dh: btoa(String.fromCharCode(...new Uint8Array(sub.getKey("p256dh")))),
      auth: btoa(String.fromCharCode(...new Uint8Array(sub.getKey("auth")))),
    });
    return { ok: true };
  } catch {
    return { ok: false, reason: "error" };
  }
}

export async function disablePush() {
  try {
    const reg = await navigator.serviceWorker.ready;
    const sub = await reg.pushManager.getSubscription();
    if (sub) {
      await api.post("/api/push/unsubscribe", { endpoint: sub.endpoint });
      await sub.unsubscribe();
    }
  } catch {
    /* ignore */
  }
}
