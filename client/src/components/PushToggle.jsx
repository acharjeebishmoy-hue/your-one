import { useEffect, useState } from "react";
import { disablePush, enablePush, getPushState } from "../push.js";

// \"Real\" push notifications: even when the app is closed, the phone/computer
// shows a system notification. Requires browser permission + the PWA installed
// on iPhones (Android/desktop work from the browser too).
export function PushToggle() {
  const [state, setState] = useState("loading"); // loading | unsupported | default | on | off | denied
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let live = true;
    getPushState().then((s) => {
      if (live) setState(s);
    });
    return () => {
      live = false;
    };
  }, []);

  // If the browser rotates push keys, silently re-subscribe so pushes keep coming.
  useEffect(() => {
    if (!("serviceWorker" in navigator) || Notification.permission !== "granted") return;
    navigator.serviceWorker.ready
      .then((reg) => reg.addEventListener("pushsubscriptionchange", () => enable()))
      .catch(() => {});
  }, []);

  async function enable() {
    setBusy(true);
    const r = await enablePush();
    if (r.ok) setState("on");
    else setState(r.reason === "denied" ? "denied" : "default");
    setBusy(false);
  }

  async function disable() {
    setBusy(true);
    await disablePush();
    setState("off");
    setBusy(false);
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
