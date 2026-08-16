import { Link } from "react-router-dom";

// Mentions/hashtags — must match the server's extraction patterns.
const TOKEN_RE = /(@[A-Za-z0-9]+(?=[^A-Za-z0-9]|$))|(#[\w]+)/g;

export function richParts(text) {
  const out = [];
  let last = 0;
  for (const m of String(text || "").matchAll(TOKEN_RE)) {
    if (m.index > last) out.push({ text: text.slice(last, m.index) });
    if (m[1]) out.push({ mention: m[1].slice(1) });
    else out.push({ hashtag: m[2] });
    last = m.index + m[0].length;
  }
  if (last < (text || "").length) out.push({ text: text.slice(last) });
  return out;
}

export function RichText({ text }) {
  return (
    <>
      {richParts(text).map((p, i) =>
        p.mention ? (
          <Link key={i} to={`/u/${encodeURIComponent(p.mention)}`} className="rich-link">@{p.mention}</Link>
        ) : p.hashtag ? (
          <Link key={i} to={`/hashtag/${encodeURIComponent(p.hashtag)}`} className="rich-link">{p.hashtag}</Link>
        ) : (
          <span key={i}>{p.text}</span>
        )
      )}
    </>
  );
}
