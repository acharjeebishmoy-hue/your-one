import { useCallback, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { api } from "../api.js";
import { useAuth } from "../auth.jsx";
import { formatEventDate, isOnline } from "../utils.js";
import { Avatar } from "../components/Avatar.jsx";
import { IconEmptyEvent } from "../components/Icons.jsx";
import { SafeConfirm } from "../components/SafeConfirm.jsx";

export function Events() {
  const { user } = useAuth();
  const [events, setEvents] = useState(null);
  const [creating, setCreating] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(null);

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

  async function del() {
    if (!confirmDelete) return;
    await api.del(`/api/events/${confirmDelete.id}`);
    setEvents((es) => es.filter((x) => x.id !== confirmDelete.id));
    setConfirmDelete(null);
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
          <IconEmptyEvent size={48} />
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
                <div className="ev-meta"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{verticalAlign:-2,marginRight:4}}><rect x="3" y="4" width="18" height="18" rx="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg>{formatEventDate(e.startsAt)}</div>
                {e.location && <div className="ev-meta"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{verticalAlign:-2,marginRight:4}}><path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"/><circle cx="12" cy="10" r="3"/></svg>{e.location}</div>}
                {e.description && <div className="ev-desc">{e.description}</div>}
                <div className="ev-host">
                  <Link to={`/u/${encodeURIComponent(e.host.name)}`}>
                    <Avatar src={e.host.avatar} username={e.host.name} size={22} ring={false} online={isOnline(e.host.lastSeen)} />
                  </Link>
                  <span>Hosted by {e.host.name}</span>
                </div>
                <div className="ev-counts">
                  {e.going > 0 && <span><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{verticalAlign:-2,marginRight:4}}><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/></svg>{e.going} going</span>}
                  {e.interested > 0 && <span><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{verticalAlign:-2,marginRight:4}}><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>{e.interested} interested</span>}
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
                    <button className="btn small danger" onClick={() => setConfirmDelete(e)}><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{verticalAlign:-2,marginRight:4}}><path d="M3 6h18"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg>Delete</button>
                  )}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {creating && <CreateEvent onClose={() => setCreating(false)} onCreated={() => { setCreating(false); load(); }} />}

      {confirmDelete && (
        <SafeConfirm
          icon="trash"
          title={`Delete "${confirmDelete.title}"?`}
          message="This event will be permanently removed."
          confirmText="Delete"
          danger
          onConfirm={del}
          onCancel={() => setConfirmDelete(null)}
        />
      )}
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
