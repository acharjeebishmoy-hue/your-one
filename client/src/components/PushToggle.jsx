import { useEffect, useState } from "react";
import { api } from "../api.js";

// "Real" push notifications: even when the app is closed, the phone/computer
// shows a system notification. Requires browser permission + the PWA installed
// on iPhones (Android/desktop work from the browser too).
export function PushToggle() {
  const [state, setState] = useState("loading"); // loading | unsupported | default | on | off | denied
  const [busy, setBusy] = useState(false);

  const supported = () => "serviceWorker" in navigator && "PushManager" in window && "Notification" in window;

  async function currentState() {
    if (!supported()) return "unsupported";
    if (Notification.permission === "denied") return "denied";
    if (Notification.permission !== "granted") return "default";
    try {
      const reg = await navigator.serviceWorker.ready;
      const sub = await reg.pushManager.getSubscription();
      if (!sub) return "off";
      // The browser has a subscription — but is it one the server can actually deliver?
      // (It may be stale, e.g. created with older push keys.) Only show "on" if the
      // server still knows this exact endpoint.
      const d = await api.post("/api/push/status", { endpoint: sub.endpoint }).catch(() => null);
      return d && d.on ? "on" : "off";
    } catch {
      return "off";
    }
  }

  useEffect(() => {
    currentState().then(setState);
  }, []);

  // If the browser rotates push keys, silently re-subscribe so pushes keep coming.
  useEffect(() => {
    if (!supported() || Notification.permission !== "granted") return;
    navigator.serviceWorker.ready.then((reg) => {
      reg.addEventListener("pushsubscriptionchange", () => enable());
    }).catch(() => {});
  }, []);

  async function enable() {
    setBusy(true);
    try {
      const perm = await Notification.requestPermission();
      if (perm !== "granted") {
        setState("denied");
        return;
      }
      const reg = await navigator.serviceWorker.ready;
      const { publicKey } = await api.get("/api/push/vapid-key");
      // Drop any old subscription first — if it was created with older push keys,
      // reusing it would silently fail forever. A fresh one always matches.
      const old = await reg.pushManager.getSubscription();
      if (old) {
        try {
          await old.unsubscribe();
        } catch {
          /* keep going — subscribe() below replaces it anyway */
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
      setState("on");
    } catch {
      setState("default");
    } finally {
      setBusy(false);
    }
  }

  async function disable() {
    setBusy(true);
    try {
      const reg = await navigator.serviceWorker.ready;
      const sub = await reg.pushManager.getSubscription();
      if (sub) {
        await api.post("/api/push/unsubscribe", { endpoint: sub.endpoint });
        await sub.unsubscribe();
      }
      setState("off");
    } catch {
      /* ignore */
    } finally {
      setBusy(false);
    }
  }

  if (state === "loading" || state === "unsupported") return null;

  const onIphone = /iphone|ipad|ipod/i.test(navigator.userAgent) && !window.navigator.standalone;

  return (
    <div className="push-toggle">
      {state === "on" && (
        <button className="push-row" onClick={disable} disabled={busy}>
          <span>🔔 Real notifications are <b>on</b></span>
          <span className="push-action">Turn off</span>
        </button>
      )}
      {(state === "default" || state === "off") && (
        <button className="push-row" onClick={enable} disabled={busy}>
          <span>🔕 {busy ? "Setting up…" : "Turn on real notifications"}</span>
          <span className="push-action">Enable</span>
        </button>
      )}
      {state === "denied" && (
        <div className="push-row muted">
          <span>🔕 Notifications are blocked in your browser settings</span>
        </div>
      )}
      {onIphone && state !== "on" && (
        <div className="push-hint">Tip: on iPhone, add Your One to your Home Screen first (Share → Add to Home Screen), then enable.</div>
      )}
    </div>
  );
}
