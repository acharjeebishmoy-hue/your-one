import { useState } from "react";
import { useAuth } from "../auth.jsx";

export function NameModal({ onClose }) {
  const { pickName } = useAuth();
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

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

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <form className="modal" onClick={(e) => e.stopPropagation()} onSubmit={submit}>
        <div className="modal-head">
          <span>What should we call you?</span>
          <button type="button" className="modal-close" onClick={onClose}>✕</button>
        </div>
        <div className="modal-body">
          <p style={{ margin: 0, color: "var(--muted)", fontSize: 14 }}>
            No account, no password — just pick a name so your friends know it&apos;s you.
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
            {busy ? "Saving…" : "Use this name"}
          </button>
        </div>
      </form>
    </div>
  );
}
