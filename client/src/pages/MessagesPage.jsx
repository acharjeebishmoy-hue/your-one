import { useEffect, useRef, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { api } from "../api.js";
import { POLL_MS } from "../perf.js";
import { useAuth } from "../auth.jsx";
import { Avatar } from "../components/Avatar.jsx";
import { timeAgo } from "../utils.js";
import { SafeConfirm, SafeAlert } from "../components/SafeConfirm.jsx";

const EMOJIS = [
  "😀", "😂", "🥹", "😊", "😍", "😘", "😎", "🤩", "🥳", "😢", "😭", "😤",
  "😡", "🤯", "😴", "🤒", "👍", "👎", "👏", "🙏", "💪", "🤝", "✌️", "🤞",
  "❤️", "💔", "💯", "🔥", "✨", "🎉", "🥺", "😅",
];

const STICKERS = [
  "❤️", "😂", "🔥", "👍", "🥳", "😭", "😍", "👏",
  "💯", "😎", "🥺", "🤝", "🎉", "💪", "😘", "🤣",
  "👀", "💀", "🙏", "✨", "🫶", "😤", "🤡", "🫡",
];

// Convert a Blob into a base64 data URL (for voice messages)
function blobToDataUrl(blob) {
  return new Promise((resolve, reject) => {
    const fr = new FileReader();
    fr.onload = () => resolve(fr.result);
    fr.onerror = () => reject(fr.error);
    fr.readAsDataURL(blob);
  });
}

// Resize + compress a photo so chat stays fast and light (like WhatsApp does).
function fileToResizedDataUrl(file, maxDim = 1600, quality = 0.82) {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      const scale = Math.min(1, maxDim / Math.max(img.width, img.height));
      const w = Math.max(1, Math.round(img.width * scale));
      const h = Math.max(1, Math.round(img.height * scale));
      const canvas = document.createElement("canvas");
      canvas.width = w;
      canvas.height = h;
      canvas.getContext("2d").drawImage(img, 0, 0, w, h);
      URL.revokeObjectURL(url);
      resolve(canvas.toDataURL("image/jpeg", quality));
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error("Couldn't read that image"));
    };
    img.src = url;
  });
}

export function MessagesPage() {
  const { user } = useAuth();
  const [params, setParams] = useSearchParams();
  const toId = params.get("to") ? Number(params.get("to")) : null;
  const [convs, setConvs] = useState([]);
  const [active, setActive] = useState(null); // { id, name, avatar } — may start as { id } only
  const [messages, setMessages] = useState([]);
  const [text, setText] = useState("");
  const [sending, setSending] = useState(false);
  const [showEmoji, setShowEmoji] = useState(false);
  const [showStickers, setShowStickers] = useState(false);
  const [recording, setRecording] = useState(false);
  const [recTime, setRecTime] = useState(0);
  const [confirmDeleteMsg, setConfirmDeleteMsg] = useState(null);
  const [confirmDeleteChat, setConfirmDeleteChat] = useState(false);
  const [alertMsg, setAlertMsg] = useState(null);
  const endRef = useRef(null);
  const activeRef = useRef(null);
  activeRef.current = active;
  const openedParam = useRef(null);
  const recRef = useRef(null); // { mediaRecorder, chunks, timer }
  const inputRef = useRef(null);
  const photoRef = useRef(null);

  // Auto-open a chat when arriving with ?to=<id> (e.g. from a notification)
  useEffect(() => {
    if (toId && openedParam.current !== toId) {
      openedParam.current = toId;
      setActive({ id: toId });
    }
  }, [toId]);

  // Conversation list — refresh every 10s so new chats pop in
  useEffect(() => {
    if (!user?.name) return;
    const load = () =>
      api
        .get("/api/conversations")
        .then((d) => {
          setConvs(d.users);
          if (activeRef.current) {
            const found = d.users.find((c) => c.id === activeRef.current.id);
            if (found) setActive(found);
          }
        })
        .catch(() => {});
    load();
    const t = setInterval(load, POLL_MS);
    return () => clearInterval(t);
  }, [user]);

  // Message thread — poll every 4s while a chat is open
  useEffect(() => {
    if (!active?.id) {
      setMessages([]);
      return;
    }
    let cancelled = false;
    const load = () =>
      api
        .get(`/api/messages/${active.id}`)
        .then((d) => {
          if (cancelled) return;
          setActive((prev) => (prev && !prev.name && d.user ? { ...prev, ...d.user } : prev));
          setMessages(d.messages);
        })
        .catch(() => {});
    load();
    const t = setInterval(load, POLL_MS / 2.5);
    return () => {
      cancelled = true;
      clearInterval(t);
    };
  }, [active?.id]);

  // Scroll to the newest message
  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [messages.length]);

  // Stop recording if the chat closes mid-recording
  useEffect(() => {
    if (!active?.id && recRef.current?.mediaRecorder) {
      try {
        recRef.current.mediaRecorder.stop();
      } catch {}
      recRef.current = null;
      setRecording(false);
      setRecTime(0);
    }
  }, [active?.id]);

  function openChat(c) {
    setActive(c);
    setParams({ to: String(c.id) }, { replace: true });
    setShowEmoji(false);
    setShowStickers(false);
  }

  function backToList() {
    setActive(null);
    setParams({}, { replace: true });
  }

  async function send(kind = "text", bodyOverride) {
    const body = bodyOverride ?? text.trim();
    if (!body || !active?.id || sending) return;
    setSending(true);
    try {
      const d = await api.post("/api/messages", { toId: active.id, body, kind });
      setMessages((m) => [...m, d.message]);
      if (kind === "text") setText("");
      api.get("/api/conversations").then((dd) => setConvs(dd.users)).catch(() => {});
    } catch (e) {
      alert(e.message);
    }
    setSending(false);
  }

  function insertEmoji(e) {
    setText((t) => t + e);
    inputRef.current?.focus();
  }

  async function sendPhoto(e) {
    const file = e.target.files?.[0];
    e.target.value = ""; // allow picking the same file again
    if (!file || !active?.id) return;
    setSending(true);
    try {
      const url = await fileToResizedDataUrl(file);
      if (url.length > 4_000_000) {
        // Still too big — shrink harder.
        const small = await fileToResizedDataUrl(file, 900, 0.7);
        await send("image", small);
      } else {
        await send("image", url);
      }
    } catch (err) {
      alert(err.message || "Couldn't send that photo");
    }
    setSending(false);
  }

  async function toggleRecord() {
    if (recording) {
      // Stop and send
      const rec = recRef.current;
      if (rec?.mediaRecorder && rec.mediaRecorder.state !== "inactive") {
        rec.mediaRecorder.stop();
      }
      return;
    }
    if (!navigator.mediaDevices?.getUserMedia) {
      alert("Voice messages aren't supported on this browser.");
      return;
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mime = MediaRecorder.isTypeSupported("audio/webm")
        ? "audio/webm"
        : MediaRecorder.isTypeSupported("audio/mp4")
          ? "audio/mp4"
          : "";
      const mr = new MediaRecorder(stream, mime ? { mimeType: mime } : undefined);
      const chunks = [];
      mr.ondataavailable = (e) => {
        if (e.data.size > 0) chunks.push(e.data);
      };
      mr.onstop = async () => {
        stream.getTracks().forEach((t) => t.stop());
        const blob = new Blob(chunks, { type: mr.mimeType || "audio/webm" });
        recRef.current = null;
        setRecording(false);
        setRecTime(0);
        if (blob.size < 1000) return; // too short — ignore
        try {
          const url = await blobToDataUrl(blob);
          await send("voice", url);
        } catch (e) {
          alert("Couldn't send voice message: " + e.message);
        }
      };
      mr.start();
      const start = Date.now();
      const timer = setInterval(() => setRecTime(Math.round((Date.now() - start) / 1000)), 500);
      recRef.current = { mediaRecorder: mr, timer };
      setRecording(true);
      setShowEmoji(false);
      setShowStickers(false);
    } catch (e) {
      alert("Microphone access denied — check your browser settings.");
    }
  }

  // Clean up timer when recording ends
  useEffect(() => {
    if (!recording && recRef.current?.timer) {
      clearInterval(recRef.current.timer);
      recRef.current.timer = null;
    }
  }, [recording]);

  function formatRec(sec) {
    const m = Math.floor(sec / 60);
    const s = sec % 60;
    return `${m}:${String(s).padStart(2, "0")}`;
  }

  function lastPreview(c) {
    if (c.lastKind === "voice") return "🎤 Voice message";
    if (c.lastKind === "sticker") return `${c.lastBody} sticker`;
    if (c.lastKind === "image") return "📷 Photo";
    return c.lastBody || "";
  }

  async function deleteMessage(m) {
    setConfirmDeleteMsg(null);
    try {
      await api.del(`/api/messages/${m.id}`);
      setMessages((ms) => ms.filter((x) => x.id !== m.id));
      api.get("/api/conversations").then((dd) => setConvs(dd.users)).catch(() => {});
    } catch (e) {
      setAlertMsg({ icon: "❌", title: "Error", message: e.message });
    }
  }

  async function deleteChat() {
    if (!active?.id) return;
    setConfirmDeleteChat(false);
    try {
      await api.del(`/api/conversations/${active.id}`);
      setMessages([]);
      api.get("/api/conversations").then((dd) => setConvs(dd.users)).catch(() => {});
      backToList();
    } catch (e) {
      setAlertMsg({ icon: "❌", title: "Error", message: e.message });
    }
  }

  return (
    <div className="page">
      <div className={`msg-panes ${active ? "open" : ""}`}>
        <div className="msg-list">
          <div className="msg-list-head">Messages</div>
          {convs.length === 0 ? (
            <div className="empty">
              <div className="big">💬</div>
              <div style={{fontWeight: 600}}>No chats yet</div>
              <div style={{fontSize: 13, marginTop: 4}}>Open a profile → tap 💬</div>
            </div>
          ) : (
            convs.map((c) => (
              <div
                key={c.id}
                className={`msg-list-item ${active?.id === c.id ? "active" : ""}`}
                onClick={() => openChat(c)}
              >
                <Avatar src={c.avatar} username={c.name} size={46} ring={false} />
                <div className="msg-prev">
                  <div className="msg-prev-name">
                    {c.name}
                    {c.unread > 0 && <span className="badge">{c.unread > 9 ? "9+" : c.unread}</span>}
                  </div>
                  <div className="msg-prev-text">{lastPreview(c)}</div>
                </div>
                <div className="msg-prev-time">{c.lastAt ? timeAgo(c.lastAt) : ""}</div>
              </div>
            ))
          )}
        </div>

        <div className="msg-chat">
          {active ? (
            <>
              <div className="msg-head">
                <button className="icon-btn msg-back" onClick={backToList} aria-label="Back">
                  <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M19 12H5"/><path d="M12 19l-7-7 7-7"/></svg>
                </button>
                {active.name ? (
                  <Link to={`/u/${encodeURIComponent(active.name)}`} className="msg-head-user">
                    <Avatar src={active.avatar} username={active.name} size={34} ring={false} />
                    <span>{active.name}</span>
                  </Link>
                ) : (
                  <span className="msg-head-user">…</span>
                )}
                <button
                  className="icon-btn msg-del-chat"
                  onClick={() => setConfirmDeleteChat(true)}
                  title="Delete chat"
                  aria-label="Delete chat"
                >
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M3 6h18"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg>
                </button>
              </div>

              <div className="msg-body">
                {messages.length === 0 && <div className="empty">Say hi 👋</div>}
                {messages.map((m) => {
                  const mine = m.fromId === user?.id;
                  return (
                    <div key={m.id} className={`msg-row ${mine ? "mine" : ""}`}>
                      {!mine && <Avatar src={m.fromAvatar} username={m.fromName} size={28} ring={false} />}
                      {m.kind === "image" ? (
                        <div className="bubble img-bubble">
                          <a href={m.body} target="_blank" rel="noreferrer">
                            <img className="chat-img" src={m.body} alt="Shared photo" loading="lazy" />
                          </a>
                          <div className="bubble-time">{timeAgo(m.createdAt)}</div>
                        </div>
                      ) : m.kind === "voice" ? (
                        <div className="bubble voice-bubble">
                          <audio controls preload="metadata" src={m.body} />
                          <div className="bubble-time">{timeAgo(m.createdAt)}</div>
                        </div>
                      ) : m.kind === "sticker" ? (
                        <div className="sticker-msg">
                          <div className="sticker-emoji">{m.body}</div>
                          <div className="bubble-time">{timeAgo(m.createdAt)}</div>
                        </div>
                      ) : (
                        <div className="bubble">
                          {m.body}
                          <div className="bubble-time">{timeAgo(m.createdAt)}</div>
                        </div>
                      )}
                      <button
                        className="msg-del-btn"
                        onClick={() => setConfirmDeleteMsg(m)}
                        title="Delete message"
                        aria-label="Delete message"
                      >
                        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><path d="M18 6L6 18"/><path d="M6 6l12 12"/></svg>
                      </button>
                    </div>
                  );
                })}
                <div ref={endRef} />
              </div>

              <div className="msg-input-row">
                {recording ? (
                  <div className="rec-bar">
                    <span className="rec-dot" />
                    <span className="rec-timer">{formatRec(recTime)}</span>
                    <button className="btn rec-send" onClick={toggleRecord}>
                      <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor"><path d="M2.01 21L23 12 2.01 3 2 10l15 2-15 2z"/></svg>
                    </button>
                  </div>
                ) : (
                  <>
                    <button
                      className={`chat-tool ${showEmoji ? "on" : ""}`}
                      onClick={() => {
                        setShowEmoji((v) => !v);
                        setShowStickers(false);
                      }}
                      title="Emoji"
                    >
                      <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"/><path d="M8 14s1.5 2 4 2 4-2 4-2"/><line x1="9" y1="9" x2="9.01" y2="9"/><line x1="15" y1="9" x2="15.01" y2="9"/></svg>
                    </button>
                    <button
                      className={`chat-tool ${showStickers ? "on" : ""}`}
                      onClick={() => {
                        setShowStickers((v) => !v);
                        setShowEmoji(false);
                      }}
                      title="Stickers"
                    >
                      <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><rect x="2" y="4" width="20" height="16" rx="3"/><path d="M8 11l2 2 4-4"/></svg>
                    </button>
                    <button
                      className="chat-tool rec-btn"
                      onClick={toggleRecord}
                      title="Voice message"
                    >
                      <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z"/><path d="M19 10v2a7 7 0 0 1-14 0v-2"/><line x1="12" y1="19" x2="12" y2="23"/><line x1="8" y1="23" x2="16" y2="23"/></svg>
                    </button>
                    <button
                      className="chat-tool"
                      onClick={() => photoRef.current?.click()}
                      disabled={sending}
                      title="Photo"
                    >
                      <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="3" width="18" height="18" rx="3"/><circle cx="8.5" cy="8.5" r="1.5"/><path d="M21 15l-5-5L5 21"/></svg>
                    </button>
                    <input
                      ref={photoRef}
                      type="file"
                      accept="image/*"
                      hidden
                      onChange={sendPhoto}
                    />
                    <input
                      ref={inputRef}
                      className="text-input"
                      placeholder="Message…"
                      value={text}
                      onChange={(e) => setText(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter") send();
                      }}
                    />
                    {text.trim() ? (
                      <button className="send-icon" disabled={sending} onClick={() => send()} title="Send">
                        <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor"><path d="M2.01 21L23 12 2.01 3 2 10l15 2-15 2z"/></svg>
                      </button>
                    ) : null}
                  </>
                )}
              </div>

              {showEmoji && (
                <div className="emoji-picker">
                  {EMOJIS.map((e) => (
                    <button key={e} className="ep-emoji" onClick={() => insertEmoji(e)}>
                      {e}
                    </button>
                  ))}
                </div>
              )}
              {showStickers && (
                <div className="emoji-picker sticker-picker">
                  {STICKERS.map((s) => (
                    <button
                      key={s}
                      className="ep-sticker"
                      disabled={sending}
                      onClick={() => send("sticker", s)}
                    >
                      {s}
                    </button>
                  ))}
                </div>
              )}
            </>
          ) : (
            <div className="msg-empty">
              <div className="big">💬</div>
              Pick a conversation to start chatting.
            </div>
          )}
        </div>
      </div>

      {confirmDeleteMsg && (
        <SafeConfirm
          icon="🗑"
          title="Delete message?"
          message="This message will be permanently removed."
          confirmText="Delete"
          danger
          onConfirm={() => deleteMessage(confirmDeleteMsg)}
          onCancel={() => setConfirmDeleteMsg(null)}
        />
      )}

      {confirmDeleteChat && (
        <SafeConfirm
          icon="🗑"
          title="Delete entire chat?"
          message={`All messages with ${active?.name || "this person"} will be permanently removed. This can't be undone.`}
          confirmText="Delete all"
          danger
          onConfirm={deleteChat}
          onCancel={() => setConfirmDeleteChat(false)}
        />
      )}

      {alertMsg && (
        <SafeAlert
          icon={alertMsg.icon}
          title={alertMsg.title}
          message={alertMsg.message}
          onClose={() => setAlertMsg(null)}
        />
      )}
    </div>
  );
}
