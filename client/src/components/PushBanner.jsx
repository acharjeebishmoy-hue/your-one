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
          ✅ You're all set! Notifications are on — check your phone, a test just popped. 🎉
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
  if (state === "loading" || state === "unsupported" || state === "on" || state === "denied") return null;
  if (typeof localStorage !== "undefined" && localStorage.getItem(DISMISS_KEY)) return null;

  const onIphone = /iphone|ipad|ipod/i.test(navigator.userAgent) && !window.navigator.standalone;

  async function turnOn() {
    setBusy(true);
    const r = await enablePush();
    if (r.ok) {
      // Proof it works: a real notification pops on this device right now.
      api.post("/api/push/test").catch(() => {});
      setDone(true);
      setTimeout(() => setState("on"), 4000);
    } else {
      setState(r.reason === "denied" ? "denied" : "default");
    }
    setBusy(false);
  }

  return (
    <div className="push-banner">
      <span className="pb-emoji">🔔</span>
      <span className="pb-text">
        Get notified when friends message you — even when the app is closed.
      </span>
      <button className="pb-btn" onClick={turnOn} disabled={busy}>
        {busy ? "Setting up…" : "Turn on"}
      </button>
      <button
        className="pb-x"
        aria-label="Not now"
        onClick={() => localStorage.setItem(DISMISS_KEY, "1")}
      >
        ✕
      </button>
      {onIphone && <div className="pb-hint">On iPhone: add to Home Screen first, then turn on.</div>}
    </div>
  );
}
