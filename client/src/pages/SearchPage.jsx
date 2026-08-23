import { useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { api } from "../api.js";
import { Avatar } from "../components/Avatar.jsx";
import { IconEmptySearch, IconNoResults } from "../components/Icons.jsx";
import { isOnline } from "../utils.js";

export function SearchPage() {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState([]);
  const [searched, setSearched] = useState(false);
  const [loading, setLoading] = useState(false);
  const [following, setFollowing] = useState(new Set());
  const inputRef = useRef(null);

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  useEffect(() => {
    if (!query.trim()) {
      setResults([]);
      setSearched(false);
      return;
    }
    setLoading(true);
    const t = setTimeout(async () => {
      try {
        const d = await api.get(`/api/search?q=${encodeURIComponent(query.trim())}`);
        setResults(d.users);
        setSearched(true);
      } catch {
        setResults([]);
        setSearched(true);
      }
      setLoading(false);
    }, 200);
    return () => clearTimeout(t);
  }, [query]);

  async function follow(u) {
    try {
      await api.post(`/api/users/${u.id}/follow`);
      setFollowing((f) => new Set(f).add(u.id));
    } catch {
      /* need name first */
    }
  }

  return (
    <div className="page">
      <div className="search-page-box">
        <div className="search-input-wrap">
          <svg className="search-input-icon" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="11" cy="11" r="8"/><path d="M21 21l-4.35-4.35"/></svg>
          <input
            ref={inputRef}
            className="text-input search-input-field"
            placeholder="Search people…"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
          {query && (
            <button className="search-clear" onClick={() => setQuery("")}>✕</button>
          )}
        </div>
      </div>

      {loading && (
        <div style={{ textAlign: "center", padding: 32 }}>
          <div className="spin" />
        </div>
      )}

      {!query.trim() ? (
        <div className="empty">
          <IconEmptySearch size={48} />
          Find your friends by name.
        </div>
      ) : !loading && results.length === 0 && searched ? (
        <div className="empty">
          <IconNoResults size={48} />
          No one found for "{query.trim()}".
          <div style={{ marginTop: 8, fontSize: 13 }}>Try a different name or spelling.</div>
        </div>
      ) : (
        <div className="search-list">
          {results.map((u) => (
            <div key={u.id} className="search-row">
              <Link to={`/u/${encodeURIComponent(u.name)}`}>
                <Avatar src={u.avatar} username={u.name} size={46} ring={false} online={isOnline(u.lastSeen)} />
              </Link>
              <div className="search-row-info">
                <Link to={`/u/${encodeURIComponent(u.name)}`} className="sr-name">{u.name}</Link>
                {isOnline(u.lastSeen) && <span className="search-online-badge"><svg width="8" height="8" viewBox="0 0 8 8" style={{marginRight:4,verticalAlign:1}}><circle cx="4" cy="4" r="4" fill="#22c55e"/></svg>Online</span>}
              </div>
              {following.has(u.id) ? (
                <button className="btn small ghost" disabled>Following ✓</button>
              ) : (
                <button className="btn small" onClick={() => follow(u)}>Follow</button>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
