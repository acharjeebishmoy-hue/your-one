import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { api } from "../api.js";
import { useAuth } from "../auth.jsx";
import { timeAgo } from "../utils.js";
import { Avatar } from "./Avatar.jsx";

function notifText(n) {
  const who = <b>{n.actor.name}</b>;
  if (n.type === "join") return <span>{who} joined the group 🎉</span>;
  if (n.type === "follow") return <span>{who} started following you</span>;
  if (n.type === "like") return <span>{who} liked your post</span>;
  if (n.type === "mention") return <span>{who} mentioned you in a post</span>;
  if (n.type === "share") return <span>{who} shared your post</span>;
  if (n.type === "reply") return <span>{who} replied to your comment{n.body ? <>: “{n.body}”</> : ""}</span>;
  if (n.type === "event_rsvp") return <span>{who} {n.body || "is going to your event"}</span>;
  if (n.type === "message") return <span>{who} messaged you</span>;
  return (
    <span>
      {who} commented{n.body ? <>: “{n.body}”</> : " on your post"}
    </span>
  );
}

export function NotificationsBell() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const [items, setItems] = useState([]);
  const [unread, setUnread] = useState(0);
  const [toast, setToast] = useState(null);
  const rootRef = useRef(null);
  const itemsRef = useRef([]);
  const openRef = useRef(false);

  async function refresh({ silent = false } = {}) {
    const d = await api.get("/api/notifications");
    const known = new Set(itemsRef.current.map((i) => i.id));
    const fresh = d.notifications.filter((n) => !known.has(n.id));
    itemsRef.current = d.notifications;
    setItems(d.notifications);
    setUnread(d.notifications.filter((n) => !n.read).length);
    if (!silent && !openRef.current && fresh.length > 0) {
      setToast(fresh[0]);
    }
  }

  // Live updates: check every 10s so a like/comment/follow pops up on its own.
  useEffect(() => {
    if (!user) return;
    refresh({ silent: true }).catch(() => {});
    const t = setInterval(() => refresh({ silent: true }).catch(() => {}), 10000);
    return () => clearInterval(t);
  }, [user]);

  useEffect(() => {
    openRef.current = open;
    if (open) refresh({ silent: true }).catch(() => {});
  }, [open]);

  useEffect(() => {
    function onClick(e) {
      if (rootRef.current && !rootRef.current.contains(e.target)) setOpen(false);
    }
    document.addEventListener("mousedown", onClick);
    return () => document.removeEventListener("mousedown", onClick);
  }, []);

  // Auto-dismiss the toast popup
  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(null), 8000);
    return () => clearTimeout(t);
  }, [toast]);

  function openFrom(n) {
    setToast(null);
    setOpen(false);
    if (unread > 0) {
      setUnread(0);
      api.post("/api/notifications/read").catch(() => {});
      setItems((its) => its.map((i) => ({ ...i, read: true })));
    }
    if (n.postId) navigate(`/p/${n.postId}`);
    else navigate(`/u/${encodeURIComponent(n.actor.name)}`);
  }

  return (
    <div style={{ position: "relative" }} ref={rootRef}>
      <button className="icon-btn" onClick={() => setOpen((o) => !o)} aria-label="Notifications">
        <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
          <path d="M18 8a6 6 0 1 0-12 0c0 7-3 9-3 9h18s-3-2-3-9" />
          <path d="M13.7 21a2 2 0 0 1-3.4 0" />
        </svg>
        {unread > 0 && <span className="badge">{unread > 9 ? "9+" : unread}</span>}
      </button>

      {open && (
        <div className="dropdown">
          <div className="modal-head"><span>Notifications</span></div>
          {items.length === 0 && (
            <div className="empty" style={{ padding: 24 }}>
              Nothing yet — likes, comments and follows will show up here.
            </div>
          )}
          {items.map((n) => (
            <div
              key={n.id}
              className={`notif-item ${n.read ? "" : "unread"}`}
              onClick={() => openFrom(n)}
              style={{ cursor: "pointer" }}
            >
              <Avatar src={n.actor.avatar} username={n.actor.name} size={34} ring={false} />
              <div className="n-text">
                {notifText(n)}
                <div className="n-time">{timeAgo(n.createdAt)}</div>
              </div>
              {n.postImage && <img className="notif-thumb" src={n.postImage} alt="" />}
            </div>
          ))}
        </div>
      )}

      {toast && (
        <div className="toast" onClick={() => openFrom(toast)}>
          <Avatar src={toast.actor.avatar} username={toast.actor.name} size={40} ring={false} />
          <div className="t-body">
            <div className="n-text">{notifText(toast)}</div>
            <div className="n-time">{timeAgo(toast.createdAt)}</div>
          </div>
          {toast.postImage && <img className="notif-thumb" src={toast.postImage} alt="" />}
          <button
            className="toast-x"
            aria-label="Dismiss"
            onClick={(e) => {
              e.stopPropagation();
              setToast(null);
            }}
          >
            ✕
          </button>
        </div>
      )}
    </div>
  );
}
