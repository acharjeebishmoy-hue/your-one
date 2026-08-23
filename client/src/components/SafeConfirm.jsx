import { useState } from "react";
import { IconTrash, IconReport, IconBlock, IconCheck, IconX, IconWarning } from "./Icons.jsx";

const ICON_MAP = {
  trash: IconTrash,
  report: IconReport,
  block: IconBlock,
  check: IconCheck,
  x: IconX,
  warning: IconWarning,
};

// Friendly confirmation dialog — replaces scary browser confirm()
export function SafeConfirm({ title, message, icon = "warning", confirmText = "OK", cancelText = "Cancel", danger = false, onConfirm, onCancel }) {
  const IconComp = ICON_MAP[icon] || IconWarning;
  return (
    <div className="modal-backdrop" onClick={onCancel}>
      <div className="modal safe-confirm" onClick={(e) => e.stopPropagation()}>
        <div className={`safe-confirm-icon ${danger ? "danger" : ""}`}>
          <IconComp size={40} />
        </div>
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
export function SafeAlert({ title, message, icon = "check", buttonText = "OK", onClose }) {
  const IconComp = ICON_MAP[icon] || IconCheck;
  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal safe-confirm" onClick={(e) => e.stopPropagation()}>
        <div className="safe-confirm-icon success">
          <IconComp size={40} />
        </div>
        <div className="safe-confirm-title">{title}</div>
        <div className="safe-confirm-msg">{message}</div>
        <div className="safe-confirm-actions">
          <button className="btn" onClick={onClose}>{buttonText}</button>
        </div>
      </div>
    </div>
  );
}
