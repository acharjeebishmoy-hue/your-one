import { Link, NavLink } from "react-router-dom";
import { useAuth } from "../auth.jsx";

function HomeIcon() {
  return (
    <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
      <path d="M3 10.5 12 3l9 7.5V20a1 1 0 0 1-1 1h-5v-6h-6v6H4a1 1 0 0 1-1-1z" />
    </svg>
  );
}

function SearchIcon() {
  return (
    <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
      <circle cx="11" cy="11" r="7" />
      <path d="m20 20-3.5-3.5" />
    </svg>
  );
}

function PlusIcon() {
  return (
    <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
      <path d="M12 5v14M5 12h14" />
    </svg>
  );
}

export function BottomNav({ onCompose }) {
  const { user } = useAuth();
  const profileTo = user?.name ? `/u/${encodeURIComponent(user.name)}` : "/";

  return (
    <nav className="bottom-nav" aria-label="Main">
      <NavLink to="/" className="bn-item" aria-label="Home" end>
        <HomeIcon />
        <span className="bn-label">Home</span>
      </NavLink>
      <NavLink to="/search" className="bn-item" aria-label="Search">
        <SearchIcon />
        <span className="bn-label">Search</span>
      </NavLink>
      <button className="bn-item bn-create" onClick={onCompose} aria-label="Create post">
        <PlusIcon />
        <span className="bn-label">Create</span>
      </button>
      <NavLink to={profileTo} className="bn-item" aria-label="Profile">
        <span className="bn-avatar">
          <img src={user?.avatar} alt={user?.name || "you"} />
        </span>
        <span className="bn-label">Profile</span>
      </NavLink>
    </nav>
  );
}
