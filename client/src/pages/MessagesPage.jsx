import { useEffect, useRef, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { api } from "../api.js";
import { useAuth } from "../auth.jsx";
import { Avatar } from "../components/Avatar.jsx";
import { timeAgo } from "../utils.js";

export function MessagesPage() {
  const { user } = useAuth();
  const [params, setParams] = useSearchParams();
  const toId = params.get("to") ? Number(params.get("to")) : null;
  const [convs, setConvs] = useState([]);
  const [active, setActive] = useState(null); // { id, name, avatar } — may start as { id } only
  const [messages, setMessages] = useState([]);
  const [text, setText] = useState("");
  const [sending, setSending] = useState(false);
  const endRef = useRef(null);
  const activeRef = useRef(null);
  activeRef.current = active;
  const openedParam = useRef(null);

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
    const t = setInterval(load, 10000);
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
    const t = setInterval(load, 4000);
    return () => {
      cancelled = true;
      clearInterval(t);
    };
  }, [active?.id]);

  // Scroll to the newest message
  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [messages.length]);

  function openChat(c) {
    setActive(c);
    setParams({ to: String(c.id) }, { replace: true });
  }

  function backToList() {
    setActive(null);
    setParams({}, { replace: true });
  }

  async function send() {
    const body = text.trim();
    if (!body || !active?.id || sending) return;
    setSending(true);
    try {
      const d = await api.post("/api/messages", { toId: active.id, body });
      setMessages((m) => [...m, d.message]);
      setText("");
      api.get("/api/conversations").then((dd) => setConvs(dd.users)).catch(() => {});
    } catch (e) {
      alert(e.message);
    }
    setSending(false);
  }

  return (
    <div className="page">
      <div className={`msg-panes ${active ? "open" : ""}`}>
        <div className="msg-list">
          <div className="msg-list-head">Messages</div>
          {convs.length === 0 ? (
            <div className="empty">
              <div className="big">💬</div>
              No messages yet — open someone's profile and hit <b>Message</b>.
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
                  <div className="msg-prev-text">{c.lastBody}</div>
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
                  ←
                </button>
                {active.name ? (
                  <Link to={`/u/${encodeURIComponent(active.name)}`} className="msg-head-user">
                    <Avatar src={active.avatar} username={active.name} size={34} ring={false} />
                    <span>{active.name}</span>
                  </Link>
                ) : (
                  <span className="msg-head-user">…</span>
                )}
              </div>

              <div className="msg-body">
                {messages.length === 0 && <div className="empty">Say hi 👋</div>}
                {messages.map((m) => {
                  const mine = m.fromId === user?.id;
                  return (
                    <div key={m.id} className={`msg-row ${mine ? "mine" : ""}`}>
                      {!mine && <Avatar src={m.fromAvatar} username={m.fromName} size={28} ring={false} />}
                      <div className="bubble">
                        {m.body}
                        <div className="bubble-time">{timeAgo(m.createdAt)}</div>
                      </div>
                    </div>
                  );
                })}
                <div ref={endRef} />
              </div>

              <div className="msg-input-row">
                <input
                  className="text-input"
                  placeholder="Message…"
                  value={text}
                  onChange={(e) => setText(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") send();
                  }}
                />
                <button className="btn" disabled={!text.trim() || sending} onClick={send}>
                  Send
                </button>
              </div>
            </>
          ) : (
            <div className="msg-empty">
              <div className="big">💬</div>
              Pick a conversation to start chatting.
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
