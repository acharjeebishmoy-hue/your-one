export function Avatar({ src, username, size = 40, ring = true, className = "", online = false }) {
  return (
    <div className={`avatar-wrap ${ring ? "" : "plain"} ${className}`} style={{ "--sz": `${size}px` }}>
      <span className="ring" />
      <img src={src} alt={username} loading="lazy" />
      {online && <span className="online-dot" title="Online now" />}
    </div>
  );
}
