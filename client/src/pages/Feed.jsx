import { useCallback, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { api } from "../api.js";
import { PostCard } from "../components/PostCard.jsx";
import { StoriesBar } from "../components/StoriesBar.jsx";
import { StoryViewer } from "../components/StoryViewer.jsx";
import { StoryComposer } from "../components/StoryComposer.jsx";
import { Avatar } from "../components/Avatar.jsx";
import { useAuth } from "../auth.jsx";

export function Feed({ view, setView, version = 0, onCompose }) {
  const { user } = useAuth();
  const [posts, setPosts] = useState(null);
  const [birthdays, setBirthdays] = useState([]);
  const [storyGroups, setStoryGroups] = useState([]);
  const [viewing, setViewing] = useState(null); // group index in storyGroups
  const [composing, setComposing] = useState(false);

  const load = useCallback(async () => {
    setPosts(null);
    const d = await api.get(view === "following" ? "/api/feed" : "/api/posts");
    setPosts(d.posts);
    setBirthdays(d.birthdays || []);
  }, [view]);

  useEffect(() => {
    load();
  }, [load, version]);

  async function loadStories() {
    try {
      const d = await api.get("/api/stories");
      const byUser = new Map();
      for (const s of d.stories) {
        if (!byUser.has(s.author.id)) byUser.set(s.author.id, { author: s.author, stories: [] });
        byUser.get(s.author.id).stories.push(s);
      }
      setStoryGroups([...byUser.values()]);
    } catch {
      /* ignore */
    }
  }

  useEffect(() => {
    loadStories();
    const t = setInterval(loadStories, 30000);
    return () => clearInterval(t);
  }, []);

  function openStories(authorId) {
    const gi = storyGroups.findIndex((g) => g.author.id === authorId);
    if (gi >= 0) setViewing(gi);
  }

  function removePost(p) {
    setPosts((ps) => {
      if (ps.some((x) => x.id === p.id)) return ps.filter((x) => x.id !== p.id); // deleted
      return [p, ...ps]; // freshly shared → prepend
    });
  }

  // A post deleted from the full-screen view disappears from the feed too.
  useEffect(() => {
    function onDeleted(e) {
      removePost({ id: e.detail });
    }
    window.addEventListener("post-deleted", onDeleted);
    return () => window.removeEventListener("post-deleted", onDeleted);
  }, []);

  return (
    <div className="page">
      <div className="tabs">
        <button className={`tab ${view === "following" ? "active" : ""}`} onClick={() => setView("following")}>
          <span className="tab-icon">👥</span> Following
        </button>
        <button className={`tab ${view === "everyone" ? "active" : ""}`} onClick={() => setView("everyone")}>
          <span className="tab-icon">🌍</span> Everyone
        </button>
      </div>

      <div className="feed-col">
        <button className="compose-box" onClick={onCompose} aria-label="Create post">
          <span className="cb-avatar">
            <img src={user?.avatar} alt={user?.name || "you"} />
          </span>
          <span className="cb-text">
            What's on your mind{user?.name ? `, ${user.name.split(" ")[0]}` : ""}?
          </span>
        </button>

        <StoriesBar onOpen={openStories} onOpenComposer={() => setComposing(true)} />

        {birthdays.length > 0 && (
          <div className="birthday-card">
            <span className="bc-icon">🎂</span>
            <span>Today's birthdays: </span>
            {birthdays.map((b, i) => (
              <span key={b.id}>
                {i > 0 && ", "}
                <Link to={`/u/${encodeURIComponent(b.name)}`} className="rich-link">
                  <Avatar src={b.avatar} username={b.name} size={20} ring={false} />
                  {b.name}
                </Link>
              </span>
            ))}
            <span className="bc-hint">— say happy birthday! 🎉</span>
          </div>
        )}

        {!posts ? (
          <div className="spin" />
        ) : posts.length === 0 ? (
          <div className="empty">
            <div className="big">🌱</div>
            <div style={{fontSize: 15, fontWeight: 600}}>Empty feed</div>
            <div style={{fontSize: 13, marginTop: 4}}>Tap 👤 to find friends, or ➕ to post</div>
          </div>
        ) : (
          posts.map((p) => <PostCard key={p.id} post={p} onDeleted={removePost} />)
        )}
      </div>

      {viewing !== null && storyGroups.length > 0 && (
        <StoryViewer
          groups={storyGroups}
          startGroup={viewing}
          onClose={() => { setViewing(null); loadStories(); }}
        />
      )}
      {composing && (
        <StoryComposer onClose={() => setComposing(false)} onCreated={loadStories} />
      )}
    </div>
  );
}
