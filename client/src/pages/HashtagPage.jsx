import { useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import { api } from "../api.js";
import { PostCard } from "../components/PostCard.jsx";

export function HashtagPage() {
  const { tag } = useParams();
  const [posts, setPosts] = useState(null);

  useEffect(() => {
    setPosts(null);
    api.get(`/api/posts?hashtag=${encodeURIComponent(tag)}`).then((d) => setPosts(d.posts));
  }, [tag]);

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
          posts.map((p) => <PostCard key={p.id} post={p} />)
        )}
      </div>
    </div>
  );
}
