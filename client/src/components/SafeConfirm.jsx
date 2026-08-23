import { useState } from "react";

// Friendly confirmation dialog — replaces scary browser confirm()
export function SafeConfirm({ title, message, icon = "❓", confirmText = "OK", cancelText = "Cancel", danger = false, onConfirm, onCancel }) {
  return (
    <div className="modal-backdrop" onClick={onCancel}>
      <div className="modal safe-confirm" onClick={(e) => e.stopPropagation()}>
        <div className="safe-confirm-icon">{icon}</div>
        <div className="safe-confirm-title">{title}</div>
        <div className="safe-confirm-msg">{message}</div>
        <div className="safe-confirm-actions">
          <button className="btn ghost" onClick={onCancel}>{cancelText}</button>
          <button className={`btn ${danger ? "danger" : ""}`} onClick={onConfirm}>{confirmText}</button>
        </div>
      </div>
    </div>
  );
}

// Friendly alert dialog — replaces scary browser alert()
export function SafeAlert({ title, message, icon = "✅", buttonText = "OK", onClose }) {
  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal safe-confirm" onClick={(e) => e.stopPropagation()}>
        <div className="safe-confirm-icon">{icon}</div>
        <div className="safe-confirm-title">{title}</div>
        <div className="safe-confirm-msg">{message}</div>
        <div className="safe-confirm-actions">
          <button className="btn" onClick={onClose}>{buttonText}</button>
        </div>
      </div>
    </div>
  );
}

// Toast notification — appears at bottom, auto-dismisses
export function SafeToast({ message, icon = "✅", action, actionText, onAction, duration = 4000 }) {
  const [show, setShow] = useState(true);

  useState(() => {
    const t = setTimeout(() => setShow(false), duration);
    return () => clearTimeout(t);
  }, []);

  if (!show) return null;

  return (
    <div className="safe-toast">
      <span className="safe-toast-icon">{icon}</span>
      <span className="safe-toast-msg">{message}</span>
      {action && (
        <button className="safe-toast-action" onClick={() => { action(); setShow(false); }}>
          {actionText || "Undo"}
        </button>
      )}
    </div>
  );
}
