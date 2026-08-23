import "dotenv/config";
import express from "express";
import multer from "multer";
import crypto from "node:crypto";
import path from "node:path";
import fs from "node:fs";
import { fileURLToPath } from "node:url";
import { createClient } from "@supabase/supabase-js";
import webPush from "web-push";
import { db, isSupabase, initDb, publicUser, postRow, postRows, POST_SELECT, BLOCK_FILTER, BLOCKED_BY_FILTER } from "./db.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const UPLOAD_DIR = path.join(__dirname, "..", "uploads");
fs.mkdirSync(UPLOAD_DIR, { recursive: true });

const app = express();
const PORT = process.env.PORT || 3001;

// Supabase Storage (only used when credentials are present)
const supabase =
  process.env.SUPABASE_URL && process.env.SUPABASE_SERVICE_ROLE_KEY
    ? createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY)
    : null;

app.use(express.json({ limit: "8mb" })); // 8mb — voice messages are base64 audio
app.use("/uploads", express.static(UPLOAD_DIR, { maxAge: "30d" }));

// Express 4 doesn't catch async errors automatically — wrap every handler.
const wrap = (fn) => (req, res, next) => fn(req, res, next).catch(next);

// ---------- identity (no login: a device gets an optional picked name) ----------

async function deviceUser(req) {
  const id = String(req.headers["x-device-id"] || "");
  if (!id || id.length > 100) return null;
  let row = await db.prepare("SELECT * FROM users WHERE device_id = ?").get(id);
  if (!row) {
    await db.prepare("INSERT INTO users (device_id) VALUES (?) ON CONFLICT DO NOTHING").run(id);
    row = await db.prepare("SELECT * FROM users WHERE device_id = ?").get(id);
  }
  return row;
}

const requireNamed = async (req, res, next) => {
  req.user = await deviceUser(req);
  if (!req.user?.name) return res.status(401).json({ error: "Pick a name first" });
  next();
};

// Create a notification. Dedup: if the same actor already has one of this type
// (on the same post), replace it with a fresh one — so "X liked" doesn't stack
// every time they unlike + relike.
async function notify({ userId, actorId, type, postId = null, body = null }) {
  const key = postId ?? 0;
  await db
    .prepare(
      `DELETE FROM notifications
       WHERE user_id = ? AND actor_id = ? AND type = ? AND COALESCE(post_id, 0) = ?`
    )
    .run(userId, actorId, type, key);
  await db
    .prepare(
      `INSERT INTO notifications (user_id, actor_id, type, post_id, body) VALUES (?, ?, ?, NULLIF(?, 0), ?)`
    )
    .run(userId, actorId, type, key, body ?? null);
  // Fire a real push too (best-effort).
  const actor = await db.prepare("SELECT name FROM users WHERE id = ?").get(actorId);
  if (actor?.name) {
    const url = postId ? `/p/${postId}` : `/u/${encodeURIComponent(actor.name)}`;
    await sendPushToUser(userId, {
      title: actor.name,
      body: pushText(type, actor.name, body),
      url,
    });
  }
}

// ---------- real push notifications (Web Push) ----------

// VAPID keys are generated once and persisted in the DB so they survive redeploys.
// (Changing them would invalidate everyone's existing subscriptions.)
async function getVapidKeys() {
  const cfg = (k) => db.prepare("SELECT value FROM app_config WHERE key = ?").get(k);
  let pub = cfg("vapid_public")?.value;
  let priv = cfg("vapid_private")?.value;
  if (!pub || !priv) {
    const keys = webPush.generateVAPIDKeys();
    pub = keys.publicKey;
    priv = keys.privateKey;
    await db
      .prepare("INSERT INTO app_config (key, value) VALUES ('vapid_public', ?) ON CONFLICT (key) DO UPDATE SET value = excluded.value")
      .run(pub);
    await db
      .prepare("INSERT INTO app_config (key, value) VALUES ('vapid_private', ?) ON CONFLICT (key) DO UPDATE SET value = excluded.value")
      .run(priv);
  }
  webPush.setVapidDetails("mailto:yourone@app.local", pub, priv);
  return pub;
}

// Send a real push to every device the user has registered. Dead subscriptions
// (uninstalled apps) are cleaned up automatically.
async function sendPushToUser(userId, { title, body, url = "/" }) {
  try {
    await getVapidKeys();
    const subs = await db.prepare("SELECT * FROM push_subscriptions WHERE user_id = ?").all(userId);
    for (const s of subs) {
      try {
        await webPush.sendNotification(
          { endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } },
          JSON.stringify({ title, body, url, icon: "/logo.svg" })
        );
      } catch (err) {
        // 404/410 = subscription gone (uninstalled). 403 = the VAPID keys changed, so this
        // subscription can never receive pushes again — drop it and let the client re-enable.
        if (err.statusCode === 404 || err.statusCode === 410 || err.statusCode === 403) {
          await db.prepare("DELETE FROM push_subscriptions WHERE id = ?").run(s.id);
        }
      }
    }
  } catch {
    /* push is best-effort — never break the request it fires from */
  }
}

function pushText(type, actorName, body) {
  if (type === "join") return `${actorName} joined the group 🎉`;
  if (type === "follow") return `${actorName} started following you`;
  if (type === "like") return `${actorName} liked your post`;
  if (type === "mention") return `${actorName} mentioned you in a post`;
  if (type === "share") return `${actorName} shared your post`;
  if (type === "reply") return `${actorName} replied to your comment`;
  if (type === "event_rsvp") return `${actorName} ${body || "is going to your event"}`;
  if (type === "message") return body ? `${actorName}: ${body}` : `${actorName} messaged you`;
  return body ? `${actorName} commented: ${body}` : `${actorName} commented on your post`;
}

// Mention/hashtag patterns (shared with the client so rendering matches).
export const MENTION_RE = /@([A-Za-z0-9]+)(?=[^A-Za-z0-9]|$)/g;
export const HASHTAG_RE = /#([A-Za-z0-9_]+)/g;

function cutoffStr(msAgo) {
  const d = new Date(Date.now() - msAgo);
  return isSupabase ? d.toISOString() : d.toISOString().replace("T", " ").replace(/\.\d{3}Z$/, "");
}

async function isBlockedBy(userId, byUserId) {
  return !!(await db.prepare("SELECT 1 FROM blocks WHERE blocker_id = ? AND blocked_id = ?").get(byUserId, userId));
}

async function extractHashtags(postId, text) {
  if (!text) return;
  for (const m of String(text).matchAll(HASHTAG_RE)) {
    await db.prepare("INSERT INTO post_hashtags (post_id, tag) VALUES (?, ?) ON CONFLICT DO NOTHING").run(postId, m[1].toLowerCase());
  }
}

async function extractMentions(postId, text, actorId) {
  if (!text) return;
  const seen = new Set();
  for (const m of String(text).matchAll(MENTION_RE)) {
    const name = m[1].trim();
    if (!name || seen.has(name.toLowerCase())) continue;
    seen.add(name.toLowerCase());
    const u = await db.prepare("SELECT id FROM users WHERE LOWER(name) = LOWER(?)").get(name);
    if (u && u.id !== actorId) await notify({ userId: u.id, actorId, type: "mention", postId });
  }
}

async function todayBirthdays() {
  const now = new Date();
  const md = String(now.getMonth() + 1).padStart(2, "0") + "-" + String(now.getDate()).padStart(2, "0");
  const rows = await db.prepare("SELECT * FROM users WHERE name IS NOT NULL AND birthday IS NOT NULL").all();
  return rows.filter((u) => String(u.birthday).length >= 5 && String(u.birthday).slice(5) === md).map(publicUser);
}

function eventToJson(row) {
  return {
    id: row.id,
    title: row.title,
    description: row.description || "",
    location: row.location || "",
    startsAt: row.starts_at,
    createdAt: row.created_at,
    going: row.going ?? 0,
    interested: row.interested ?? 0,
    myStatus: row.my_status || null,
    host: {
      id: row.user_id,
      name: row.host_name,
      avatar: row.host_avatar || `/api/avatar/${row.host_name}`,
      lastSeen: row.host_last_seen || null,
    },
  };
}

async function eventJson(id, viewerId) {
  const row = await db
    .prepare(
      `SELECT e.*, u.name AS host_name, u.avatar AS host_avatar, u.last_seen AS host_last_seen,
         (SELECT COUNT(*) FROM event_rsvps r WHERE r.event_id = e.id AND r.status = 'going') AS going,
         (SELECT COUNT(*) FROM event_rsvps r WHERE r.event_id = e.id AND r.status = 'interested') AS interested,
         (SELECT r.status FROM event_rsvps r WHERE r.event_id = e.id AND r.user_id = @me) AS my_status
       FROM events e JOIN users u ON u.id = e.user_id WHERE e.id = @id`
    )
    .get({ id, me: viewerId });
  return eventToJson(row);
}

function avatarSvg(name) {
  let h = 0;
  for (const ch of String(name)) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  const hue = h % 360;
  const initials = String(name)
    .split(/[^a-zA-Z0-9]+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0].toUpperCase())
    .join("") || "?";
  return `<svg xmlns="http://www.w3.org/2000/svg" width="300" height="300">
    <defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0%" stop-color="hsl(${hue},70%,55%)"/>
      <stop offset="100%" stop-color="hsl(${(hue + 60) % 360},70%,40%)"/>
    </linearGradient></defs>
    <rect width="300" height="300" fill="url(#g)"/>
    <text x="150" y="168" font-family="Arial, sans-serif" font-size="120" font-weight="bold"
      fill="white" text-anchor="middle" dominant-baseline="middle">${initials}</text>
  </svg>`;
}

// ---------- file uploads (local disk or Supabase Storage) ----------

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 50 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    if (file.mimetype.startsWith("image/") || file.mimetype.startsWith("video/")) cb(null, true);
    else cb(new Error("Only image or video files are allowed"));
  },
});

async function ensureBucket() {
  if (!supabase) return;
  const { error } = await supabase.storage.createBucket("uploads", { public: true });
  if (error && error.message !== "Bucket already exists" && !String(error.message).includes("already exists")) {
    console.error("⚠️  Could not create Supabase storage bucket:", error.message);
  } else {
    console.log("📦 Supabase storage bucket ready");
  }
}

async function saveImage(buffer, originalName, contentType) {
  const ext = path.extname(originalName || "").toLowerCase().replace(/[^.a-z0-9]/g, "") || ".jpg";
  const filename = `${Date.now()}-${crypto.randomBytes(4).toString("hex")}${ext}`;
  if (supabase) {
    const { error } = await supabase.storage.from("uploads").upload(filename, buffer, { contentType });
    if (error) throw new Error("Upload failed: " + error.message);
    return `${process.env.SUPABASE_URL}/storage/v1/object/public/uploads/${filename}`;
  }
  fs.writeFileSync(path.join(UPLOAD_DIR, filename), buffer);
  return `/uploads/${filename}`;
}

async function deleteImage(url) {
  if (!url) return;
  if (supabase && url.includes("/storage/v1/object/public/uploads/")) {
    const name = url.split("/uploads/")[1];
    await supabase.storage.from("uploads").remove([name]).catch(() => {});
  } else if (url.startsWith("/uploads/")) {
    fs.unlink(path.join(UPLOAD_DIR, path.basename(url)), () => {});
  }
}

// ---------- avatar (generated) ----------

app.get("/api/avatar/:seed", (req, res) => {
  res.type("image/svg+xml").send(avatarSvg(req.params.seed));
});

// ---------- identity ----------

app.get("/api/identity", wrap(async (req, res) => {
  res.json({ user: publicUser(await deviceUser(req)) });
}));

app.post("/api/identity", wrap(async (req, res) => {
  const me = await deviceUser(req);
  const name = String(req.body?.name || "").trim();
  if (!/^[A-Za-z0-9 _-]{2,20}$/.test(name)) {
    return res.status(400).json({ error: "Name must be 2-20 characters: letters, numbers, spaces, _ or -." });
  }
  const hadName = !!me.name;
  try {
    await db.prepare("UPDATE users SET name = ? WHERE id = ?").run(name, me.id);
    if (!hadName) {
      // A new friend joined the group — let everyone with a name know 🎉
      const members = await db.prepare("SELECT id FROM users WHERE name IS NOT NULL AND id != ?").all(me.id);
      for (const m of members) await notify({ userId: m.id, actorId: me.id, type: "join" });
    }
    res.json({ user: publicUser(await db.prepare("SELECT * FROM users WHERE id = ?").get(me.id)) });
  } catch (e) {
    if (isSupabase ? e.code === "23505" : String(e.message).includes("UNIQUE")) {
      return res.status(409).json({ error: "That name is already taken." });
    }
    throw e;
  }
}));

// ---------- users ----------

app.get("/api/users/:name", wrap(async (req, res) => {
  const row = await db.prepare("SELECT * FROM users WHERE LOWER(name) = LOWER(?)").get(req.params.name);
  if (!row) return res.status(404).json({ error: "User not found" });
  const viewer = await deviceUser(req);
  const stats = await db
    .prepare(
      `SELECT
        (SELECT COUNT(*) FROM posts p WHERE p.user_id = u.id) AS posts,
        (SELECT COUNT(*) FROM follows f WHERE f.followee_id = u.id) AS followers,
        (SELECT COUNT(*) FROM follows f WHERE f.follower_id = u.id) AS following
       FROM users u WHERE u.id = @id`
    )
    .get({ id: row.id });
  const isFollowing = viewer
    ? !!(await db.prepare("SELECT 1 FROM follows WHERE follower_id = ? AND followee_id = ?").get(viewer.id, row.id))
    : false;
  const isBlocked = viewer
    ? !!(await db.prepare("SELECT 1 FROM blocks WHERE blocker_id = ? AND blocked_id = ?").get(viewer.id, row.id))
    : false;
  res.json({ user: publicUser(row), stats, isFollowing, isMe: viewer?.id === row.id, isBlocked });
}));

app.patch("/api/users/me", wrap(async (req, res) => {
  const me = await deviceUser(req);
  const { bio, birthday } = req.body || {};
  const birthdayVal = birthday != null && /^\d{4}-\d{2}-\d{2}$/.test(String(birthday)) ? String(birthday) : null;
  await db.prepare("UPDATE users SET bio = COALESCE(?, bio), birthday = COALESCE(?, birthday) WHERE id = ?").run(
    bio != null ? String(bio).trim().slice(0, 200) : null,
    birthdayVal,
    me.id
  );
  res.json({ user: publicUser(await db.prepare("SELECT * FROM users WHERE id = ?").get(me.id)) });
}));

app.post("/api/users/me/avatar", upload.single("avatar"), wrap(async (req, res) => {
  if (!req.file) return res.status(400).json({ error: "No image uploaded" });
  const me = await deviceUser(req);
  const old = (await db.prepare("SELECT avatar FROM users WHERE id = ?").get(me.id))?.avatar;
  const url = await saveImage(req.file.buffer, req.file.originalname, req.file.mimetype);
  await db.prepare("UPDATE users SET avatar = ? WHERE id = ?").run(url, me.id);
  await deleteImage(old);
  res.json({ user: publicUser(await db.prepare("SELECT * FROM users WHERE id = ?").get(me.id)) });
}));

app.post("/api/users/:id/follow", requireNamed, wrap(async (req, res) => {
  const followeeId = Number(req.params.id);
  if (followeeId === req.user.id) return res.status(400).json({ error: "You can't follow yourself" });
  if (await isBlockedBy(followeeId, req.user.id)) return res.status(403).json({ error: "Not allowed" });
  await db.prepare("INSERT INTO follows (follower_id, followee_id) VALUES (?, ?) ON CONFLICT DO NOTHING").run(req.user.id, followeeId);
  await notify({ userId: followeeId, actorId: req.user.id, type: "follow" });
  res.json({ isFollowing: true });
}));

app.delete("/api/users/:id/follow", requireNamed, wrap(async (req, res) => {
  await db.prepare("DELETE FROM follows WHERE follower_id = ? AND followee_id = ?").run(req.user.id, Number(req.params.id));
  res.json({ isFollowing: false });
}));

const FOLLOWER_BLOCK_FILTER = `
  AND u.id NOT IN (SELECT blocked_id FROM blocks WHERE blocker_id = @me)
  AND u.id NOT IN (SELECT blocker_id FROM blocks WHERE blocked_id = @me)`;

app.get("/api/users/:id/followers", wrap(async (req, res) => {
  const me = (await deviceUser(req)) || { id: 0 };
  const rows = await db
    .prepare(
      `SELECT u.* FROM follows f JOIN users u ON u.id = f.follower_id
       WHERE f.followee_id = @id${FOLLOWER_BLOCK_FILTER} ORDER BY f.created_at DESC LIMIT 100`
    )
    .all({ me: me.id, id: Number(req.params.id) });
  res.json({ users: rows.map(publicUser) });
}));

app.get("/api/users/:id/following", wrap(async (req, res) => {
  const me = (await deviceUser(req)) || { id: 0 };
  const rows = await db
    .prepare(
      `SELECT u.* FROM follows f JOIN users u ON u.id = f.followee_id
       WHERE f.follower_id = @id${FOLLOWER_BLOCK_FILTER} ORDER BY f.created_at DESC LIMIT 100`
    )
    .all({ me: me.id, id: Number(req.params.id) });
  res.json({ users: rows.map(publicUser) });
}));

app.get("/api/users/:id/posts", wrap(async (req, res) => {
  const viewer = await deviceUser(req);
  const vid = viewer?.id ?? 0;
  const rows = await postRows(
    db.prepare(
      `${POST_SELECT} WHERE p.user_id = @viewerId
         AND ${BLOCK_FILTER} AND ${BLOCKED_BY_FILTER}
       ORDER BY p.created_at DESC, p.id DESC`
    ),
    { viewer: vid, viewerId: Number(req.params.id) },
    viewer?.id
  );
  res.json({ posts: rows });
}));

app.get("/api/search", wrap(async (req, res) => {
  const q = String(req.query.q || "").trim();
  if (!q) return res.json({ users: [] });
  const me = await deviceUser(req);
  const rows = await db
    .prepare(
      `SELECT * FROM users WHERE LOWER(name) LIKE LOWER(?) AND name IS NOT NULL
         AND id NOT IN (SELECT blocked_id FROM blocks WHERE blocker_id = @me)
         AND id NOT IN (SELECT blocker_id FROM blocks WHERE blocked_id = @me)
       ORDER BY name LIMIT 12`
    )
    .all(`%${q}%`, { me: me?.id ?? 0 });
  res.json({ users: rows.map(publicUser) });
}));

// ---------- posts ----------

app.get("/api/feed", wrap(async (req, res) => {
  const viewer = await deviceUser(req);
  const vid = viewer?.id ?? 0;
  const rows = await postRows(
    db.prepare(
      `${POST_SELECT}
       WHERE (@viewer = 0 OR p.user_id = @viewer OR p.user_id IN (SELECT followee_id FROM follows WHERE follower_id = @viewer))
         AND ${BLOCK_FILTER} AND ${BLOCKED_BY_FILTER}
       ORDER BY p.created_at DESC, p.id DESC LIMIT 100`
    ),
    { viewer: vid },
    viewer?.id
  );
  res.json({ posts: rows, birthdays: await todayBirthdays() });
}));

app.get("/api/posts", wrap(async (req, res) => {
  const viewer = await deviceUser(req);
  const vid = viewer?.id ?? 0;
  const tag = String(req.query.hashtag || "").trim();
  const where = tag
    ? `WHERE p.id IN (SELECT post_id FROM post_hashtags WHERE LOWER(tag) = LOWER(@tag)) AND ${BLOCK_FILTER} AND ${BLOCKED_BY_FILTER}`
    : `WHERE ${BLOCK_FILTER} AND ${BLOCKED_BY_FILTER}`;
  const params = tag ? { viewer: vid, tag } : { viewer: vid };
  const rows = await postRows(
    db.prepare(`${POST_SELECT} ${where} ORDER BY p.created_at DESC, p.id DESC LIMIT 200`),
    params,
    viewer?.id
  );
  res.json({ posts: rows });
}));

app.get("/api/posts/:id", wrap(async (req, res) => {
  const viewer = await deviceUser(req);
  const vid = viewer?.id ?? 0;
  const row = await postRow(
    db.prepare(`${POST_SELECT} WHERE p.id = @id AND ${BLOCK_FILTER} AND ${BLOCKED_BY_FILTER}`),
    { viewer: vid, id: Number(req.params.id) },
    viewer?.id
  );
  if (!row) return res.status(404).json({ error: "Post not found" });
  const comments = (await db
    .prepare(
      `SELECT c.*, u.name, u.avatar
       FROM comments c JOIN users u ON u.id = c.user_id
       WHERE c.post_id = ? ORDER BY c.created_at ASC, c.id ASC LIMIT 200`
    )
    .all(row.id))    .map((c) => ({
    id: c.id,
    body: c.body,
    parentId: c.parent_id ?? null,
    createdAt: c.created_at,
    author: {
      id: c.user_id,
      name: c.name,
      avatar: c.avatar || `/api/avatar/${c.name || c.user_id}`,
    },
  }));
  res.json({ post: row, comments });
}));

app.post(
  "/api/posts",
  requireNamed,
  upload.fields([
    { name: "image", maxCount: 1 },
    { name: "video", maxCount: 1 },
  ]),
  wrap(async (req, res) => {
  const caption = String(req.body.caption || "").trim().slice(0, 2200);
  const imgFile = req.files?.image?.[0];
  const vidFile = req.files?.video?.[0];
  if (!imgFile && !vidFile && !caption) return res.status(400).json({ error: "Add a photo, video or some text." });
  const file = imgFile || vidFile;
  const media = file ? await saveImage(file.buffer, file.originalname, file.mimetype) : null;
  const info = await db
    .prepare(
      vidFile
        ? "INSERT INTO posts (user_id, caption, video) VALUES (?, ?, ?) RETURNING id"
        : "INSERT INTO posts (user_id, caption, image) VALUES (?, ?, ?) RETURNING id"
    )
    .run(req.user.id, caption, media);
  await extractHashtags(info.lastInsertRowid, caption);
  await extractMentions(info.lastInsertRowid, caption, req.user.id);
  const row = await postRow(
    db.prepare(`${POST_SELECT} WHERE p.id = @id`),
    { viewer: req.user.id, id: info.lastInsertRowid },
    req.user.id
  );
  res.status(201).json({ post: row });
}));

app.delete("/api/posts/:id", wrap(async (req, res) => {
  const me = await deviceUser(req);
  const post = await db.prepare("SELECT * FROM posts WHERE id = ?").get(Number(req.params.id));
  if (!post) return res.status(404).json({ error: "Post not found" });
  if (!me || post.user_id !== me.id) return res.status(403).json({ error: "Not your post" });
  await db.prepare("DELETE FROM posts WHERE id = ?").run(post.id);
  await deleteImage(post.image);
  await deleteImage(post.video); // videos were never being cleaned up — storage leak
  res.json({ ok: true });
}));

const REACTION_TYPES = ["like", "love", "haha", "wow", "sad", "angry"];

app.post("/api/posts/:id/like", requireNamed, wrap(async (req, res) => {
  const postId = Number(req.params.id);
  const post = await db.prepare("SELECT id, user_id FROM posts WHERE id = ?").get(postId);
  if (!post) return res.status(404).json({ error: "Post not found" });
  if (await isBlockedBy(post.user_id, req.user.id)) return res.status(403).json({ error: "Not allowed" });
  const type = REACTION_TYPES.includes(req.body?.type) ? req.body.type : "like";
  const existing = await db.prepare("SELECT type FROM likes WHERE user_id = ? AND post_id = ?").get(req.user.id, postId);
  await db
    .prepare(
      `INSERT INTO likes (user_id, post_id, type) VALUES (?, ?, ?)
       ON CONFLICT (user_id, post_id) DO UPDATE SET type = excluded.type`
    )
    .run(req.user.id, postId, type);
  if (!existing && post.user_id !== req.user.id) {
    await notify({ userId: post.user_id, actorId: req.user.id, type: "like", postId });
  }
  res.json({ reacted: true, type });
}));

app.delete("/api/posts/:id/like", requireNamed, wrap(async (req, res) => {
  await db.prepare("DELETE FROM likes WHERE user_id = ? AND post_id = ?").run(req.user.id, Number(req.params.id));
  res.json({ liked: false });
}));

// ---------- comments ----------

app.get("/api/posts/:id/comments", wrap(async (req, res) => {
  const viewer = await deviceUser(req);
  const vid = viewer?.id ?? 0;
  const post = await db
    .prepare(
      `SELECT p.id FROM posts p
       WHERE p.id = @id
         AND p.user_id NOT IN (SELECT blocked_id FROM blocks WHERE blocker_id = @vid)
         AND p.user_id NOT IN (SELECT blocker_id FROM blocks WHERE blocked_id = @vid)`
    )
    .get({ id: Number(req.params.id), vid });
  if (!post) return res.status(404).json({ error: "Post not found" });
  const comments = (await db
    .prepare(
      `SELECT c.*, u.name, u.avatar
       FROM comments c JOIN users u ON u.id = c.user_id
       WHERE c.post_id = ? ORDER BY c.created_at ASC, c.id ASC LIMIT 200`
    )
    .all(Number(req.params.id)))    .map((c) => ({
    id: c.id,
    body: c.body,
    parentId: c.parent_id ?? null,
    createdAt: c.created_at,
    author: {
      id: c.user_id,
      name: c.name,
      avatar: c.avatar || `/api/avatar/${c.name || c.user_id}`,
    },
  }));
  res.json({ comments });
}));

app.post("/api/posts/:id/comments", requireNamed, wrap(async (req, res) => {
  const body = String(req.body?.body || "").trim().slice(0, 500);
  if (!body) return res.status(400).json({ error: "Comment is empty" });
  const postId = Number(req.params.id);
  const post = await db.prepare("SELECT id, user_id FROM posts WHERE id = ?").get(postId);
  if (!post) return res.status(404).json({ error: "Post not found" });
  if (await isBlockedBy(post.user_id, req.user.id)) return res.status(403).json({ error: "Not allowed" });
  let parentId = Number(req.body?.parentId) || null;
  if (parentId) {
    const parent = await db.prepare("SELECT id, user_id FROM comments WHERE id = ? AND post_id = ?").get(parentId, postId);
    if (!parent) parentId = null;
    else if (parent.user_id !== req.user.id && parent.user_id !== post.user_id) {
      await notify({ userId: parent.user_id, actorId: req.user.id, type: "reply", postId, body });
    }
  }
  const info = await db
    .prepare("INSERT INTO comments (post_id, user_id, body, parent_id) VALUES (?, ?, ?, ?) RETURNING id")
    .run(postId, req.user.id, body, parentId);
  if (post.user_id !== req.user.id) {
    await notify({ userId: post.user_id, actorId: req.user.id, type: "comment", postId, body });
  }
  await extractMentions(postId, body, req.user.id);
  const created = await db.prepare("SELECT created_at FROM comments WHERE id = ?").get(info.lastInsertRowid);
  res.status(201).json({
    comment: {
      id: info.lastInsertRowid,
      body,
      createdAt: created.created_at,
      author: {
        id: req.user.id,
        name: req.user.name,
        avatar: req.user.avatar || `/api/avatar/${req.user.name}`,
      },
    },
  });
}));

// ---------- notifications ----------

app.get("/api/notifications", wrap(async (req, res) => {
  const me = await deviceUser(req);
  if (!me) return res.json({ notifications: [] });
  const rows = await db
    .prepare(
      `SELECT n.*, u.name, u.avatar, p.image AS post_image
       FROM notifications n
       JOIN users u ON u.id = n.actor_id
       LEFT JOIN posts p ON p.id = n.post_id
       WHERE n.user_id = ?
       ORDER BY n.created_at DESC, n.id DESC LIMIT 50`
    )
    .all(me.id);
  res.json({
    notifications: rows.map((n) => ({
      id: n.id,
      type: n.type,
      read: !!n.read,
      createdAt: n.created_at,
      postId: n.post_id,
      postImage: n.post_image,
      body: n.body,
      actor: {
        id: n.actor_id,
        name: n.name,
        avatar: n.avatar || `/api/avatar/${n.name || n.actor_id}`,
      },
    })),
  });
}));

app.post("/api/notifications/read", wrap(async (req, res) => {
  const me = await deviceUser(req);
  if (!me) return res.json({ ok: true });
  await db.prepare("UPDATE notifications SET read = 1 WHERE user_id = ?").run(me.id);
  res.json({ ok: true });
}));

// ---------- real push notifications ----------

app.get("/api/push/vapid-key", wrap(async (req, res) => {
  res.json({ publicKey: await getVapidKeys() });
}));

// Does the server still know this browser's exact subscription? (False = broken/stale —
// the client shows "Turn on" so the user re-enables and gets a fresh, working one.)
app.post("/api/push/status", wrap(async (req, res) => {
  const me = await deviceUser(req);
  const { endpoint } = req.body || {};
  if (!me || !endpoint) return res.json({ on: false });
  const r = await db
    .prepare("SELECT 1 AS x FROM push_subscriptions WHERE user_id = ? AND endpoint = ?")
    .get(me.id, String(endpoint).slice(0, 1000));
  res.json({ on: !!r });
}));

// Fire a test push to the caller right now — used right after enabling, so the
// user SEES a real notification pop up instantly as proof it works.
app.post("/api/push/test", wrap(async (req, res) => {
  const me = await namedUser(req, res);
  if (!me) return;
  await sendPushToUser(me.id, {
    title: "Your One",
    body: "✅ You're all set! You'll get notified even when the app is closed.",
    url: "/",
  });
  res.json({ ok: true });
}));

app.post("/api/push/subscribe", wrap(async (req, res) => {
  const me = await namedUser(req, res);
  if (!me) return;
  const { endpoint, p256dh, auth } = req.body || {};
  if (!endpoint || !p256dh || !auth) return res.status(400).json({ error: "Missing subscription" });
  await db
    .prepare(
      `INSERT INTO push_subscriptions (user_id, endpoint, p256dh, auth) VALUES (?, ?, ?, ?)
       ON CONFLICT (endpoint) DO UPDATE SET user_id = excluded.user_id, p256dh = excluded.p256dh, auth = excluded.auth`
    )
    .run(me.id, String(endpoint).slice(0, 1000), String(p256dh).slice(0, 500), String(auth).slice(0, 500));
  res.json({ ok: true });
}));

app.post("/api/push/unsubscribe", wrap(async (req, res) => {
  const me = await deviceUser(req);
  const { endpoint } = req.body || {};
  if (endpoint && me) {
    await db.prepare("DELETE FROM push_subscriptions WHERE endpoint = ? AND user_id = ?").run(String(endpoint).slice(0, 1000), me.id);
  }
  res.json({ ok: true });
}));

// ---------- messages (private chat) ----------

async function namedUser(req, res) {
  const u = await deviceUser(req);
  if (!u?.name) {
    res.status(401).json({ error: "Pick a name first" });
    return null;
  }
  return u;
}

// Conversation list: everyone I have a thread with + last message + unread count
app.get("/api/conversations", wrap(async (req, res) => {
  const me = await namedUser(req, res);
  if (!me) return;
  const rows = await db
    .prepare(
      `SELECT u.id, u.name, u.avatar, u.bio, u.last_seen,
         (SELECT m.kind FROM messages m
           WHERE (m.from_id = @me AND m.to_id = u.id) OR (m.from_id = u.id AND m.to_id = @me)
           ORDER BY m.created_at DESC, m.id DESC LIMIT 1) AS last_kind,
         (SELECT m.body FROM messages m
           WHERE (m.from_id = @me AND m.to_id = u.id) OR (m.from_id = u.id AND m.to_id = @me)
           ORDER BY m.created_at DESC, m.id DESC LIMIT 1) AS last_body,
         (SELECT m.created_at FROM messages m
           WHERE (m.from_id = @me AND m.to_id = u.id) OR (m.from_id = u.id AND m.to_id = @me)
           ORDER BY m.created_at DESC, m.id DESC LIMIT 1) AS last_at,
         (SELECT COUNT(*) FROM messages m WHERE m.from_id = u.id AND m.to_id = @me AND m.read = 0) AS unread
       FROM users u
       WHERE u.id != @me AND u.name IS NOT NULL
         AND EXISTS (SELECT 1 FROM messages m
           WHERE (m.from_id = @me AND m.to_id = u.id) OR (m.from_id = u.id AND m.to_id = @me))
       ORDER BY last_at DESC`
    )
    .all({ me: me.id });
  res.json({
    users: rows.map((r) => ({
      ...publicUser(r),
      lastKind: r.last_kind || "text",
      lastBody: r.last_body,
      lastAt: r.last_at,
      unread: Number(r.unread || 0),
    })),
  });
}));

// Unread count for the nav badge (must be registered BEFORE /api/messages/:userId)
app.get("/api/messages/unread", wrap(async (req, res) => {
  const me = await deviceUser(req);
  if (!me) return res.json({ count: 0 });
  const r = await db.prepare("SELECT COUNT(*) AS c FROM messages WHERE to_id = ? AND read = 0").get(me.id);
  res.json({ count: Number(r.c || 0) });
}));

// Message thread with one person (also marks their messages to me as read)
app.get("/api/messages/:userId", wrap(async (req, res) => {
  const me = await namedUser(req, res);
  if (!me) return;
  const otherId = Number(req.params.userId);
  if (!Number.isInteger(otherId)) return res.status(400).json({ error: "Bad user id" });
  const other = await db.prepare("SELECT * FROM users WHERE id = ? AND name IS NOT NULL").get(otherId);
  if (!other) return res.status(404).json({ error: "User not found" });
  await db.prepare("UPDATE messages SET read = 1 WHERE from_id = ? AND to_id = ? AND read = 0").run(otherId, me.id);
  const rows = await db
    .prepare(
      `SELECT m.id, m.from_id, m.to_id, m.body, m.kind, m.read, m.created_at, u.name AS from_name, u.avatar AS from_avatar
       FROM messages m JOIN users u ON u.id = m.from_id
       WHERE (m.from_id = @me AND m.to_id = @other) OR (m.from_id = @other AND m.to_id = @me)
       ORDER BY m.created_at ASC, m.id ASC`
    )
    .all({ me: me.id, other: otherId });
  res.json({
    user: publicUser(other),
    messages: rows.map((m) => ({
      id: m.id,
      fromId: m.from_id,
      toId: m.to_id,
      body: m.body,
      kind: m.kind || "text",
      read: !!m.read,
      createdAt: m.created_at,
      fromName: m.from_name,
      fromAvatar: m.from_avatar || `/api/avatar/${m.from_name || m.from_id}`,
    })),
  });
}));

// Send a message — kind: text | voice | sticker | image
app.post("/api/messages", wrap(async (req, res) => {
  const me = await namedUser(req, res);
  if (!me) return;
  const toId = Number(req.body?.toId);
  const kind = ["text", "voice", "sticker", "image"].includes(req.body?.kind) ? req.body.kind : "text";
  let body = String(req.body?.body || "").trim();
  // text/sticker are short; voice + images are base64 (much bigger)
  if (kind === "voice" || kind === "image") body = body.slice(0, 4_500_000);
  else body = body.slice(0, 2000);
  if (!toId || !body) return res.status(400).json({ error: "Message is empty" });
  if (kind === "voice" && !body.startsWith("data:audio/")) {
    return res.status(400).json({ error: "Invalid voice message" });
  }
  if (kind === "image" && !body.startsWith("data:image/")) {
    return res.status(400).json({ error: "Invalid image" });
  }
  if (kind === "sticker" && body.length > 64) {
    return res.status(400).json({ error: "Invalid sticker" });
  }
  if (toId === me.id) return res.status(400).json({ error: "You can't message yourself" });
  const other = await db.prepare("SELECT * FROM users WHERE id = ? AND name IS NOT NULL").get(toId);
  if (!other) return res.status(404).json({ error: "User not found" });
  const blocked = await db
    .prepare("SELECT 1 FROM blocks WHERE (blocker_id = ? AND blocked_id = ?) OR (blocker_id = ? AND blocked_id = ?)")
    .get(me.id, toId, toId, me.id);
  if (blocked) return res.status(403).json({ error: "You can't message this person" });
  const info = await db
    .prepare("INSERT INTO messages (from_id, to_id, body, kind) VALUES (?, ?, ?, ?) RETURNING id")
    .run(me.id, toId, body, kind);
  const preview =
    kind === "voice"
      ? "🎤 Voice message"
      : kind === "sticker"
        ? `${body} sticker`
        : kind === "image"
          ? "📷 Photo"
          : body.slice(0, 140);
  await db
    .prepare("INSERT INTO notifications (user_id, actor_id, type, post_id, body) VALUES (?, ?, 'message', NULL, ?)")
    .run(toId, me.id, preview);
  await sendPushToUser(toId, {
    title: me.name,
    body: pushText("message", me.name, preview),
    url: "/messages",
  });
  const row = await db
    .prepare(
      `SELECT m.id, m.from_id, m.to_id, m.body, m.kind, m.read, m.created_at, u.name AS from_name, u.avatar AS from_avatar
       FROM messages m JOIN users u ON u.id = m.from_id WHERE m.id = ?`
    )
    .get(info.lastInsertRowid);
  res.json({
    message: {
      id: row.id,
      fromId: row.from_id,
      toId: row.to_id,
      body: row.body,
      kind: row.kind || "text",
      read: !!row.read,
      createdAt: row.created_at,
      fromName: row.from_name,
      fromAvatar: row.from_avatar || `/api/avatar/${row.from_name || row.from_id}`,
    },
  });
}));

// Delete a single message (either participant can remove it from the thread)
app.delete("/api/messages/:id", wrap(async (req, res) => {
  const me = await namedUser(req, res);
  if (!me) return;
  const id = Number(req.params.id);
  const msg = await db.prepare("SELECT * FROM messages WHERE id = ?").get(id);
  if (!msg) return res.status(404).json({ error: "Message not found" });
  if (msg.from_id !== me.id && msg.to_id !== me.id) {
    return res.status(403).json({ error: "Not your message" });
  }
  await db.prepare("DELETE FROM messages WHERE id = ?").run(id);
  res.json({ ok: true });
}));

// Delete the whole chat with someone (removes every message between us)
app.delete("/api/conversations/:userId", wrap(async (req, res) => {
  const me = await namedUser(req, res);
  if (!me) return;
  const otherId = Number(req.params.userId);
  await db
    .prepare("DELETE FROM messages WHERE (from_id = ? AND to_id = ?) OR (from_id = ? AND to_id = ?)")
    .run(me.id, otherId, otherId, me.id);
  res.json({ ok: true });
}));

// ---------- shares ----------

app.post("/api/posts/:id/share", requireNamed, wrap(async (req, res) => {
  const postId = Number(req.params.id);
  const post = await db.prepare("SELECT id, user_id, origin_post_id FROM posts WHERE id = ?").get(postId);
  if (!post) return res.status(404).json({ error: "Post not found" });
  if (await isBlockedBy(post.user_id, req.user.id)) return res.status(403).json({ error: "Not allowed" });
  const comment = String(req.body?.comment || "").trim().slice(0, 500);
  const originId = post.origin_post_id ?? post.id;
  const info = await db
    .prepare("INSERT INTO posts (user_id, caption, origin_post_id) VALUES (?, ?, ?) RETURNING id")
    .run(req.user.id, comment, originId);
  await extractHashtags(info.lastInsertRowid, comment);
  await extractMentions(info.lastInsertRowid, comment, req.user.id);
  if (post.user_id !== req.user.id) {
    await notify({ userId: post.user_id, actorId: req.user.id, type: "share", postId: originId });
  }
  const row = await postRow(
    db.prepare(`${POST_SELECT} WHERE p.id = @id`),
    { viewer: req.user.id, id: info.lastInsertRowid },
    req.user.id
  );
  res.status(201).json({ post: row });
}));

app.post("/api/posts/:id/report", requireNamed, wrap(async (req, res) => {
  const postId = Number(req.params.id);
  const post = await db.prepare("SELECT id FROM posts WHERE id = ?").get(postId);
  if (!post) return res.status(404).json({ error: "Post not found" });
  const reason = String(req.body?.reason || "").trim().slice(0, 200);
  await db
    .prepare("INSERT INTO reports (user_id, post_id, reason) VALUES (?, ?, ?) ON CONFLICT DO NOTHING")
    .run(req.user.id, postId, reason);
  res.json({ ok: true });
}));

// ---------- block / suggestions / presence ----------

app.post("/api/users/:id/block", requireNamed, wrap(async (req, res) => {
  const blockedId = Number(req.params.id);
  if (blockedId === req.user.id) return res.status(400).json({ error: "You can't block yourself" });
  await db
    .prepare("INSERT INTO blocks (blocker_id, blocked_id) VALUES (?, ?) ON CONFLICT DO NOTHING")
    .run(req.user.id, blockedId);
  await db
    .prepare(
      `DELETE FROM follows WHERE (follower_id = ? AND followee_id = ?) OR (follower_id = ? AND followee_id = ?)`
    )
    .run(req.user.id, blockedId, blockedId, req.user.id);
  res.json({ blocked: true });
}));

app.delete("/api/users/:id/block", requireNamed, wrap(async (req, res) => {
  await db.prepare("DELETE FROM blocks WHERE blocker_id = ? AND blocked_id = ?").run(req.user.id, Number(req.params.id));
  res.json({ blocked: false });
}));

app.get("/api/suggestions", wrap(async (req, res) => {
  const me = (await deviceUser(req)) || { id: 0 };
  const base = `
    SELECT u.*,
      EXISTS(SELECT 1 FROM follows f WHERE f.follower_id = @me AND f.followee_id = u.id) AS is_following
    FROM users u
    WHERE name IS NOT NULL AND id != @me
  `;
  // preferred: people the viewer hasn't followed yet
  let rows = await db
    .prepare(
      `${base}
       AND u.id NOT IN (SELECT followee_id FROM follows WHERE follower_id = @me)
       AND u.id NOT IN (SELECT blocked_id FROM blocks WHERE blocker_id = @me)
       AND u.id NOT IN (SELECT blocker_id FROM blocks WHERE blocked_id = @me)
       ORDER BY (SELECT COUNT(*) FROM follows f WHERE f.followee_id = u.id) DESC
       LIMIT 9`
    )
    .all({ me: me.id });
  // followed everyone → still show the crew so the panel never looks empty
  if (rows.length === 0) {
    rows = await db
      .prepare(
        `${base}
         AND u.id NOT IN (SELECT blocked_id FROM blocks WHERE blocker_id = @me)
         AND u.id NOT IN (SELECT blocker_id FROM blocks WHERE blocked_id = @me)
         ORDER BY u.created_at ASC
         LIMIT 9`
      )
      .all({ me: me.id });
  }
  res.json({ users: rows.map((r) => ({ ...publicUser(r), following: !!r.is_following })) });
}));

app.post("/api/presence", wrap(async (req, res) => {
  const me = await deviceUser(req);
  if (!me) return res.json({ ok: true });
  await db.prepare("UPDATE users SET last_seen = ? WHERE id = ?").run(new Date().toISOString(), me.id);
  res.json({ ok: true });
}));

app.get("/api/online", wrap(async (req, res) => {
  const me = (await deviceUser(req)) || { id: 0 };
  const cutoff = cutoffStr(3 * 60 * 1000); // active in the last 3 minutes
  const rows = await db
    .prepare(
      `SELECT * FROM users
       WHERE name IS NOT NULL AND id != @me
         AND last_seen IS NOT NULL AND last_seen > @cutoff
         AND id NOT IN (SELECT blocked_id FROM blocks WHERE blocker_id = @me)
         AND id NOT IN (SELECT blocker_id FROM blocks WHERE blocked_id = @me)
       ORDER BY last_seen DESC LIMIT 12`
    )
    .all({ me: me.id, cutoff });
  res.json({ users: rows.map(publicUser) });
}));

// ---------- stories ----------

app.post("/api/stories", requireNamed, upload.single("image"), wrap(async (req, res) => {
  const caption = String(req.body.caption || "").trim().slice(0, 200);
  if (!req.file && !caption) return res.status(400).json({ error: "Add a photo or a caption" });
  const image = req.file ? await saveImage(req.file.buffer, req.file.originalname, req.file.mimetype) : "";
  const info = await db
    .prepare("INSERT INTO stories (user_id, image, caption) VALUES (?, ?, ?) RETURNING id")
    .run(req.user.id, image, caption);
  res.status(201).json({ story: { id: info.lastInsertRowid, image, caption, createdAt: new Date().toISOString() } });
}));

app.get("/api/stories", wrap(async (req, res) => {
  const me = await deviceUser(req);
  const cutoff = cutoffStr(24 * 3600 * 1000);
  const rows = await db
    .prepare(
      `SELECT s.*, u.name, u.avatar,
         (SELECT COUNT(*) FROM story_views sv WHERE sv.story_id = s.id AND sv.user_id = @me) AS viewed
       FROM stories s JOIN users u ON u.id = s.user_id
       WHERE s.created_at > ?
         AND s.user_id NOT IN (SELECT blocked_id FROM blocks WHERE blocker_id = @me)
         AND s.user_id NOT IN (SELECT blocker_id FROM blocks WHERE blocked_id = @me)
       ORDER BY s.created_at DESC`
    )
    .all(cutoff, { me: me?.id ?? 0 });
  res.json({
    stories: rows.map((s) => ({
      id: s.id,
      image: s.image,
      caption: s.caption,
      createdAt: s.created_at,
      viewedByMe: !!s.viewed,
      author: { id: s.user_id, name: s.name, avatar: s.avatar || `/api/avatar/${s.name}` },
    })),
  });
}));

app.post("/api/stories/:id/view", requireNamed, wrap(async (req, res) => {
  await db
    .prepare("INSERT INTO story_views (story_id, user_id) VALUES (?, ?) ON CONFLICT DO NOTHING")
    .run(Number(req.params.id), req.user.id);
  res.json({ ok: true });
}));

app.delete("/api/stories/:id", wrap(async (req, res) => {
  const me = await deviceUser(req);
  const s = await db.prepare("SELECT * FROM stories WHERE id = ?").get(Number(req.params.id));
  if (!s) return res.status(404).json({ error: "Story not found" });
  if (!me || s.user_id !== me.id) return res.status(403).json({ error: "Not your story" });
  await db.prepare("DELETE FROM stories WHERE id = ?").run(s.id);
  await deleteImage(s.image);
  res.json({ ok: true });
}));

// ---------- events ----------

app.post("/api/events", requireNamed, wrap(async (req, res) => {
  const title = String(req.body?.title || "").trim().slice(0, 120);
  const startsAt = String(req.body?.startsAt || "").trim();
  if (!title) return res.status(400).json({ error: "Give the event a title" });
  if (!startsAt || Number.isNaN(Date.parse(startsAt))) return res.status(400).json({ error: "Pick a date and time" });
  const desc = String(req.body?.description || "").trim().slice(0, 1000);
  const loc = String(req.body?.location || "").trim().slice(0, 120);
  const info = await db
    .prepare("INSERT INTO events (user_id, title, description, location, starts_at) VALUES (?, ?, ?, ?, ?) RETURNING id")
    .run(req.user.id, title, desc, loc, new Date(startsAt).toISOString());
  res.status(201).json({ event: await eventJson(info.lastInsertRowid, req.user.id) });
}));

app.get("/api/events", wrap(async (req, res) => {
  const me = await deviceUser(req);
  const rows = await db
    .prepare(
      `SELECT e.*, u.name AS host_name, u.avatar AS host_avatar, u.last_seen AS host_last_seen,
         (SELECT COUNT(*) FROM event_rsvps r WHERE r.event_id = e.id AND r.status = 'going') AS going,
         (SELECT COUNT(*) FROM event_rsvps r WHERE r.event_id = e.id AND r.status = 'interested') AS interested,
         (SELECT r.status FROM event_rsvps r WHERE r.event_id = e.id AND r.user_id = @me) AS my_status
       FROM events e JOIN users u ON u.id = e.user_id
       WHERE e.user_id NOT IN (SELECT blocked_id FROM blocks WHERE blocker_id = @me)
         AND e.user_id NOT IN (SELECT blocker_id FROM blocks WHERE blocked_id = @me)
       ORDER BY e.starts_at ASC LIMIT 100`
    )
    .all({ me: me?.id ?? 0 });
  res.json({ events: rows.map(eventToJson) });
}));

app.post("/api/events/:id/rsvp", requireNamed, wrap(async (req, res) => {
  const eventId = Number(req.params.id);
  const status = req.body?.status;
  if (!["going", "interested", "not"].includes(status)) return res.status(400).json({ error: "Bad status" });
  const ev = await db.prepare("SELECT id, user_id FROM events WHERE id = ?").get(eventId);
  if (!ev) return res.status(404).json({ error: "Event not found" });
  if (status === "not") {
    await db.prepare("DELETE FROM event_rsvps WHERE event_id = ? AND user_id = ?").run(eventId, req.user.id);
  } else {
    await db
      .prepare(
        `INSERT INTO event_rsvps (event_id, user_id, status) VALUES (?, ?, ?)
         ON CONFLICT (event_id, user_id) DO UPDATE SET status = excluded.status`
      )
      .run(eventId, req.user.id, status);
    if (ev.user_id !== req.user.id && status === "going") {
      await notify({ userId: ev.user_id, actorId: req.user.id, type: "event_rsvp", body: "is going to your event" });
    }
  }
  res.json({ event: await eventJson(eventId, req.user.id) });
}));

app.delete("/api/events/:id", wrap(async (req, res) => {
  const me = await deviceUser(req);
  const ev = await db.prepare("SELECT * FROM events WHERE id = ?").get(Number(req.params.id));
  if (!ev) return res.status(404).json({ error: "Event not found" });
  if (!me || ev.user_id !== me.id) return res.status(403).json({ error: "Not your event" });
  await db.prepare("DELETE FROM events WHERE id = ?").run(ev.id);
  res.json({ ok: true });
}));

// ---------- calls (WebRTC signaling) ----------

// Start a call
app.post("/api/calls/start", wrap(async (req, res) => {
  const user = await deviceUser(req);
  if (!user?.name) return res.status(400).json({ error: "Pick a name first" });
  const { calleeId, offer } = req.body;
  if (!calleeId || !offer) return res.status(400).json({ error: "Missing calleeId or offer" });
  // Check if callee exists
  const callee = await db.prepare("SELECT id, name FROM users WHERE id = ?").get(calleeId);
  if (!callee) return res.status(404).json({ error: "User not found" });
  // End any existing active calls for either party
  await db.prepare("UPDATE calls SET status = 'ended', ended_at = NOW() WHERE status IN ('ringing', 'active') AND (caller_id = ? OR callee_id = ? OR caller_id = ? OR callee_id = ?)").run(user.id, user.id, calleeId, calleeId);
  const result = await db.prepare("INSERT INTO calls (caller_id, callee_id, status, offer) VALUES (?, ?, 'ringing', ?)").run(user.id, calleeId, JSON.stringify(offer));
  res.json({ ok: true, callId: result.lastInsertRowid });
}));

// Answer a call
app.post("/api/calls/:id/answer", wrap(async (req, res) => {
  const user = await deviceUser(req);
  const { answer } = req.body;
  const call = await db.prepare("SELECT * FROM calls WHERE id = ?").get(req.params.id);
  if (!call) return res.status(404).json({ error: "Call not found" });
  if (call.callee_id !== user.id) return res.status(403).json({ error: "Not your call" });
  await db.prepare("UPDATE calls SET status = 'active', answer = ?, started_at = NOW() WHERE id = ?").run(JSON.stringify(answer), req.params.id);
  res.json({ ok: true });
}));

// Add ICE candidate
app.post("/api/calls/:id/candidate", wrap(async (req, res) => {
  const user = await deviceUser(req);
  const { candidate, candidates } = req.body;
  const call = await db.prepare("SELECT * FROM calls WHERE id = ?").get(req.params.id);
  if (!call) return res.status(404).json({ error: "Call not found" });
  if (call.caller_id !== user.id && call.callee_id !== user.id) return res.status(403).json({ error: "Not your call" });
  const existing = JSON.parse(call.candidates || '[]');
  if (candidates?.length) existing.push(...candidates);
  else if (candidate) existing.push(candidate);
  await db.prepare("UPDATE calls SET candidates = ? WHERE id = ?").run(JSON.stringify(existing), req.params.id);
  res.json({ ok: true });
}));

// End a call
app.post("/api/calls/:id/end", wrap(async (req, res) => {
  const user = await deviceUser(req);
  const call = await db.prepare("SELECT * FROM calls WHERE id = ?").get(req.params.id);
  if (!call) return res.status(404).json({ error: "Call not found" });
  if (call.caller_id !== user.id && call.callee_id !== user.id) return res.status(403).json({ error: "Not your call" });
  await db.prepare("UPDATE calls SET status = 'ended', ended_at = NOW() WHERE id = ?").run(req.params.id);
  res.json({ ok: true });
}));

// Poll for incoming/updated calls
app.get("/api/calls/poll", wrap(async (req, res) => {
  const user = await deviceUser(req);
  if (!user) return res.json({ call: null });
  // Find the most recent active/ringing call involving this user
  const call = await db.prepare("SELECT c.*, u1.name as caller_name, u1.avatar as caller_avatar, u2.name as callee_name, u2.avatar as callee_avatar FROM calls c JOIN users u1 ON c.caller_id = u1.id JOIN users u2 ON c.callee_id = u2.id WHERE (c.caller_id = ? OR c.callee_id = ?) AND c.status IN ('ringing', 'active') ORDER BY c.created_at DESC LIMIT 1").get(user.id, user.id);
  if (!call) return res.json({ call: null });
  res.json({
    call: {
      id: call.id,
      status: call.status,
      callerId: call.caller_id,
      callerName: call.caller_name,
      callerAvatar: call.caller_avatar,
      calleeId: call.callee_id,
      calleeName: call.callee_name,
      calleeAvatar: call.callee_avatar,
      offer: call.offer ? JSON.parse(call.offer) : null,
      answer: call.answer ? JSON.parse(call.answer) : null,
      candidates: JSON.parse(call.candidates || '[]'),
      isCaller: call.caller_id === user.id,
      startedAt: call.started_at,
    }
  });
}));

// ---------- serve built client (production) ----------

const DIST = path.join(__dirname, "..", "client", "dist");
if (fs.existsSync(DIST)) {
  // Prevent browsers from caching old favicons — force fresh fetch
  app.use((req, res, next) => {
    if (/\/favicon\.ico|\/logo|\/apple-touch|\.svg$/.test(req.path)) {
      res.set('Cache-Control', 'no-store, no-cache, must-revalidate');
      res.set('Pragma', 'no-cache');
    }
    next();
  });
  app.use(express.static(DIST));
  app.get(/^(?!\/api|\/uploads).*/, (req, res) => res.sendFile(path.join(DIST, "index.html")));
}

app.use((err, req, res, next) => {
  if (err?.message === "Only image or video files are allowed") return res.status(400).json({ error: err.message });
  if (err?.code === "LIMIT_FILE_SIZE") return res.status(400).json({ error: "Media must be under 50 MB" });
  console.error(err);
  res.status(500).json({ error: "Something went wrong" });
});

await initDb();
await ensureBucket();
app.listen(PORT, () => {
  console.log(`🌐 Social app server running at http://localhost:${PORT}`);
  console.log(isSupabase ? "☁️  Connected to Supabase (Postgres)" : "💾 Using local SQLite — set DATABASE_URL in .env to use Supabase");
});
