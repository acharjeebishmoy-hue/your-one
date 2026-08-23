import { useEffect, useRef, useState } from "react";
import { api } from "../api.js";
import { timeAgo } from "../utils.js";
import { Avatar } from "./Avatar.jsx";

const DURATION = 5000;

export function StoryViewer({ groups, startGroup, onClose }) {
  const [gi, setGi] = useState(startGroup);
  const [si, setSi] = useState(0);
  const [paused, setPaused] = useState(false);
  const viewedRef = useRef(new Set());
  const group = groups[gi];

  // mark viewed
  useEffect(() => {
    const s = group?.stories[si];
    if (s && !viewedRef.current.has(s.id)) {
      viewedRef.current.add(s.id);
      api.post(`/api/stories/${s.id}/view`).catch(() => {});
    }
  }, [gi, si, group]);

  // auto-advance
  useEffect(() => {
    if (paused) return;
    const t = setInterval(() => {
      if (si < group.stories.length - 1) setSi(si + 1);
      else if (gi < groups.length - 1) {
        setGi(gi + 1);
        setSi(0);
      } else onClose();
    }, DURATION);
    return () => clearInterval(t);
  }, [si, gi, group, groups.length, paused, onClose]);

  if (!group) return null;
  const story = group.stories[si];

  function go(dir) {
    if (dir === -1) {
      if (si > 0) setSi(si - 1);
      else if (gi > 0) {
        setGi(gi - 1);
        setSi(groups[gi - 1].stories.length - 1);
      }
    } else {
      if (si < group.stories.length - 1) setSi(si + 1);
      else if (gi < groups.length - 1) {
        setGi(gi + 1);
        setSi(0);
      } else onClose();
    }
  }

  return (
    <div className="story-viewer" onMouseDown={() => setPaused(true)} onMouseUp={() => setPaused(false)}>
      <button className="modal-close sv-close" onClick={onClose}>✕</button>

      <div className="sv-progress">
        {group.stories.map((s, i) => (
          <div key={s.id} className="sv-bar">
            <div
              className={`sv-fill ${i < si ? "done" : i === si ? "active" : ""}`}
              style={i === si ? { animationDuration: `${DURATION}ms`, animationPlayState: paused ? "paused" : "running" } : undefined}
            />
          </div>
        ))}
      </div>

      <div className="sv-head">
        <Avatar src={group.author.avatar} username={group.author.name} size={34} />
        <div>
          <div className="sv-name">{group.author.name}</div>
          <div className="sv-time">{timeAgo(story.createdAt)}</div>
        </div>
      </div>

      <div className="sv-media">
        {story.image ? (
          <>
            <img src={story.image} alt={story.caption || "story"} />
            {story.caption && <div className="sv-caption">{story.caption}</div>}
          </>
        ) : (
          <div className="sv-text-only">{story.caption || ""}</div>
        )}
      </div>

      <button className="sv-zone left" onClick={() => go(-1)} aria-label="Previous" />
      <button className="sv-zone right" onClick={() => go(1)} aria-label="Next" />
    </div>
  );
}
