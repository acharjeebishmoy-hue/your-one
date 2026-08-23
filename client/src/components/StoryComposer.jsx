import { useRef, useState } from "react";
import { api } from "../api.js";

export function StoryComposer({ onClose, onCreated }) {
  const fileRef = useRef(null);
  const [preview, setPreview] = useState(null);
  const [caption, setCaption] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  function pickFile(e) {
    const f = e.target.files?.[0];
    if (!f) return;
    if (!f.type.startsWith("image/")) return setError("Only image files are allowed.");
    if (f.size > 10 * 1024 * 1024) return setError("Image must be under 10 MB.");
    setError("");
    setPreview(URL.createObjectURL(f));
  }

  async function submit() {
    if (busy || (!fileRef.current?.files?.[0] && !caption.trim())) return;
    setBusy(true);
    setError("");
    const fd = new FormData();
    fd.append("caption", caption);
    if (fileRef.current?.files?.[0]) fd.append("image", fileRef.current.files[0]);
    try {
      await api.post("/api/stories", fd);
      onCreated?.();
      onClose();
    } catch (err) {
      setError(err.message);
      setBusy(false);
    }
  }

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <div className="modal-head">
          <span>Add to your story</span>
          <button className="modal-close" onClick={onClose}>✕</button>
        </div>
        <div className="modal-body">
          {error && <div className="error-box">{error}</div>}
          <input ref={fileRef} type="file" accept="image/*" hidden onChange={pickFile} />
          <div className="upload-zone" onClick={() => fileRef.current?.click()}>
            {preview ? (
              <img src={preview} alt="preview" />
            ) : (
              <>
                <div style={{ fontSize: 34 }}><svg width="36" height="36" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z"/><circle cx="12" cy="13" r="4"/></svg></div>
                <div style={{ marginTop: 8 }}>Click to add a photo</div>
              </>
            )}
          </div>
          <textarea
            className="textarea-input"
            placeholder="Add a caption… (optional)"
            value={caption}
            maxLength={200}
            onChange={(e) => setCaption(e.target.value)}
          />
          <button className="btn block" disabled={busy || (!preview && !caption.trim())} onClick={submit}>
            {busy ? "Posting…" : "Share to story"}
          </button>
          <div className="hint">Your story disappears after 24 hours</div>
        </div>
      </div>
    </div>
  );
}
