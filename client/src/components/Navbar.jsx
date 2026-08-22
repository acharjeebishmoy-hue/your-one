import { useEffect, useRef, useState } from "react";
import { Link, NavLink } from "react-router-dom";
import { api } from "../api.js";
import { useAuth } from "../auth.jsx";
import { Avatar } from "./Avatar.jsx";
import { NotificationsBell } from "./NotificationsBell.jsx";

function SearchIcon() {
  return (
    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
      <circle cx="11" cy="11" r="7" />
      <path d="m20 20-3.5-3.5" />
    </svg>
  );
}

export function Navbar({ onEditName }) {
  const { user } = useAuth();
  const [query, setQuery] = useState("");
  const [results, setResults] = useState([]);
  const [searched, setSearched] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const searchRef = useRef(null);

  useEffect(() => {
    if (!query.trim()) {
      setResults([]);
      setSearched(false);
      return;
    }
    const t = setTimeout(async () => {
      try {
        const d = await api.get(`/api/search?q=${encodeURIComponent(query.trim())}`);
        setResults(d.users);
      } catch {
        setResults([]);
      }
      setSearched(true);
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
        <Link to="/" className="logo"><img src="/logo.svg" alt="Your One" style={{ height: 28, width: 28, borderRadius: 6 }} />Your One</Link>

        <div className="nav-search" ref={searchRef}>
          <input
            placeholder="Search people…"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
          {searched && results.length === 0 && query.trim() && (
            <div className="search-results" style={{ padding: 14, color: "var(--muted)", fontSize: 14 }}>
              No one found for “{query.trim()}”
            </div>
          )}
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
          <NavLink to="/search" className="icon-btn mobile-search-btn" aria-label="Search">
            <SearchIcon />
          </NavLink>
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
