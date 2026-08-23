import { NavLink, Link } from "react-router-dom";
import { useAuth } from "../auth.jsx";
import { NotificationsBell } from "./NotificationsBell.jsx";
import { MessagesBadge } from "./MessageBadge.jsx";

function Icon({ d }) {
  return (
    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round">
      <path d={d} />
    </svg>
  );
}

const ICONS = {
  home: "M3 10.5 12 3l9 7.5V20a1 1 0 0 1-1 1h-5v-6h-6v6H4a1 1 0 0 1-1-1z",
  explore: "M12 12m-9 0a9 9 0 1 0 18 0a9 9 0 1 0-18 0M15.5 8.5l-2 5-5 2 2-5z",
  events: "M8 2v4M16 2v4M3 10h18M5 4h14a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2z",
  search: "M21 21l-4.35-4.35M11 19a8 8 0 1 1 8-8 8 8 0 0 1-8 8z",
  create: "M12 5v14M5 12h14",
  messages: "M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8v.5z",
};

export function DesktopRail({ onCompose, onEditName }) {
  const { user } = useAuth();
  const profileTo = user?.name ? `/u/${encodeURIComponent(user.name)}` : "/";

  return (
    <nav className="side-rail" aria-label="Menu">
      <Link to="/" className="rail-logo" title="Your One">
        <img src="/logo.png" alt="Your One" className="rail-logo-img" />
      </Link>

      <NavLink to="/" end className="rail-link" title="Home">
        <Icon d={ICONS.home} />
        <span>Home</span>
      </NavLink>
      <NavLink to="/explore" className="rail-link" title="Explore">
        <Icon d={ICONS.explore} />
        <span>Explore</span>
      </NavLink>
      <NavLink to="/events" className="rail-link" title="Events">
        <Icon d={ICONS.events} />
        <span>Events</span>
      </NavLink>
      <NavLink to="/search" className="rail-link" title="Search">
        <Icon d={ICONS.search} />
        <span>Search</span>
      </NavLink>

      <div className="rail-bell">
        <NotificationsBell />
      </div>
      <NavLink to="/messages" className="rail-link" title="Messages">
        <span className="rail-icon-wrap">
          <Icon d={ICONS.messages} />
          <MessagesBadge />
        </span>
        <span>Messages</span>
      </NavLink>

      <button className="rail-link rail-create" onClick={onCompose} title="Create post">
        <Icon d={ICONS.create} />
        <span>Create</span>
      </button>

      <div className="rail-spacer" />

      <NavLink to={profileTo} className="rail-link" title="Profile">
        <span className="rail-avatar">
          <img src={user?.avatar} alt={user?.name || "you"} />
        </span>
        <span>Profile</span>
      </NavLink>
      <button className="rail-link rail-more" onClick={onEditName} title="Change name">
        <span style={{ fontSize: 22, lineHeight: 1 }}>⋯</span>
        <span>More</span>
      </button>
    </nav>
  );
}

