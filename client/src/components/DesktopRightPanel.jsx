import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { api } from "../api.js";
import { useAuth } from "../auth.jsx";
import { Avatar } from "./Avatar.jsx";
import { isOnline, plural } from "../utils.js";

export function DesktopRightPanel() {
  const { user } = useAuth();
  const [suggestions, setSuggestions] = useState([]);
  const [active, setActive] = useState([]);
  const [following, setFollowing] = useState(new Set());

  useEffect(() => {
    if (!user?.name) return;
    api.get("/api/suggestions").then((d) => setSuggestions(d.users || [])).catch(() => {});
    api.get("/api/online").then((d) => setActive((d.users || []).filter((u) => u.id !== user.id))).catch(() => {});
  }, [user?.name]);

  async function follow(u) {
    try {
      await api.post(`/api/users/${u.id}/follow`);
      setFollowing((f) => new Set(f).add(u.id));
    } catch {
      /* need name first */
    }
  }

  if (!user?.name) return null;

  return (
    <div className="side-right">
      {suggestions.length > 0 && (
        <div className="side-card">
          <div className="side-card-title">People you may know</div>
          {suggestions.slice(0, 5).map((u) => (
            <div key={u.id} className="side-person">
              <Link to={`/u/${encodeURIComponent(u.name)}`}>
                <Avatar src={u.avatar} username={u.name} size={36} ring={false} />
              </Link>
              <div className="side-person-info">
                <Link to={`/u/${encodeURIComponent(u.name)}`} className="side-person-name">{u.name}</Link>
              </div>
              {following.has(u.id) ? (
                <button className="btn small ghost" disabled>✓</button>
              ) : (
                <button className="btn small" onClick={() => follow(u)}>Follow</button>
              )}
            </div>
          ))}
          <Link to="/explore" className="side-card-link">See all</Link>
        </div>
      )}

      {active.length > 0 && (
        <div className="side-card">
          <div className="side-card-title">🟢 Active now · {active.length}</div>
          {active.slice(0, 8).map((u) => (
            <Link key={u.id} to={`/u/${encodeURIComponent(u.name)}`} className="side-person">
              <div style={{ position: "relative" }}>
                <Avatar src={u.avatar} username={u.name} size={32} ring={false} />
                <span className="online-dot" />
              </div>
              <div className="side-person-info">
                <span className="side-person-name">{u.name}</span>
              </div>
            </Link>
          ))}
        </div>
      )}

      <div className="side-card side-card-footer">
        <div className="side-footer-text">Your One · Made with ❤️</div>
      </div>
    </div>
  );
}
