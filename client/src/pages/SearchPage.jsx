import { useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { api } from "../api.js";
import { Avatar } from "../components/Avatar.jsx";

export function SearchPage() {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState([]);
  const [searched, setSearched] = useState(false);
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
    const t = setTimeout(async () => {
      try {
        const d = await api.get(`/api/search?q=${encodeURIComponent(query.trim())}`);
        setResults(d.users);
        setSearched(true);
      } catch {
        setResults([]);
        setSearched(true);
      }
    }, 150);
    return () => clearTimeout(t);
  }, [query]);

  return (
    <div className="page">
      <div className="search-page-box">
        <input
          ref={inputRef}
          className="text-input"
          placeholder="Search people…"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
      </div>

      {!query.trim() ? (
        <div className="empty">
          <div className="big">🔍</div>
          Find your friends by name.
        </div>
      ) : results.length === 0 && searched ? (
        <div className="empty">
          <div className="big">🤷</div>
          No one found for “{query.trim()}”.
        </div>
      ) : (
        <div className="search-list">
          {results.map((u) => (
            <Link key={u.id} to={`/u/${encodeURIComponent(u.name)}`} className="search-row">
              <Avatar src={u.avatar} username={u.name} size={46} ring={false} />
              <div>
                <div className="sr-name">{u.name}</div>
              </div>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
