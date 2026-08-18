import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { api } from "../api.js";
import { useAuth } from "../auth.jsx";
import { Avatar } from "../components/Avatar.jsx";

export function Explore() {
  const { user } = useAuth();
  const [posts, setPosts] = useState(null);
  const [suggestions, setSuggestions] = useState([]);
  const [following, setFollowing] = useState(new Set());
  const navigate = useNavigate();

  useEffect(() => {
    api.get("/api/posts").then((d) => setPosts(d.posts));
    api.get("/api/suggestions").then((d) => setSuggestions(d.users)).catch(() => {});
  }, []);

  // A post deleted from the full-screen view disappears from the grid too.
  useEffect(() => {
    function onDeleted(e) {
      setPosts((ps) => (ps || []).filter((p) => p.id !== e.detail));
    }
    window.addEventListener("post-deleted", onDeleted);
    return () => window.removeEventListener("post-deleted", onDeleted);
  }, []);

  async function follow(u) {
    try {
      await api.post(`/api/users/${u.id}/follow`);
      setFollowing((f) => new Set(f).add(u.id));
    } catch {
      /* name required — the app prompts for it */
    }
  }

  return (
    <div className="page">
      <div className="tabs">
        <span className="tab active">Explore</span>
      </div>

      {user?.name && suggestions.length > 0 && (
        <div className="suggestions">
          <div className="sugg-head">👋 People you may know</div>
          <div className="sugg-row">
            {suggestions.map((u) => (
              <div key={u.id} className="sugg-card">
                <div onClick={() => navigate(`/u/${encodeURIComponent(u.name)}`)} style={{ cursor: "pointer", textAlign: "center" }}>
                  <Avatar src={u.avatar} username={u.name} size={56} ring={false} />
                  <div className="sr-name">{u.name}</div>
                </div>
                {following.has(u.id) ? (
                  <button className="btn small ghost">Following ✓</button>
                ) : (
                  <button className="btn small" onClick={() => follow(u)}>Follow</button>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {!posts ? (
        <div className="spin" />
      ) : posts.length === 0 ? (
        <div className="empty">
          <div className="big">🌍</div>
          Nothing here yet. Be the first to post!
        </div>
      ) : (
        <div className="explore-grid">
          {posts.map((p) => (
            <div key={p.id} className="grid-tile" onClick={() => navigate(`/p/${p.id}`)}>
              {p.video ? (
                <>
                  <video src={p.video} muted playsInline preload="metadata" />
                  <span className="tile-badge">🎬</span>
                </>
              ) : p.image ? (
                <img src={p.image} alt={p.caption || "post"} loading="lazy" />
              ) : (
                <div className="tile-text">{p.caption}</div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
