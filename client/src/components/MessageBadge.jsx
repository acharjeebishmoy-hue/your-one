import { useEffect, useState } from "react";
import { api } from "../api.js";
import { POLL_MS } from "../perf.js";
import { useAuth } from "../auth.jsx";

// Live unread message count (polled so new chats pop in on their own)
export function useUnreadMessages() {
  const { user } = useAuth();
  const [count, setCount] = useState(0);

  useEffect(() => {
    if (!user?.name) return;
    const load = () =>
      api
        .get("/api/messages/unread")
        .then((d) => setCount(d.count))
        .catch(() => {});
    load();
    const t = setInterval(load, POLL_MS);
    return () => clearInterval(t);
  }, [user]);

  return count;
}

export function MessagesBadge() {
  const count = useUnreadMessages();
  if (!count) return null;
  return <span className="badge">{count > 9 ? "9+" : count}</span>;
}
