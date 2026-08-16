import { useEffect, useState } from "react";
import { NavLink, Link } from "react-router-dom";
import { api } from "../api.js";
import { useAuth } from "../auth.jsx";
import { Avatar } from "./Avatar.jsx";

function Icon({ d }) {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round">
      <path d={d} />
    </svg>
  );
}

export function DesktopLeft({ onCompose }) {
  const { user } = useAuth();
  const profileTo = user?.name ? `/u/${encodeURIComponent(user.name)}` : "/";
  return (
    <aside className="side-left" aria-label="Menu">
      <NavLink to="/" end className="side-link">
        <Icon d="M3 10.5 12 3l9 7.5V20a1 1 0 0 1-1 1h-5v-6h-6v6H4a1 1 0 0 1-1-1z" />Home
      </NavLink>
      <NavLink to="/explore" className="side-link">
        <Icon d="M12 12m-9 0a9 9 0 1 0 18 0a9 9 0 1 0-18 0M15.5 8.5l-2 5-5 2 2-5z" />Explore
      </NavLink>
      <NavLink to="/events" className="side-link">
        <Icon d="M8 2v4M16 2v4M3 10h18M5 4h14a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2z" />Events
      </NavLink>
      <NavLink to="/search" className="side-link">
        <Icon d="M21 21l-4.35-4.35M11 19a8 8 0 1 1 8-8 8 8 0 0 1-8 8z" />Search
      </NavLink>
      <NavLink to={profileTo} className="side-link">
        <Icon d="M12 12a5 5 0 1 0-5-5 5 5 0 0 0 5 5zM4 21a8 8 0 0 1 16 0" />Profile
      </NavLink>
      <button className="side-link side-create" onClick={onCompose}>
        <Icon d="M12 5v14M5 12h14" />Create post
      </button>
    </aside>
  );
}

export function DesktopRight() {
  const [suggestions, setSuggestions] = useState([]);
  const [online, setOnline] = useState([]);
  const [following, setFollowing] = useState(new Set());

  useEffect(() => {
    api.get("/api/suggestions").then((d) => setSuggestions(d.users)).catch(() => {});
    const loadOnline = () => api.get("/api/online").then((d) => setOnline(d.users)).catch(() => {});
    loadOnline();
    const t = setInterval(loadOnline, 30000);
    return () => clearInterval(t);
  }, []);

  async function follow(u) {
    await api.post(`/api/users/${u.id}/follow`);
    setFollowing((f) => new Set(f).add(u.id));
    setSuggestions((s) => s.filter((x) => x.id !== u.id));
  }

  return (
    <aside className="side-right" aria-label="Suggestions">
      {suggestions.length > 0 && (
        <div className="side-card">
          <div className="side-head">👋 People you may know</div>
          {suggestions.slice(0, 5).map((u) => (
            <div key={u.id} className="side-row">
              <Link to={`/u/${encodeURIComponent(u.name)}`}>
                <Avatar src={u.avatar} username={u.name} size={36} ring={false} />
              </Link>
              <div className="side-row-name">
                <Link to={`/u/${encodeURIComponent(u.name)}`}>{u.name}</Link>
              </div>
              {following.has(u.id) ? (
                <button className="btn small ghost">✓</button>
              ) : (
                <button className="btn small" onClick={() => follow(u)}>Follow</button>
              )}
            </div>
          ))}
        </div>
      )}

      {online.length > 0 && (
        <div className="side-card">
          <div className="side-head">🟢 Active now</div>
          {online.map((u) => (
            <div key={u.id} className="side-row">
              <Link to={`/u/${encodeURIComponent(u.name)}`}>
                <Avatar src={u.avatar} username={u.name} size={36} ring={false} online />
              </Link>
              <div className="side-row-name">
                <Link to={`/u/${encodeURIComponent(u.name)}`}>{u.name}</Link>
              </div>
            </div>
          ))}
        </div>
      )}
    </aside>
  );
}
