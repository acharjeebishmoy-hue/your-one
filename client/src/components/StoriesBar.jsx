import { useCallback, useEffect, useState } from "react";
import { api } from "../api.js";
import { useAuth } from "../auth.jsx";
import { timeAgo } from "../utils.js";
import { Avatar } from "./Avatar.jsx";

export function StoriesBar({ onOpen, onOpenComposer }) {
  const { user } = useAuth();
  const [groups, setGroups] = useState(null);

  const load = useCallback(async () => {
    try {
      const d = await api.get("/api/stories");
      const byUser = new Map();
      for (const s of d.stories) {
        if (!byUser.has(s.author.id)) byUser.set(s.author.id, { author: s.author, stories: [] });
        byUser.get(s.author.id).stories.push(s);
      }
      setGroups([...byUser.values()]);
    } catch {
      /* ignore */
    }
  }, []);

  useEffect(() => {
    load();
    const t = setInterval(load, 30000);
    return () => clearInterval(t);
  }, [load]);

  return (
    <div className="stories-bar">
      <div className="stories-row">
        {user?.name && (
          <button className="story-item story-add" onClick={onOpenComposer}>
            <div className="story-add-circle">
              <img src={user.avatar} alt="" className="story-add-avatar" />
              <span className="story-add-plus">＋</span>
            </div>
            <span className="story-name">Your story</span>
          </button>
        )}
        {groups?.map((g) => {
          const allSeen = g.stories.every((s) => s.viewedByMe);
          return (
            <button
              key={g.author.id}
              className="story-item"
              onClick={() => onOpen(g.author.id)}
            >
              <Avatar src={g.author.avatar} username={g.author.name} size={58} className={allSeen ? "seen" : ""} />
              <span className="story-name">{g.author.name}</span>
              <span className="story-when">{timeAgo(g.stories[0].createdAt)}</span>
            </button>
          );
        })}
      </div>
    </div>
  );
}
