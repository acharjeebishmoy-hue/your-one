import { useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import { api } from "../api.js";
import { PostCard } from "../components/PostCard.jsx";

export function HashtagPage() {
  const { tag } = useParams();
  const [posts, setPosts] = useState(null);

  useEffect(() => {
    setPosts(null);
    api
      .get(`/api/posts?hashtag=${encodeURIComponent(tag)}`)
      .then((d) => setPosts(d.posts))
      .catch(() => setPosts([]));
  }, [tag]);

  function upsert(p) {
    setPosts((ps) => {
      if (ps.some((x) => x.id === p.id)) return ps.filter((x) => x.id !== p.id);
      return [p, ...ps]; // freshly shared → prepend
    });
  }

  // A post deleted from the full-screen view disappears here too.
  useEffect(() => {
    function onDeleted(e) {
      setPosts((ps) => (ps || []).filter((x) => x.id !== e.detail));
    }
    window.addEventListener("post-deleted", onDeleted);
    return () => window.removeEventListener("post-deleted", onDeleted);
  }, []);

  return (
    <div className="page">
      <div className="tabs">
        <span className="tab active">#{tag}</span>
      </div>
      <div className="feed-col">
        {!posts ? (
          <div className="spin" />
        ) : posts.length === 0 ? (
          <div className="empty">
            <div className="big">#️⃣</div>
            No posts with #{tag} yet. Be the first!
          </div>
        ) : (
          posts.map((p) => <PostCard key={p.id} post={p} onDeleted={upsert} />)
        )}
      </div>
    </div>
  );
}
