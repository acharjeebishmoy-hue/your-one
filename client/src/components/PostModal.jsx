import { useEffect, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { api } from "../api.js";
import { useAuth } from "../auth.jsx";
import { timeAgo, plural, isOnline, REACTION_EMOJI, reactionSummary } from "../utils.js";
import { RichText } from "./RichText.jsx";
import { Avatar } from "./Avatar.jsx";
import { HeartIcon, CommentIcon, ShareIcon } from "./PostCard.jsx";

export function PostModal() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { user } = useAuth();
  const [post, setPost] = useState(null);
  const [comments, setComments] = useState([]);
  const [text, setText] = useState("");
  const [replyTo, setReplyTo] = useState(null);
  const [busy, setBusy] = useState(false);
  const [notFound, setNotFound] = useState(false);

  useEffect(() => {
    api
      .get(`/api/posts/${id}`)
      .then((d) => {
        setPost(d.post);
        setComments(d.comments);
      })
      .catch(() => setNotFound(true));
  }, [id]);

  if (notFound) {
    return (
      <div className="modal-backdrop" onClick={() => navigate(-1)}>
        <div className="modal" onClick={(e) => e.stopPropagation()}>
          <div className="error-page">
            <h1>Post not found</h1>
            <p>It may have been deleted.</p>
          </div>
        </div>
      </div>
    );
  }

  if (!post) return null;

  async function react(type) {
    const was = post.myReaction;
    if (was === type) {
      post.myReaction = null;
      post.likeCount -= 1;
      post.reactions = { ...post.reactions, [type]: Math.max(0, (post.reactions[type] || 0) - 1) };
      await api.del(`/api/posts/${post.id}/like`);
    } else {
      post.myReaction = type;
      post.likeCount += was ? 0 : 1;
      post.reactions = {
        ...post.reactions,
        [type]: (post.reactions[type] || 0) + 1,
        [was]: was ? Math.max(0, (post.reactions[was] || 0) - 1) : post.reactions[was],
      };
      await api.post(`/api/posts/${post.id}/like`, { type });
    }
    setPost({ ...post });
  }

  async function addComment(e) {
    e.preventDefault();
    if (!text.trim() || busy) return;
    setBusy(true);
    try {
      const d = await api.post(`/api/posts/${post.id}/comments`, {
        body: text.trim(),
        parentId: replyTo?.id || null,
      });
      setComments((c) => [...c, d.comment]);
      post.commentCount += 1;
      setPost({ ...post });
      setText("");
      setReplyTo(null);
    } finally {
      setBusy(false);
    }
  }

  async function share() {
    await api.post(`/api/posts/${post.id}/share`, { comment: "" });
    alert("Shared to your feed!");
  }

  const top = comments.filter((c) => !c.parentId);
  const repliesOf = (pid) => comments.filter((c) => c.parentId === pid);
  const summary = reactionSummary(post.reactions, post.likeCount);

  return (
    <div className="modal-backdrop" onClick={() => navigate(-1)}>
      <div className="modal post-modal" onClick={(e) => e.stopPropagation()}>
        <div className="pm-media">
          {post.video ? (
            <video className="pm-video" src={post.video} controls autoPlay playsInline poster={post.image || undefined} />
          ) : post.image ? (
            <img src={post.image} alt={post.caption || "post"} />
          ) : (
            <div className="pm-text">{post.caption}</div>
          )}
        </div>
        <div className="pm-side">
          <div className="post-head">
            <Link to={`/u/${encodeURIComponent(post.author.name)}`}>
              <Avatar src={post.author.avatar} username={post.author.name} size={34} online={isOnline(post.author.lastSeen)} />
            </Link>
            <div>
              <Link to={`/u/${encodeURIComponent(post.author.name)}`} className="ph-name">{post.author.name}</Link>
              <div className="ph-user">@{post.author.name} · {timeAgo(post.createdAt)}</div>
            </div>
            <button className="modal-close" onClick={() => navigate(-1)}>✕</button>
          </div>

          <div className="pm-comments">
            {post.caption && (
              <div className="post-comment-item">
                <Link to={`/u/${encodeURIComponent(post.author.name)}`}><b>{post.author.name}</b></Link>
                <RichText text={post.caption} />
              </div>
            )}
            {comments.length === 0 && (
              <div className="empty" style={{ padding: 24 }}>
                No comments yet. Be the first!
              </div>
            )}
            {top.map((c) => (
              <div key={c.id} className="comment-thread">
                <div className="post-comment-item">
                  <Link to={`/u/${encodeURIComponent(c.author.name)}`}><b>{c.author.name}</b></Link>
                  <RichText text={c.body} />
                  <button className="c-reply" onClick={() => setReplyTo(replyTo?.id === c.id ? null : c)}>Reply</button>
                </div>
                {repliesOf(c.id).map((r) => (
                  <div className="post-comment-item reply" key={r.id}>
                    <Link to={`/u/${encodeURIComponent(r.author.name)}`}><b>{r.author.name}</b></Link>
                    <RichText text={r.body} />
                  </div>
                ))}
              </div>
            ))}
          </div>

          <div className="post-body">
            <div className="post-actions">
              <button
                className={`action-btn ${post.myReaction ? "liked" : ""}`}
                onClick={() => react("like")}
                title="Like"
              >
                <HeartIcon filled={!!post.myReaction} />
              </button>
              {Object.entries(REACTION_EMOJI).filter(([t]) => t !== "like").map(([t, e]) => (
                <button
                  key={t}
                  className={`action-btn react-mini ${post.myReaction === t ? "liked" : ""}`}
                  onClick={() => react(t)}
                  title={t}
                >
                  <span>{e}</span>
                </button>
              ))}
              <button className="action-btn" onClick={() => document.querySelector(".comment-box input")?.focus()}>
                <CommentIcon />
              </button>
              <button className="action-btn" onClick={share} title="Share">
                <ShareIcon />
              </button>
            </div>
            {summary && (
              <div className="post-reactions">
                <span className="pr-emoji">{summary}</span>
                <span className="pr-total">{post.likeCount} {plural(post.likeCount, "reaction")}</span>
                {post.myReaction && <span className="pr-mine">You: {REACTION_EMOJI[post.myReaction]}</span>}
              </div>
            )}
          </div>

          <form className="comment-box" onSubmit={addComment}>
            {replyTo && (
              <div className="replying">
                Replying to <b>{replyTo.author.name}</b>
                <button type="button" onClick={() => setReplyTo(null)}>✕</button>
              </div>
            )}
            <input
              placeholder={replyTo ? "Write a reply…" : "Add a comment…"}
              value={text}
              onChange={(e) => setText(e.target.value)}
            />
            <button type="submit" disabled={!text.trim() || busy}>Send</button>
          </form>
        </div>
      </div>
    </div>
  );
}
