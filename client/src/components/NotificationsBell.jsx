import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { api } from "../api.js";
import { useAuth } from "../auth.jsx";
import { timeAgo } from "../utils.js";
import { Avatar } from "./Avatar.jsx";
import { PushToggle } from "./PushToggle.jsx";

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
  const rootRef = useRef(null);
  const itemsRef = useRef([]);

  async function refresh() {
    const d = await api.get("/api/notifications");
    itemsRef.current = d.notifications;
    setItems(d.notifications);
    setUnread(d.notifications.filter((n) => !n.read).length);
  }

  // Live updates: check every 10s so the unread badge stays current.
  useEffect(() => {
    if (!user) return;
    refresh().catch(() => {});
    const t = setInterval(() => refresh().catch(() => {}), 10000);
    return () => clearInterval(t);
  }, [user]);

  useEffect(() => {
    if (open) refresh().catch(() => {});
  }, [open]);

  useEffect(() => {
    function onClick(e) {
      if (rootRef.current && !rootRef.current.contains(e.target)) setOpen(false);
    }
    document.addEventListener("mousedown", onClick);
    return () => document.removeEventListener("mousedown", onClick);
  }, []);

  function openFrom(n) {
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
          <PushToggle />
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
    </div>
  );
}
