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
      new Promise((_, rej) => setTimeout(() => rej(new Error("sw-timeout")), 5000)),
    ]);
    const sub = await reg.pushManager.getSubscription();
    if (!sub) return "off";
    const d = await api.post("/api/push/status", { endpoint: sub.endpoint }).catch(() => null);
    return d && d.on ? "on" : "off";
  } catch {
    return "off";
  }
}

/**
 * Enables real push notifications.
 * MUST be called from a user gesture (click/tap) — Chrome blocks requestPermission() otherwise.
 * Returns { ok: true } on success, or { ok: false, reason, detail } on failure.
 */
export async function enablePush() {
  // Step 1: Request permission (MUST be from user gesture)
  let perm;
  try {
    perm = await Notification.requestPermission();
  } catch (e) {
    return { ok: false, reason: "error", detail: "requestPermission failed: " + e.message };
  }
  if (perm !== "granted") return { ok: false, reason: "denied", detail: "Permission: " + perm };

  // Step 2: Get service worker registration
  let reg;
  try {
    reg = await Promise.race([
      navigator.serviceWorker.ready,
      new Promise((_, rej) => setTimeout(() => rej(new Error("SW not ready after 5s")), 5000)),
    ]);
  } catch (e) {
    return { ok: false, reason: "error", detail: "Service Worker failed: " + e.message };
  }

  // Step 3: Get VAPID key from server (with retry for cold starts)
  let publicKey;
  for (let attempt = 1; attempt <= 3; attempt++) {
    try {
      const d = await api.get("/api/push/vapid-key");
      publicKey = d.publicKey;
      break;
    } catch (e) {
      if (attempt === 3) {
        return { ok: false, reason: "error", detail: "VAPID key fetch failed after 3 attempts: " + e.message };
      }
      // Wait before retry (server might be cold-starting)
      await new Promise(r => setTimeout(r, 2000 * attempt));
    }
  }

  if (!publicKey) {
    return { ok: false, reason: "error", detail: "No VAPID public key received" };
  }

  // Step 4: Drop any old subscription and create a fresh one
  try {
    const old = await reg.pushManager.getSubscription();
    if (old) {
      try { await old.unsubscribe(); } catch {}
    }
  } catch {}

  let sub;
  try {
    sub = await reg.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: publicKey,
    });
  } catch (e) {
    return { ok: false, reason: "error", detail: "PushManager.subscribe failed: " + e.message };
  }

  // Step 5: Save subscription to server (with retry)
  for (let attempt = 1; attempt <= 3; attempt++) {
    try {
      await api.post("/api/push/subscribe", {
        endpoint: sub.endpoint,
        p256dh: btoa(String.fromCharCode(...new Uint8Array(sub.getKey("p256dh")))),
        auth: btoa(String.fromCharCode(...new Uint8Array(sub.getKey("auth")))),
      });
      return { ok: true };
    } catch (e) {
      if (attempt === 3) {
        return { ok: false, reason: "error", detail: "Save subscription failed after 3 attempts: " + e.message };
      }
      await new Promise(r => setTimeout(r, 2000 * attempt));
    }
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
