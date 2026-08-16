import { useEffect, useRef, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { api } from "../api.js";
import { useAuth } from "../auth.jsx";
import { timeAgo, formatDate, plural, isOnline, REACTION_EMOJI, reactionSummary } from "../utils.js";
import { RichText } from "./RichText.jsx";
import { Avatar } from "./Avatar.jsx";

export function HeartIcon({ filled }) {
  return (
    <svg width="24" height="24" viewBox="0 0 24 24" fill={filled ? "currentColor" : "none"} stroke="currentColor" strokeWidth="1.8">
      <path d="M12 21s-7.5-4.7-10-9.3C.3 8.4 2.4 4.5 6 4.5c2.2 0 3.6 1.1 4.5 2.5.4.6 1.1 1 1.5 1s1.1-.4 1.5-1c.9-1.4 2.3-2.5 4.5-2.5 3.6 0 5.7 3.9 4 7.2C19.5 16.3 12 21 12 21z" />
    </svg>
  );
}

export function CommentIcon() {
  return (
    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
      <path d="M21 11.5a8.4 8.4 0 0 1-8.5 8.3c-1.6 0-3.1-.4-4.4-1.1L3 20l1.4-4.3A8 8 0 0 1 3 11.5 8.4 8.4 0 0 1 11.5 3.2 8.4 8.4 0 0 1 21 11.5z" />
    </svg>
  );
}

export function ShareIcon() {
  return (
    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
      <path d="M4 12v7a1 1 0 0 0 1 1h14a1 1 0 0 0 1-1v-7M16 6l-4-4-4 4M12 2v13" />
    </svg>
  );
}

export function PostCard({ post, onDeleted }) {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [myReaction, setMyReaction] = useState(post.myReaction);
  const [reactions, setReactions] = useState(post.reactions);
  const [total, setTotal] = useState(post.likeCount);
  const [comments, setComments] = useState([]);
  const [showAll, setShowAll] = useState(false);
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [sharing, setSharing] = useState(false);
  const [shareText, setShareText] = useState("");
  const [shareMsg, setShareMsg] = useState("");
  const [shareErr, setShareErr] = useState("");
  const [previewComments, setPreviewComments] = useState(post.commentCount > 2 ? 2 : post.commentCount);
  const pickerRef = useRef(null);
  const menuRef = useRef(null);

  useEffect(() => {
    function onClick(e) {
      if (pickerRef.current && !pickerRef.current.contains(e.target)) setPickerOpen(false);
      if (menuRef.current && !menuRef.current.contains(e.target)) setMenuOpen(false);
    }
    document.addEventListener("mousedown", onClick);
    return () => document.removeEventListener("mousedown", onClick);
  }, []);

  async function react(type) {
    setPickerOpen(false);
    const was = myReaction;
    if (was === type) {
      setMyReaction(null);
      setTotal((n) => n - 1);
      setReactions((r) => ({ ...r, [type]: Math.max(0, (r[type] || 0) - 1) }));
      try {
        await api.del(`/api/posts/${post.id}/like`);
      } catch {
        setMyReaction(was);
        setTotal((n) => n + 1);
        setReactions((r) => ({ ...r, [type]: (r[type] || 0) + 1 }));
      }
      return;
    }
    setMyReaction(type);
    setTotal((n) => n + (was ? 0 : 1));
    setReactions((r) => ({
      ...r,
      [type]: (r[type] || 0) + 1,
      [was]: was ? Math.max(0, (r[was] || 0) - 1) : r[was],
    }));
    try {
      await api.post(`/api/posts/${post.id}/like`, { type });
    } catch {
      setMyReaction(was);
      setTotal((n) => n - (was ? 0 : 1));
      setReactions((r) => ({
        ...r,
        [type]: Math.max(0, (r[type] || 0) - 1),
        [was]: was ? (r[was] || 0) + 1 : r[was],
      }));
    }
  }

  async function loadComments() {
    if (comments.length) return;
    const d = await api.get(`/api/posts/${post.id}/comments`);
    setComments(d.comments);
  }

  async function addComment(e) {
    e.preventDefault();
    if (!text.trim() || busy) return;
    setBusy(true);
    try {
      const d = await api.post(`/api/posts/${post.id}/comments`, { body: text.trim() });
      setComments((c) => [...c, d.comment]);
      setText("");
      setShowAll(true);
      post.commentCount += 1;
    } finally {
      setBusy(false);
    }
  }

  async function deletePost() {
    if (!confirm("Delete this post?")) return;
    await api.del(`/api/posts/${post.id}`);
    onDeleted?.(post.id);
  }

  async function reportPost() {
    if (!confirm("Report this post?")) return;
    await api.post(`/api/posts/${post.id}/report`, { reason: "reported by user" });
    alert("Reported. Thanks for keeping the group safe!");
  }

  const postLink = () => `${location.origin}/p/${post.id}`;

  async function copyLink() {
    try {
      await navigator.clipboard.writeText(postLink());
    } catch {
      const ta = document.createElement("textarea");
      ta.value = postLink();
      document.body.appendChild(ta);
      ta.select();
      document.execCommand("copy");
      ta.remove();
    }
    setShareMsg("Link copied! 🔗");
    setTimeout(() => setShareMsg(""), 2500);
  }

  async function shareWithFriends() {
    if (navigator.share) {
      try {
        await navigator.share({
          title: `${post.author.name}'s post on Your One`,
          text: post.caption || "Check out this post on Your One",
          url: postLink(),
        });
        setShareMsg("Sent! ✅");
        setTimeout(() => setShareMsg(""), 2500);
        return;
      } catch (e) {
        if (e.name === "AbortError") return; // user closed the share sheet
      }
    }
    await copyLink();
  }

  async function submitShare() {
    setBusy(true);
    setShareErr("");
    try {
      const d = await api.post(`/api/posts/${post.id}/share`, { comment: shareText.trim() });
      onDeleted?.(d.post); // prepend the share to the feed
      setSharing(false);
      setShareText("");
      setShareMsg("Shared to your feed! ✅");
      setTimeout(() => setShareMsg(""), 2500);
    } catch (e) {
      setShareErr(e.message || "Couldn't share — try again.");
    } finally {
      setBusy(false);
    }
  }

  const isMine = user?.id === post.author.id;
  const visible = showAll ? comments : comments.slice(0, previewComments);
  const summary = reactionSummary(reactions, total);

  return (
    <article className="post">
      <div className="post-head">
        <Link to={`/u/${encodeURIComponent(post.author.name)}`}>
          <Avatar src={post.author.avatar} username={post.author.name} size={34} online={isOnline(post.author.lastSeen)} />
        </Link>
        <div style={{ minWidth: 0 }}>
          <Link to={`/u/${encodeURIComponent(post.author.name)}`} className="ph-name">{post.author.name}</Link>
          <div className="ph-user">@{post.author.name}</div>
        </div>
        <span className="ph-time">{timeAgo(post.createdAt)}</span>
        <div style={{ position: "relative" }} ref={menuRef}>
          <button className="ph-del" title="More" onClick={() => setMenuOpen((o) => !o)}>⋯</button>
          {menuOpen && (
            <div className="dropdown menu-drop" style={{ width: 180 }}>
              {isMine ? (
                <button onClick={deletePost}>🗑 Delete post</button>
              ) : (
                <button onClick={reportPost}>🚩 Report post</button>
              )}
            </div>
          )}
        </div>
      </div>

      {post.origin && (
        <div className="share-banner" onClick={() => navigate(`/p/${post.origin.id}`)}>
          <div className="sb-text">
            shared <b>{post.origin.author.name}</b>'s post
            {post.origin.caption && <div className="sb-cap">{post.origin.caption}</div>}
          </div>
          {post.origin.image && <img src={post.origin.image} alt="" />}
        </div>
      )}

      {post.image && (
        <img
          className="post-img"
          src={post.image}
          alt={post.caption || "post"}
          onClick={() => navigate(`/p/${post.id}`)}
          style={{ cursor: "pointer" }}
        />
      )}
      {post.video && (
        <video
          className="post-video"
          src={post.video}
          controls
          playsInline
          preload="metadata"
          poster={post.image || undefined}
        />
      )}

      <div className="post-body">
        <div className="post-actions">
          <div style={{ position: "relative" }} ref={pickerRef}>
            <button
              className={`action-btn ${myReaction ? "liked" : ""}`}
              onClick={() => setPickerOpen((o) => !o)}
              aria-label="React"
            >
              <HeartIcon filled={!!myReaction} />
            </button>
            {pickerOpen && (
              <div className="reaction-picker">
                {Object.entries(REACTION_EMOJI).map(([t, e]) => (
                  <button
                    key={t}
                    className={`rp-emoji ${myReaction === t ? "active" : ""}`}
                    onClick={() => react(t)}
                    title={t}
                  >
                    {e}
                  </button>
                ))}
              </div>
            )}
          </div>
          <button className="action-btn" onClick={() => { loadComments(); navigate(`/p/${post.id}`); }} aria-label="Comment">
            <CommentIcon />
          </button>
          <button className="action-btn" onClick={() => setSharing(true)} aria-label="Share">
            <ShareIcon />
          </button>
        </div>

        {summary && (
          <div className="post-reactions" onClick={() => navigate(`/p/${post.id}`)}>
            <span className="pr-emoji">{summary}</span>
            <span className="pr-total">{total} {plural(total, "reaction")}</span>
            {myReaction && <span className="pr-mine">You: {REACTION_EMOJI[myReaction]}</span>}
          </div>
        )}

        {post.caption && (
          <div className="post-caption">
            <Link to={`/u/${encodeURIComponent(post.author.name)}`} className="pc-name">{post.author.name}</Link>
            <RichText text={post.caption} />
          </div>
        )}

        {post.commentCount > 0 && (
          <div className="post-comments" onClick={() => { loadComments(); navigate(`/p/${post.id}`); }}>
            View all {plural(post.commentCount, "comment")}
          </div>
        )}

        {comments.length > 0 && visible.length > 0 && (
          <div>
            {!showAll && previewComments < comments.length && (
              <div className="post-comments" onClick={() => setShowAll(true)}>
                View all {plural(comments.length, "comment")}
              </div>
            )}
            {visible.map((c) => (
              <div className="post-comment-item" key={c.id}>
                <Link to={`/u/${encodeURIComponent(c.author.name)}`}><b>{c.author.name}</b></Link>
                <RichText text={c.body} />
              </div>
            ))}
          </div>
        )}

        <div className="post-time">{formatDate(post.createdAt)}</div>
      </div>

      <form className="comment-box" onSubmit={addComment}>
        <input
          placeholder="Add a comment…"
          value={text}
          onChange={(e) => setText(e.target.value)}
        />
        <button type="submit" disabled={!text.trim() || busy}>Send</button>
      </form>

      {sharing && (
        <div className="modal-backdrop" onClick={() => setSharing(false)}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <div className="modal-head">
              <span>Share post</span>
              <button className="modal-close" onClick={() => setSharing(false)}>✕</button>
            </div>
            <div className="modal-body">
              <div className="share-preview">
                {post.image && <img src={post.image} alt="" />}
                <div>
                  <b>{post.author.name}</b>
                  <div>{post.caption}</div>
                </div>
              </div>
              <div className="share-actions">
                <button className="btn share-act" onClick={shareWithFriends} disabled={busy}>
                  📲 Share with friends
                </button>
                <button className="btn ghost share-act" onClick={copyLink} disabled={busy}>
                  🔗 Copy link
                </button>
              </div>
              <div className="share-note">Or repost it to your feed:</div>
              <textarea
                className="textarea-input"
                placeholder="Say something about it… (optional)"
                value={shareText}
                maxLength={500}
                onChange={(e) => setShareText(e.target.value)}
              />
              <button className="btn block" disabled={busy} onClick={submitShare}>
                {busy ? "Sharing…" : "Repost to my feed"}
              </button>
              {shareMsg && <div className="share-msg">{shareMsg}</div>}
              {shareErr && <div className="share-err">{shareErr}</div>}
            </div>
          </div>
        </div>
      )}
    </article>
  );
}
