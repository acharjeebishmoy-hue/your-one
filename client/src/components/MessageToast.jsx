import { useEffect, useRef, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { api } from "../api.js";
import { useAuth } from "../auth.jsx";
import { Avatar } from "./Avatar.jsx";

function preview(c) {
  if (c.lastKind === "voice") return "🎤 Voice message";
  if (c.lastKind === "sticker") return `${c.lastBody} sticker`;
  return c.lastBody || "";
}

// Pops a Messenger-style bubble whenever someone texts you while you're
// anywhere in the app EXCEPT the messages section. Tapping it jumps to the chat.
export function MessageToast() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [toast, setToast] = useState(null);
  const seenRef = useRef({}); // convId -> "lastAt|unread" marker from the previous poll
  const primedRef = useRef(false); // true once the first poll has recorded the initial state
  const timerRef = useRef(null);

  useEffect(() => {
    if (!user?.name) return;

    const load = () =>
      api
        .get("/api/conversations")
        .then((d) => {
          const first = !primedRef.current;
          primedRef.current = true;
          const now = {};
          for (const c of d.users) {
            const marker = `${c.lastAt}|${c.unread}`;
            now[c.id] = marker;
            // First poll just records — don't toast messages that arrived before the app opened.
            if (first) continue;
            // Anything new with unread > 0 = the other person just texted you.
            // (A brand-new conversation counts too — someone texted you for the first time.)
            const isNew = !(c.id in seenRef.current) || seenRef.current[c.id] !== marker;
            if (c.unread > 0 && isNew) {
              // Don't interrupt while the user is already in the messages section.
              if (location.pathname !== "/messages") {
                setToast({ id: c.id, name: c.name, avatar: c.avatar, text: preview(c) });
                clearTimeout(timerRef.current);
                timerRef.current = setTimeout(() => setToast(null), 5000);
              }
            }
          }
          seenRef.current = now;
        })
        .catch(() => {});

    load();
    const t = setInterval(load, 8000);
    return () => clearInterval(t);
  }, [user, location.pathname]);

  useEffect(() => () => clearTimeout(timerRef.current), []);

  if (!toast) return null;

  return (
    <button
      className="msg-toast"
      onClick={() => {
        setToast(null);
        navigate(`/messages?to=${toast.id}`);
      }}
    >
      <Avatar src={toast.avatar} username={toast.name} size={36} ring={false} />
      <span className="msg-toast-text">
        <span className="msg-toast-name">{toast.name}</span>
        <span className="msg-toast-prev">{toast.text}</span>
      </span>
      <span className="msg-toast-arrow">›</span>
    </button>
  );
}
