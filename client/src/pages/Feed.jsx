import { useCallback, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { api } from "../api.js";
import { PostCard } from "../components/PostCard.jsx";
import { StoriesBar } from "../components/StoriesBar.jsx";
import { StoryViewer } from "../components/StoryViewer.jsx";
import { StoryComposer } from "../components/StoryComposer.jsx";
import { Avatar } from "../components/Avatar.jsx";

export function Feed({ view, setView, version = 0 }) {
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

  return (
    <div className="page">
      <div className="tabs">
        <button className={`tab ${view === "following" ? "active" : ""}`} onClick={() => setView("following")}>
          Following
        </button>
        <button className={`tab ${view === "everyone" ? "active" : ""}`} onClick={() => setView("everyone")}>
          Everyone
        </button>
      </div>

      <div className="feed-col">
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
            Your feed is quiet. Follow people (try <b>Explore</b>) or create your first post!
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
