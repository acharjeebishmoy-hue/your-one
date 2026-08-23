import { useCallback, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { api } from "../api.js";
import { useAuth } from "../auth.jsx";
import { formatEventDate, isOnline } from "../utils.js";
import { Avatar } from "../components/Avatar.jsx";

export function Events() {
  const { user } = useAuth();
  const [events, setEvents] = useState(null);
  const [creating, setCreating] = useState(false);

  const load = useCallback(async () => {
    try {
      const d = await api.get("/api/events");
      setEvents(d.events);
    } catch {
      setEvents([]);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  async function rsvp(e, status) {
    const d = await api.post(`/api/events/${e.id}/rsvp`, { status });
    setEvents((es) => es.map((x) => (x.id === e.id ? d.event : x)));
  }

  async function del(e) {
    if (!confirm(`Delete "${e.title}"?`)) return;
    await api.del(`/api/events/${e.id}`);
    setEvents((es) => es.filter((x) => x.id !== e.id));
  }

  return (
    <div className="page">
      <div className="tabs">
        <span className="tab active">Events</span>
      </div>
      {user?.name && (
        <div style={{ textAlign: "right", marginBottom: 16 }}>
          <button className="btn small" onClick={() => setCreating(true)}>
            ＋ Create event
          </button>
        </div>
      )}

      {!events ? (
        <div className="spin" />
      ) : events.length === 0 ? (
        <div className="empty">
          <div className="big">📅</div>
          No events yet. Plan movie night, game night, anything!
        </div>
      ) : (
        <div className="event-list">
          {events.map((e) => (
            <div key={e.id} className="event-card">
              <div className="event-date">
                <div className="ed-day">{new Date(e.startsAt).getDate()}</div>
                <div className="ed-month">{new Date(e.startsAt).toLocaleString("en", { month: "short" })}</div>
              </div>
              <div className="event-info">
                <div className="ev-title">{e.title}</div>
                <div className="ev-meta">📅 {formatEventDate(e.startsAt)}</div>
                {e.location && <div className="ev-meta">📍 {e.location}</div>}
                {e.description && <div className="ev-desc">{e.description}</div>}
                <div className="ev-host">
                  <Link to={`/u/${encodeURIComponent(e.host.name)}`}>
                    <Avatar src={e.host.avatar} username={e.host.name} size={22} ring={false} online={isOnline(e.host.lastSeen)} />
                  </Link>
                  <span>Hosted by {e.host.name}</span>
                </div>
                <div className="ev-counts">
                  {e.going > 0 && <span>✅ {e.going} going</span>}
                  {e.interested > 0 && <span>👀 {e.interested} interested</span>}
                </div>
                <div className="ev-actions">
                  <button
                    className={`btn small ${e.myStatus === "going" ? "ghost" : ""}`}
                    onClick={() => rsvp(e, "going")}
                  >
                    {e.myStatus === "going" ? "Going ✓" : "Going"}
                  </button>
                  <button
                    className={`btn small ghost ${e.myStatus === "interested" ? "active-ghost" : ""}`}
                    onClick={() => rsvp(e, "interested")}
                  >
                    {e.myStatus === "interested" ? "Interested ✓" : "Interested"}
                  </button>
                  {e.myStatus && (
                    <button className="btn small ghost" onClick={() => rsvp(e, "not")}>Not going</button>
                  )}
                  {user?.id === e.host.id && (
                    <button className="btn small danger" onClick={() => del(e)}>Delete</button>
                  )}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {creating && <CreateEvent onClose={() => setCreating(false)} onCreated={() => { setCreating(false); load(); }} />}
    </div>
  );
}

function CreateEvent({ onClose, onCreated }) {
  const [title, setTitle] = useState("");
  const [startsAt, setStartsAt] = useState("");
  const [location, setLocation] = useState("");
  const [description, setDescription] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function submit() {
    setBusy(true);
    setError("");
    try {
      await api.post("/api/events", { title, startsAt, location, description });
      onCreated();
    } catch (err) {
      setError(err.message);
      setBusy(false);
    }
  }

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <div className="modal-head">
          <span>Create event</span>
          <button className="modal-close" onClick={onClose}>✕</button>
        </div>
        <div className="modal-body">
          {error && <div className="error-box">{error}</div>}
          <div className="field">
            <label>Title</label>
            <input value={title} maxLength={120} onChange={(e) => setTitle(e.target.value)} placeholder="Movie night" />
          </div>
          <div className="field">
            <label>When</label>
            <input type="datetime-local" value={startsAt} onChange={(e) => setStartsAt(e.target.value)} />
          </div>
          <div className="field">
            <label>Where</label>
            <input value={location} maxLength={120} onChange={(e) => setLocation(e.target.value)} placeholder="My place" />
          </div>
          <div className="field">
            <label>Details</label>
            <textarea className="textarea-input" value={description} maxLength={1000} onChange={(e) => setDescription(e.target.value)} placeholder="Bring snacks!" />
          </div>
          <button className="btn block" disabled={busy || !title.trim() || !startsAt} onClick={submit}>
            {busy ? "Creating…" : "Create event"}
          </button>
        </div>
      </div>
    </div>
  );
}
