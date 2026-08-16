import { useEffect, useRef, useState } from "react";
import { Link, NavLink, useNavigate } from "react-router-dom";
import { api } from "../api.js";
import { useAuth } from "../auth.jsx";
import { Avatar } from "./Avatar.jsx";
import { NotificationsBell } from "./NotificationsBell.jsx";

function HomeIcon() {
  return (
    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
      <path d="M3 10.5 12 3l9 7.5V20a1 1 0 0 1-1 1h-5v-6h-6v6H4a1 1 0 0 1-1-1z" />
    </svg>
  );
}

function CompassIcon() {
  return (
    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
      <circle cx="12" cy="12" r="9" />
      <path d="m15.5 8.5-2 5-5 2 2-5z" />
    </svg>
  );
}

function CalendarIcon() {
  return (
    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
      <rect x="3" y="5" width="18" height="16" rx="2" />
      <path d="M8 3v4M16 3v4M3 10h18" />
    </svg>
  );
}

function PlusIcon() {
  return (
    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
      <path d="M12 5v14M5 12h14" />
    </svg>
  );
}

export function Navbar({ onCompose, onEditName }) {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [query, setQuery] = useState("");
  const [results, setResults] = useState([]);
  const [menuOpen, setMenuOpen] = useState(false);
  const searchRef = useRef(null);

  useEffect(() => {
    if (!query.trim()) return setResults([]);
    const t = setTimeout(async () => {
      try {
        const d = await api.get(`/api/search?q=${encodeURIComponent(query.trim())}`);
        setResults(d.users);
      } catch {
        setResults([]);
      }
    }, 200);
    return () => clearTimeout(t);
  }, [query]);

  useEffect(() => {
    function onClick(e) {
      if (searchRef.current && !searchRef.current.contains(e.target)) setResults([]);
    }
    document.addEventListener("mousedown", onClick);
    return () => document.removeEventListener("mousedown", onClick);
  }, []);

  return (
    <header className="nav">
      <div className="nav-inner">
        <Link to="/" className="logo"><span className="logo-dot" />Your One</Link>

        <div className="nav-search" ref={searchRef}>
          <input
            placeholder="Search people…"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
          {results.length > 0 && (
            <div className="search-results">
              {results.map((u) => (
                <Link key={u.id} to={`/u/${encodeURIComponent(u.name)}`} onClick={() => { setQuery(""); setResults([]); }}>
                  <Avatar src={u.avatar} username={u.name} size={34} ring={false} />
                  <div>
                    <div className="sr-name">{u.name}</div>
                  </div>
                </Link>
              ))}
            </div>
          )}
        </div>

        <div className="nav-actions">
          <NavLink to="/" className="icon-btn" aria-label="Home">
            <HomeIcon />
          </NavLink>
          <NavLink to="/explore" className="icon-btn" aria-label="Explore">
            <CompassIcon />
          </NavLink>
          <NavLink to="/events" className="icon-btn" aria-label="Events">
            <CalendarIcon />
          </NavLink>
          <button className="icon-btn" onClick={onCompose} aria-label="Create post" title="Create post">
            <PlusIcon />
          </button>
          <NotificationsBell />

          <div style={{ position: "relative" }}>
            <button
              className="icon-btn"
              onClick={() => setMenuOpen((o) => !o)}
              aria-label="Account"
              style={{ padding: 2 }}
            >
              <span className="nav-avatar">
                <img src={user?.avatar} alt={user?.name || "you"} />
              </span>
            </button>
            {menuOpen && (
              <div className="dropdown menu-drop">
                <div className="menu-name">{user?.name || "Anonymous"}</div>
                {user?.name && (
                  <Link to={`/u/${encodeURIComponent(user.name)}`} onClick={() => setMenuOpen(false)}>
                    Your profile
                  </Link>
                )}
                <button onClick={() => { setMenuOpen(false); onEditName(); }}>
                  {user?.name ? "Change name" : "Pick a name"}
                </button>
              </div>
            )}
          </div>
        </div>
      </div>
    </header>
  );
}
