import { useEffect, useState } from "react";
import { api } from "../api.js";
import { useAuth } from "../auth.jsx";
import { enablePush, getPushState } from "../push.js";

const DISMISS_KEY = "yourone_push_banner_dismissed";

// Facebook-style first-run prompt: a slim bar at the top asking to turn on real
// notifications. One tap → browser permission → instant test notification.
export function PushBanner() {
  const { user } = useAuth();
  const [state, setState] = useState("loading"); // loading | unsupported | denied | default | on | off
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false); // just enabled — show the success message

  useEffect(() => {
    let live = true;
    if (!user?.name) return;
    getPushState().then((s) => {
      if (live) setState(s);
    });
    return () => {
      live = false;
    };
  }, [user?.name]);

  if (!user?.name) return null;
  if (done) {
    return (
      <div className="push-banner pb-done">
        <span className="pb-text">
          Notifications are on — you'll get alerts for messages, calls, and more.
        </span>
        <button
          className="pb-x"
          aria-label="Close"
          onClick={() => {
            setDone(false);
            setState("on");
          }}
        >
          ✕
        </button>
      </div>
    );
  }
  // Loading or already on — no banner needed
  if (state === "loading" || state === "on") return null;

  // Unsupported (in-app browser like WhatsApp/Facebook) — tell user to open in Chrome
  if (state === "unsupported") {
    return (
      <div className="push-banner pb-denied">
        <span className="pb-emoji"><svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M18 8a6 6 0 1 0-12 0c0 7-3 9-3 9h18s-3-2-3-9"/><path d="M13.7 21a2 2 0 0 1-3.4 0"/><line x1="1" y1="1" x2="23" y2="23"/></svg></span>
        <span className="pb-text">
          Notifications need Chrome or Firefox. Open this link in your phone's browser, not WhatsApp or Facebook.
        </span>
      </div>
    );
  }

  const onIphone = /iphone|ipad|ipod/i.test(navigator.userAgent) && !window.navigator.standalone;

  // If denied — tell user how to fix
  if (state === "denied") {
    return (
      <div className="push-banner pb-denied">
        <span className="pb-emoji"><svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M18 8a6 6 0 1 0-12 0c0 7-3 9-3 9h18s-3-2-3-9"/><path d="M13.7 21a2 2 0 0 1-3.4 0"/><line x1="1" y1="1" x2="23" y2="23"/></svg></span>
        <span className="pb-text">
          Notifications are blocked. Tap the lock icon next to the address bar → Site settings → Notifications → Allow.
        </span>
      </div>
    );
  }

  async function turnOn() {
    setBusy(true);
    const r = await enablePush();
    if (r.ok) {
      // Proof it works: a real notification pops on this device right now.
      api.post("/api/push/test").catch(() => {});
      setDone(true);
      setTimeout(() => setState("on"), 4000);
    } else {
      setState(r.reason === "denied" ? "denied" : "off");
    }
    setBusy(false);
  }

  return (
    <div className="push-banner">
      <span className="pb-emoji"><svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M18 8a6 6 0 1 0-12 0c0 7-3 9-3 9h18s-3-2-3-9"/><path d="M13.7 21a2 2 0 0 1-3.4 0"/></svg></span>
      <span className="pb-text">
        Turn on notifications — get alerts for messages, calls, and friend activity.
      </span>
      <button className="pb-btn" onClick={turnOn} disabled={busy}>
        {busy ? "Setting up…" : "Turn on"}
      </button>

      {onIphone && <div className="pb-hint">On iPhone: add to Home Screen first, then turn on.</div>}
    </div>
  );
}
