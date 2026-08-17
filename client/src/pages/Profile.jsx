import { useEffect, useRef, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { api } from "../api.js";
import { useAuth } from "../auth.jsx";
import { Avatar } from "../components/Avatar.jsx";
import { plural, isOnline } from "../utils.js";

export function Profile() {
  const { name } = useParams();
  const navigate = useNavigate();
  const { user, updateUser } = useAuth();
  const [data, setData] = useState(null);
  const [posts, setPosts] = useState(null);
  const [editing, setEditing] = useState(false);
  const [showList, setShowList] = useState(null);
  const [listUsers, setListUsers] = useState([]);
  const fileRef = useRef(null);

  async function load() {
    const d = await api.get(`/api/users/${encodeURIComponent(name)}`);
    const p = await api.get(`/api/users/${d.user.id}/posts`);
    setData(d);
    setPosts(p.posts);
  }

  useEffect(() => {
    setData(null);
    setPosts(null);
    load();
  }, [name]);

  if (!data || !posts) return <div className="page"><div className="spin" /></div>;

  const { user: profile, stats, isFollowing, isMe, isBlocked } = data;

  async function block() {
    if (isBlocked) {
      await api.del(`/api/users/${profile.id}/block`);
    } else {
      if (!confirm(`Block ${profile.name}? You won't see their posts and they can't interact with you.`)) return;
      await api.post(`/api/users/${profile.id}/block`);
      if (isFollowing) {
        setData((d) => ({ ...d, isFollowing: false, stats: { ...d.stats, followers: d.stats.followers - 1 } }));
      }
    }
    setData((d) => ({ ...d, isBlocked: !d.isBlocked }));
  }

  async function toggleFollow() {
    if (isFollowing) await api.del(`/api/users/${profile.id}/follow`);
    else await api.post(`/api/users/${profile.id}/follow`);
    setData((d) => ({
      ...d,
      isFollowing: !d.isFollowing,
      stats: { ...d.stats, followers: d.stats.followers + (d.isFollowing ? -1 : 1) },
    }));
  }

  async function openList(kind) {
    const d = await api.get(`/api/users/${profile.id}/${kind}`);
    setListUsers(d.users);
    setShowList(kind);
  }

  async function pickAvatar(e) {
    const f = e.target.files?.[0];
    if (!f) return;
    const fd = new FormData();
    fd.append("avatar", f);
    const d = await api.post("/api/users/me/avatar", fd);
    updateUser(d.user);
    setData((prev) => ({ ...prev, user: { ...prev.user, avatar: d.user.avatar } }));
  }

  return (
    <div className="page">
      <div className="profile-head">
        <button
          style={{ background: "none", border: "none", padding: 0, borderRadius: "50%" }}
          onClick={isMe ? () => fileRef.current?.click() : undefined}
          title={isMe ? "Change profile picture" : undefined}
        >
          <Avatar src={profile.avatar} username={profile.name} size={130} online={isOnline(profile.lastSeen)} />
        </button>
        <input ref={fileRef} type="file" accept="image/*" hidden onChange={pickAvatar} />

        <div className="profile-info">
          <div className="profile-top">
            <h1>{profile.name}</h1>
            {isMe ? (
              <button className="btn ghost small" onClick={() => setEditing(true)}>Edit profile</button>
            ) : isBlocked ? (
              <button className="btn small danger" onClick={block}>Unblock</button>
            ) : (
              <>
                <button className={`btn small ${isFollowing ? "ghost" : ""}`} onClick={toggleFollow}>
                  {isFollowing ? "Following ✓" : "Follow"}
                </button>
                <button className="btn small ghost" onClick={() => navigate(`/messages?to=${profile.id}`)}>
                  Message
                </button>
                <button className="btn small ghost danger-text" onClick={block}>Block</button>
              </>
            )}
          </div>

          <div className="profile-stats">
            <span className="stat" onClick={() => openList("followers")} title="Followers">
              <b>{stats.followers}</b> followers
            </span>
            <span className="stat" onClick={() => openList("following")} title="Following">
              <b>{stats.following}</b> following
            </span>
            <span><b>{stats.posts}</b> {plural(stats.posts, "post")}</span>
          </div>

          <div className="profile-bio">
            <div>{profile.bio || "No bio yet."}</div>
            {profile.birthday && <div className="ev-meta">🎂 {profile.birthday}</div>}
          </div>
        </div>
      </div>

      <hr className="sep" />
      {posts.length === 0 ? (
        <div className="empty">
          <div className="big">📸</div>
          {isMe ? "No posts yet — share something!" : "No posts yet."}
        </div>
      ) : (
        <div className="profile-grid">
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

      {editing && (
        <EditProfile
          profile={profile}
          onClose={() => setEditing(false)}
          onSaved={(next) => {
            setData((d) => ({ ...d, user: { ...d.user, ...next } }));
            setEditing(false);
          }}
        />
      )}

      {showList && (
        <div className="modal-backdrop" onClick={() => setShowList(null)}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <div className="modal-head">
              <span>{showList === "followers" ? "Followers" : "Following"}</span>
              <button className="modal-close" onClick={() => setShowList(null)}>✕</button>
            </div>
            <div style={{ maxHeight: 320, overflowY: "auto" }}>
              {listUsers.length === 0 && <div className="empty" style={{ padding: 24 }}>Nobody here yet.</div>}
              {listUsers.map((u) => (
                <LinkRow key={u.id} u={u} onClick={() => setShowList(null)} />
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function LinkRow({ u, onClick }) {
  const navigate = useNavigate();
  return (
    <div
      className="search-results"
      style={{ position: "static", boxShadow: "none", border: "none" }}
      onClick={() => { onClick(); navigate(`/u/${encodeURIComponent(u.name)}`); }}
    >
      <a style={{ cursor: "pointer" }}>
        <Avatar src={u.avatar} username={u.name} size={40} ring={false} />
        <div>
          <div className="sr-name">{u.name}</div>
        </div>
      </a>
    </div>
  );
}

function EditProfile({ profile, onClose, onSaved }) {
  const [bio, setBio] = useState(profile.bio || "");
  const [birthday, setBirthday] = useState(profile.birthday || "");
  const [busy, setBusy] = useState(false);

  async function save() {
    setBusy(true);
    try {
      const d = await api.patch("/api/users/me", { bio, birthday });
      onSaved(d.user);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <div className="modal-head">
          <span>Edit profile</span>
          <button className="modal-close" onClick={onClose}>✕</button>
        </div>
        <div className="modal-body">
          <div className="field">
            <label>Bio</label>
            <textarea className="textarea-input" value={bio} onChange={(e) => setBio(e.target.value)} maxLength={200} />
          </div>
          <div className="field">
            <label>Birthday <span className="hint">(so friends can wish you 🎂)</span></label>
            <input type="date" value={birthday} onChange={(e) => setBirthday(e.target.value)} />
          </div>
          <button className="btn block" disabled={busy} onClick={save}>
            {busy ? "Saving…" : "Save"}
          </button>
        </div>
      </div>
    </div>
  );
}
