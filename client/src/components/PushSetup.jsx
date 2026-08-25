import { useState, useEffect } from "react";
import { enablePush, getPushState } from "../push.js";
import { api } from "../api.js";

/**
 * Full-screen push notification setup.
 * Shows on first visit if push is not enabled.
 * Walks the user through each step with clear feedback.
 */
export function PushSetup({ onComplete }) {
  const [step, setStep] = useState("checking"); // checking | unsupported | denied | ready | enabling | success | failed
  const [detail, setDetail] = useState("");
  const [supported, setSupported] = useState({ sw: false, push: false, notif: false });

  useEffect(() => {
    let alive = true;
    (async () => {
      const sw = "serviceWorker" in navigator;
      const push = "PushManager" in window;
      const notif = "Notification" in window;
      if (!alive) return;
      setSupported({ sw, push, notif });

      if (!sw || !push || !notif) {
        setDetail(
          !sw ? "Service Worker not supported" :
          !push ? "Push API not supported" :
          "Notification API not supported"
        );
        setStep("unsupported");
        return;
      }

      // Check existing state
      const state = await getPushState();
      if (!alive) return;

      if (state === "on") {
        setStep("success");
        setDetail("Notifications are already enabled!");
        setTimeout(() => onComplete?.(), 2000);
        return;
      }

      if (state === "denied") {
        setStep("denied");
        setDetail("Notifications were blocked. Go to browser settings to unblock.");
        return;
      }

      // Not enabled yet — show the enable screen
      setStep("ready");
    })();
    return () => { alive = false; };
  }, []);

  async function handleEnable() {
    setStep("enabling");
    setDetail("Setting up notifications...");

    try {
      // enablePush() handles everything: permission -> SW -> VAPID -> subscribe -> save
      // It has retry logic for Render cold starts and detailed error reporting.
      const result = await enablePush();
      if (result.ok) {
        setDetail("Subscribed! Sending test notification...");
        await api.post("/api/push/test").catch(() => {});
        setStep("success");
        setDetail("Notifications are working! You'll get alerts for messages and calls.");
        setTimeout(() => onComplete?.(), 2000);
      } else {
        setStep("failed");
        // Show the ACTUAL error detail so we can debug
        setDetail(result.detail || result.reason);
      }
    } catch (e) {
      setStep("failed");
      setDetail(`Error: ${e.message}`);
    }
  }

  if (step === "success") {
    return (
      <div className="ps-overlay">
        <div className="ps-card">
          <div className="ps-icon ps-icon-success">
            <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14" />
              <polyline points="22 4 12 14.01 9 11.01" />
            </svg>
          </div>
          <h2 className="ps-title">You're all set!</h2>
          <p className="ps-detail">{detail}</p>
        </div>
      </div>
    );
  }

  if (step === "unsupported") {
    return (
      <div className="ps-overlay">
        <div className="ps-card">
          <div className="ps-icon ps-icon-warn">
            <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="12" cy="12" r="10" />
              <line x1="12" y1="8" x2="12" y2="12" />
              <line x1="12" y1="16" x2="12.01" y2="16" />
            </svg>
          </div>
          <h2 className="ps-title">Notifications not supported</h2>
          <p className="ps-detail">{detail}</p>
          <div className="ps-help">
            <p>Your browser doesn't support push notifications. Try:</p>
            <ol>
              <li>Open <strong>Chrome</strong> on your phone</li>
              <li>Type: <strong>your-one.onrender.com</strong></li>
              <li>Tap the 3 dots → <strong>Add to Home screen</strong></li>
              <li>Open from the home screen icon</li>
            </ol>
          </div>
          <button className="ps-btn" onClick={onComplete}>Skip for now</button>
        </div>
      </div>
    );
  }

  if (step === "denied") {
    return (
      <div className="ps-overlay">
        <div className="ps-card">
          <div className="ps-icon ps-icon-warn">
            <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9" />
              <line x1="1" y1="1" x2="23" y2="23" />
            </svg>
          </div>
          <h2 className="ps-title">Notifications are blocked</h2>
          <p className="ps-detail">{detail}</p>
          <div className="ps-help">
            <p>To fix this:</p>
            <ol>
              <li>Tap the <strong>lock icon 🔒</strong> left of the address bar</li>
              <li>Tap <strong>Site settings</strong></li>
              <li>Tap <strong>Notifications</strong></li>
              <li>Change to <strong>Allow</strong></li>
              <li>Refresh this page</li>
            </ol>
          </div>
          <button className="ps-btn" onClick={onComplete}>I'll do it later</button>
        </div>
      </div>
    );
  }

  // Ready or enabling
  return (
    <div className="ps-overlay">
      <div className="ps-card">
        <div className="ps-icon ps-icon-main">
          <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9" />
            <path d="M13.73 21a2 2 0 0 1-3.46 0" />
          </svg>
        </div>
        <h2 className="ps-title">Stay connected</h2>
        <p className="ps-detail">
          Get notified when friends message you or call you — even when the app is closed.
        </p>

        {detail && step === "enabling" && (
          <div className="ps-progress">{detail}</div>
        )}

        {step === "failed" && (
          <div className="ps-error">{detail}</div>
        )}

        <button
          className="ps-btn ps-btn-big"
          onClick={handleEnable}
          disabled={step === "enabling"}
        >
          {step === "enabling" ? "Setting up..." : "Turn on notifications"}
        </button>

        {step === "failed" && (
          <button className="ps-btn" onClick={handleEnable} style={{marginTop: 8}}>
            Try again
          </button>
        )}

        <button className="ps-skip" onClick={onComplete}>
          Skip for now
        </button>

        <div className="ps-debug">
          <details>
            <summary>Technical details</summary>
            <pre>SW: {supported.sw ? "OK" : "NO"} | Push: {supported.push ? "OK" : "NO"} | Notif: {supported.notif ? "OK" : "NO"} | Permission: {typeof Notification !== "undefined" ? Notification.permission : "N/A"}</pre>
          </details>
        </div>
      </div>
    </div>
  );
}
