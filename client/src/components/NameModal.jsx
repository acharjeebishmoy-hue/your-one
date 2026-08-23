import { useState } from "react";
import { useAuth } from "../auth.jsx";

export function NameModal({ onClose }) {
  const { user, pickName } = useAuth();
  const [name, setName] = useState(user?.name || "");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [step, setStep] = useState("welcome"); // welcome | name
  const editing = !!user?.name;

  async function submit(e) {
    e.preventDefault();
    if (busy) return;
    setBusy(true);
    setError("");
    try {
      await pickName(name);
      onClose();
    } catch (err) {
      setError(err.message);
      setBusy(false);
    }
  }

  if (editing) {
    // Simple name-change modal for existing users
    return (
      <div className="modal-backdrop" onClick={onClose}>
        <form className="modal" onClick={(e) => e.stopPropagation()} onSubmit={submit}>
          <div className="modal-head">
            <span>Change your name</span>
            <button type="button" className="modal-close" onClick={onClose}>✕</button>
          </div>
          <div className="modal-body">
            <p style={{ margin: 0, color: "var(--muted)", fontSize: 14 }}>
              Your friends see this name — it's how they'll find you.
            </p>
            {error && <div className="error-box">{error}</div>}
            <input
              className="text-input"
              placeholder="Your name"
              value={name}
              maxLength={20}
              autoFocus
              onChange={(e) => setName(e.target.value)}
            />
            <button className="btn block" disabled={busy || name.trim().length < 2}>
              {busy ? "Saving…" : "Save name"}
            </button>
          </div>
        </form>
      </div>
    );
  }

  // Warm welcome screen for first-time users
  if (step === "welcome") {
    return (
      <div className="modal-backdrop welcome-backdrop">
        <div className="welcome-screen" onClick={(e) => e.stopPropagation()}>
          <div className="welcome-logo">
            <svg width="72" height="72" viewBox="0 0 100 100">
              <defs>
                <linearGradient id="welcome-grad" x1="0%" y1="0%" x2="100%" y2="100%">
                  <stop offset="0%" stopColor="#1E88E5" />
                  <stop offset="100%" stopColor="#1565C0" />
                </linearGradient>
              </defs>
              <rect width="100" height="100" rx="22" fill="url(#welcome-grad)" />
              <text x="50" y="58" textAnchor="middle" dominantBaseline="middle" fill="white" fontSize="36" fontWeight="bold" fontFamily="Segoe UI, system-ui, sans-serif">YO</text>
            </svg>
          </div>
          <h2 className="welcome-title">Welcome to Your One</h2>
          <p className="welcome-sub">A place for you and your friends — simple, fast, and yours.</p>
          <button className="btn block welcome-btn" onClick={() => setStep("name")}>
            Get started
          </button>
        </div>
      </div>
    );
  }

  // Name picker step
  return (
    <div className="modal-backdrop welcome-backdrop">
      <form className="welcome-screen" onClick={(e) => e.stopPropagation()} onSubmit={submit}>
        <div className="welcome-logo">
          <svg width="48" height="48" viewBox="0 0 100 100">
            <defs>
              <linearGradient id="welcome-grad2" x1="0%" y1="0%" x2="100%" y2="100%">
                <stop offset="0%" stopColor="#1E88E5" />
                <stop offset="100%" stopColor="#1565C0" />
              </linearGradient>
            </defs>
            <rect width="100" height="100" rx="22" fill="url(#welcome-grad2)" />
            <text x="50" y="58" textAnchor="middle" dominantBaseline="middle" fill="white" fontSize="36" fontWeight="bold" fontFamily="Segoe UI, system-ui, sans-serif">YO</text>
          </svg>
        </div>
        <h2 className="welcome-title" style={{ fontSize: 20 }}>What should we call you?</h2>
        <p className="welcome-sub">No account, no password — just pick a name so your friends know it's you.</p>
        {error && <div className="error-box">{error}</div>}
        <input
          className="text-input"
          placeholder="Your name"
          value={name}
          maxLength={20}
          autoFocus
          style={{ textAlign: 'center', fontSize: 18, padding: '14px 18px' }}
          onChange={(e) => setName(e.target.value)}
        />
        <button className="btn block welcome-btn" disabled={busy || name.trim().length < 2}>
          {busy ? "Setting up…" : "Use this name"}
        </button>
      </form>
    </div>
  );
}
