import { useEffect, useRef, useState } from "react";
import { api } from "../api.js";
import { Avatar } from "./Avatar.jsx";

export function Composer({ onClose, onCreated }) {
  const fileRef = useRef(null);
  const [media, setMedia] = useState(null); // { kind: "image" | "video", url }
  const [caption, setCaption] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [mentions, setMentions] = useState([]);

  // Detect a "@name" being typed at the caret end of the caption and suggest users.
  useEffect(() => {
    const m = caption.match(/(?:^|\s)@([A-Za-z0-9]*)$/);
    if (!m) return setMentions([]);
    if (m[1].length === 0) return setMentions([]);
    let alive = true;
    const t = setTimeout(async () => {
      try {
        const d = await api.get(`/api/search?q=${encodeURIComponent(m[1])}`);
        if (alive) setMentions(d.users.slice(0, 5));
      } catch {
        if (alive) setMentions([]);
      }
    }, 250);
    return () => {
      alive = false;
      clearTimeout(t);
    };
  }, [caption]);

  function pickMention(u) {
    const i = caption.search(/(?:^|\s)@[A-Za-z0-9]*$/);
    const prefix = caption.slice(0, i);
    setCaption(prefix + `@${u.name} `);
    setMentions([]);
  }

  function pickFile(e) {
    const f = e.target.files?.[0];
    if (!f) return;
    const kind = f.type.startsWith("video/") ? "video" : f.type.startsWith("image/") ? "image" : null;
    if (!kind) {
      setError("Only image or video files are allowed.");
      return;
    }
    if (f.size > 50 * 1024 * 1024) {
      setError("File must be under 50 MB.");
      return;
    }
    setError("");
    setMedia({ kind, url: URL.createObjectURL(f) });
  }

  async function submit() {
    if (busy) return;
    if (!media && !caption.trim()) {
      setError("Add a photo, video or some text.");
      return;
    }
    setBusy(true);
    setError("");
    const fd = new FormData();
    fd.append("caption", caption);
    if (fileRef.current?.files?.[0]) fd.append(media?.kind === "video" ? "video" : "image", fileRef.current.files[0]);
    try {
      const d = await api.post("/api/posts", fd);
      onCreated?.(d.post);
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
          <span>Create post</span>
          <button className="modal-close" onClick={onClose}>✕</button>
        </div>
        <div className="modal-body">
          {error && <div className="error-box">{error}</div>}
          <input
            ref={fileRef}
            type="file"
            accept="image/*,video/*"
            hidden
            onChange={pickFile}
          />
          <div className="upload-zone" onClick={() => fileRef.current?.click()}>
            {media?.kind === "video" ? (
              <video src={media.url} controls muted playsInline />
            ) : media ? (
              <img src={media.url} alt="preview" />
            ) : (
              <>
                <div style={{ fontSize: 34 }}><svg width="36" height="36" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z"/><circle cx="12" cy="13" r="4"/></svg></div>
                <div style={{ marginTop: 8 }}>Click to add a photo or video</div>
              </>
            )}
          </div>
          <div style={{ position: "relative" }}>
            <textarea
              className="textarea-input"
              placeholder={"Write a caption…  (type @ to tag a friend, # for hashtags)"}
              value={caption}
              maxLength={2200}
              onChange={(e) => setCaption(e.target.value)}
            />
            {mentions.length > 0 && (
              <div className="mention-picker">
                {mentions.map((u) => (
                  <button key={u.id} onClick={() => pickMention(u)}>
                    <Avatar src={u.avatar} username={u.name} size={28} ring={false} />
                    {u.name}
                  </button>
                ))}
              </div>
            )}
          </div>
          <button className="btn block" disabled={busy} onClick={submit}>
            {busy ? "Posting…" : "Post"}
          </button>
        </div>
      </div>
    </div>
  );
}
