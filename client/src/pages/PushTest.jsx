import { useState, useEffect } from "react";
import { api } from "../api.js";
import { pushSupported } from "../push.js";

/**
 * Diagnostic page: shows exactly what's happening with push on this device.
 * Open /push-test on your phone and screenshot the result.
 */

function Check({ label, status, detail }) {
  const icon =
    status === "pass" ? "\u2705" :
    status === "fail" ? "\u274C" :
    status === "warn" ? "\u26A0\uFE0F" :
    "\u23F3";
  return (
    <div style={{ display: "flex", alignItems: "flex-start", gap: 10, padding: "10px 0", borderBottom: "1px solid var(--border)" }}>
      <span style={{ fontSize: 18, minWidth: 28 }}>{icon}</span>
      <div style={{ flex: 1 }}>
        <div style={{ fontWeight: 600, fontSize: 14 }}>{label}</div>
        {detail && <div style={{ fontSize: 12, color: "var(--muted)", marginTop: 2, fontFamily: "monospace", wordBreak: "break-all" }}>{detail}</div>}
      </div>
    </div>
  );
}

export function PushTest() {
  const [checks, setChecks] = useState([]);
  const [enableResult, setEnableResult] = useState(null);
  const [enabling, setEnabling] = useState(false);

  useEffect(() => {
    runChecks();
  }, []);

  async function runChecks() {
    const results = [];

    // 1. Browser support
    const hasSW = "serviceWorker" in navigator;
    const hasPush = "PushManager" in window;
    const hasNotif = "Notification" in window;
    results.push({
      label: "Browser push support",
      status: hasSW && hasPush && hasNotif ? "pass" : "fail",
      detail: `SW: ${hasSW ? "yes" : "NO"} | Push API: ${hasPush ? "yes" : "NO"} | Notification: ${hasNotif ? "yes" : "NO"} | UA: ${navigator.userAgent.substring(0, 80)}`,
    });
    setChecks([...results]);

    // 2. Service Worker registration
    if (hasSW) {
      try {
        const reg = await Promise.race([
          navigator.serviceWorker.ready,
          new Promise((_, rej) => setTimeout(() => rej(new Error("timeout")), 5000)),
        ]);
        results.push({
          label: "Service Worker registered",
          status: "pass",
          detail: `Scope: ${reg.scope} | Active: ${reg.active ? "yes" : "no"}`,
        });
      } catch (e) {
        results.push({
          label: "Service Worker registered",
          status: "fail",
          detail: `Error: ${e.message}`,
        });
      }
      setChecks([...results]);
    }

    // 3. Notification permission
    const perm = hasNotif ? Notification.permission : "N/A";
    results.push({
      label: "Notification permission",
      status: perm === "granted" ? "pass" : perm === "denied" ? "fail" : "warn",
      detail: `Permission: ${perm}`,
    });
    setChecks([...results]);

    // 4. Existing browser subscription
    if (hasSW && hasPush) {
      try {
        const reg = await navigator.serviceWorker.ready;
        const sub = await reg.pushManager.getSubscription();
        if (sub) {
          // Check if server knows about it
          let serverKnown = false;
          try {
            const d = await api.post("/api/push/status", { endpoint: sub.endpoint });
            serverKnown = d?.on;
          } catch {}
          results.push({
            label: "Browser push subscription",
            status: serverKnown ? "pass" : "warn",
            detail: `Endpoint: ${sub.endpoint.substring(0, 60)}... | Server knows: ${serverKnown ? "YES" : "NO"}`,
          });
        } else {
          results.push({
            label: "Browser push subscription",
            status: "fail",
            detail: "No subscription exists in browser",
          });
        }
      } catch (e) {
        results.push({
          label: "Browser push subscription",
          status: "fail",
          detail: `Error: ${e.message}`,
        });
      }
      setChecks([...results]);
    }

    // 5. VAPID key from server
    try {
      const start = Date.now();
      const d = await api.get("/api/push/vapid-key");
      const ms = Date.now() - start;
      results.push({
        label: "Server VAPID key",
        status: d.publicKey ? "pass" : "fail",
        detail: `Key: ${d.publicKey?.substring(0, 20)}... | Fetch time: ${ms}ms`,
      });
    } catch (e) {
      results.push({
        label: "Server VAPID key",
        status: "fail",
        detail: `Error: ${e.message} — server may be cold-starting`,
      });
    }
    setChecks([...results]);

    // 6. User identity
    try {
      const d = await api.get("/api/identity");
      results.push({
        label: "User identity",
        status: d.user?.name ? "pass" : "warn",
        detail: `Name: ${d.user?.name || "NONE (pick a name first)"} | ID: ${d.user?.id}`,
      });
    } catch (e) {
      results.push({
        label: "User identity",
        status: "fail",
        detail: `Error: ${e.message}`,
      });
    }
    setChecks([...results]);
  }

  async function handleEnable() {
    setEnabling(true);
    setEnableResult([]);
    const log = (msg, status) => setEnableResult(prev => [...prev, { msg, status }]);

    // Step 1: Request permission
    log("Requesting notification permission...", "info");
    let perm;
    try {
      perm = await Notification.requestPermission();
      log(`Permission result: ${perm}`, perm === "granted" ? "pass" : "fail");
    } catch (e) {
      log(`Permission FAILED: ${e.message}`, "fail");
      setEnabling(false);
      return;
    }
    if (perm !== "granted") {
      log("Notifications denied by user", "fail");
      setEnabling(false);
      return;
    }

    // Step 2: Service Worker
    log("Waiting for service worker...", "info");
    let reg;
    try {
      reg = await Promise.race([
        navigator.serviceWorker.ready,
        new Promise((_, rej) => setTimeout(() => rej(new Error("SW not ready after 5s")), 5000)),
      ]);
      log(`Service worker ready: ${reg.scope}`, "pass");
    } catch (e) {
      log(`Service worker FAILED: ${e.message}`, "fail");
      setEnabling(false);
      return;
    }

    // Step 3: VAPID key
    log("Fetching VAPID key from server...", "info");
    let publicKey;
    for (let attempt = 1; attempt <= 3; attempt++) {
      try {
        const start = Date.now();
        const d = await api.get("/api/push/vapid-key");
        publicKey = d.publicKey;
        log(`VAPID key received (${Date.now() - start}ms)`, "pass");
        break;
      } catch (e) {
        log(`Attempt ${attempt}/3 failed: ${e.message}`, "warn");
        if (attempt < 3) await new Promise(r => setTimeout(r, 2000));
      }
    }
    if (!publicKey) {
      log("FAILED: Could not get VAPID key after 3 attempts", "fail");
      setEnabling(false);
      return;
    }

    // Step 4: Drop old subscription
    log("Checking for old subscriptions...", "info");
    try {
      const old = await reg.pushManager.getSubscription();
      if (old) {
        await old.unsubscribe();
        log("Dropped old subscription", "pass");
      } else {
        log("No old subscription to drop", "pass");
      }
    } catch (e) {
      log(`Warning: ${e.message}`, "warn");
    }

    // Step 5: Subscribe
    log("Creating push subscription...", "info");
    let sub;
    try {
      sub = await reg.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: publicKey,
      });
      log(`Subscription created! Endpoint: ${sub.endpoint.substring(0, 50)}...`, "pass");
    } catch (e) {
      log(`Subscribe FAILED: ${e.name}: ${e.message}`, "fail");
      setEnabling(false);
      return;
    }

    // Step 6: Save to server
    log("Saving subscription to server...", "info");
    for (let attempt = 1; attempt <= 3; attempt++) {
      try {
        await api.post("/api/push/subscribe", {
          endpoint: sub.endpoint,
          p256dh: btoa(String.fromCharCode(...new Uint8Array(sub.getKey("p256dh")))),
          auth: btoa(String.fromCharCode(...new Uint8Array(sub.getKey("auth")))),
        });
        log("Subscription saved to server!", "pass");
        break;
      } catch (e) {
        log(`Attempt ${attempt}/3 failed: ${e.message}`, "warn");
        if (attempt < 3) await new Promise(r => setTimeout(r, 2000));
      }
    }

    // Step 7: Send test push
    log("Sending test notification...", "info");
    try {
      await api.post("/api/push/test");
      log("Test push sent! Check your notifications.", "pass");
    } catch (e) {
      log(`Test push failed: ${e.message}`, "warn");
    }

    setEnabling(false);
  }

  return (
    <div className="page" style={{ maxWidth: 500, margin: "0 auto", padding: "20px 16px" }}>
      <h2 style={{ marginBottom: 4 }}>Push Notification Diagnostic</h2>
      <p style={{ color: "var(--muted)", fontSize: 13, marginBottom: 20 }}>
        This page shows exactly what's happening with push on YOUR device. Screenshot this and share it.
      </p>

      <div style={{ background: "var(--card)", borderRadius: 12, padding: "4px 16px" }}>
        {checks.length === 0 && <div style={{ padding: 12, color: "var(--muted)" }}>Checking...</div>}
        {checks.map((c, i) => <Check key={i} {...c} />)}
      </div>

      {checks.length > 0 && (
        <div style={{ marginTop: 24 }}>
          <button
            className="btn block"
            onClick={handleEnable}
            disabled={enabling}
            style={{ fontSize: 16, padding: "14px 20px" }}
          >
            {enabling ? "Enabling..." : "Try to Enable Push Notifications"}
          </button>
        </div>
      )}

      {enableResult && (
        <div style={{ marginTop: 16, background: "var(--card)", borderRadius: 12, padding: 16 }}>
          <h3 style={{ margin: "0 0 8px", fontSize: 14 }}>Enable attempt log:</h3>
          {enableResult.map((r, i) => (
            <div key={i} style={{
              fontSize: 13, fontFamily: "monospace", padding: "4px 0",
              color: r.status === "pass" ? "#22c55e" : r.status === "fail" ? "#ef4444" : r.status === "warn" ? "#f59e0b" : "var(--muted)",
            }}>
              {r.status === "pass" ? "\u2705" : r.status === "fail" ? "\u274C" : r.status === "warn" ? "\u26A0\uFE0F" : "\u25B6"} {r.msg}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
