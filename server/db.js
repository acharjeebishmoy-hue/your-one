import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import "dotenv/config";
import Database from "better-sqlite3";
import pg from "pg";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DATA_DIR = path.join(__dirname, "..", "data");
fs.mkdirSync(DATA_DIR, { recursive: true });

// ---------- mode ----------

export const isSupabase = !!process.env.DATABASE_URL;

// Postgres returns BIGINT (ids, COUNT(*)) as strings by default — parse to numbers.
pg.types.setTypeParser(20, (v) => parseInt(v, 10));
pg.types.setTypeParser(1700, (v) => parseFloat(v));

// ---------- schema ----------

const SQLITE_SCHEMA = `
  CREATE TABLE IF NOT EXISTS users (
    id         INTEGER PRIMARY KEY AUTOINCREMENT,
    device_id  TEXT NOT NULL UNIQUE,
    name       TEXT UNIQUE COLLATE NOCASE,
    bio        TEXT DEFAULT '',
    avatar     TEXT,
    birthday   TEXT,
    last_seen  TEXT,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS posts (
    id             INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id        INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    caption        TEXT DEFAULT '',
    image          TEXT,
    video          TEXT,
    origin_post_id INTEGER REFERENCES posts(id) ON DELETE SET NULL,
    created_at     TEXT NOT NULL DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS likes (
    user_id    INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    post_id    INTEGER NOT NULL REFERENCES posts(id) ON DELETE CASCADE,
    type       TEXT NOT NULL DEFAULT 'like',
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    PRIMARY KEY (user_id, post_id)
  );

  CREATE TABLE IF NOT EXISTS comments (
    id         INTEGER PRIMARY KEY AUTOINCREMENT,
    post_id    INTEGER NOT NULL REFERENCES posts(id) ON DELETE CASCADE,
    user_id    INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    body       TEXT NOT NULL,
    parent_id  INTEGER REFERENCES comments(id) ON DELETE CASCADE,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS post_hashtags (
    post_id INTEGER NOT NULL REFERENCES posts(id) ON DELETE CASCADE,
    tag     TEXT NOT NULL,
    PRIMARY KEY (post_id, tag)
  );
  CREATE INDEX IF NOT EXISTS idx_hashtag_tag ON post_hashtags(tag);

  CREATE TABLE IF NOT EXISTS stories (
    id         INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id    INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    image      TEXT NOT NULL,
    caption    TEXT DEFAULT '',
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  );
  CREATE INDEX IF NOT EXISTS idx_stories_user ON stories(user_id, created_at DESC);

  CREATE TABLE IF NOT EXISTS story_views (
    story_id  INTEGER NOT NULL REFERENCES stories(id) ON DELETE CASCADE,
    user_id   INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    viewed_at TEXT NOT NULL DEFAULT (datetime('now')),
    PRIMARY KEY (story_id, user_id)
  );

  CREATE TABLE IF NOT EXISTS events (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id     INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    title       TEXT NOT NULL,
    description TEXT DEFAULT '',
    location    TEXT DEFAULT '',
    starts_at   TEXT NOT NULL,
    created_at  TEXT NOT NULL DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS event_rsvps (
    event_id   INTEGER NOT NULL REFERENCES events(id) ON DELETE CASCADE,
    user_id    INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    status     TEXT NOT NULL DEFAULT 'going',
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    PRIMARY KEY (event_id, user_id)
  );

  CREATE TABLE IF NOT EXISTS blocks (
    blocker_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    blocked_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    PRIMARY KEY (blocker_id, blocked_id)
  );

  CREATE TABLE IF NOT EXISTS reports (
    id         INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id    INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    post_id    INTEGER NOT NULL REFERENCES posts(id) ON DELETE CASCADE,
    reason     TEXT DEFAULT '',
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  );
  CREATE UNIQUE INDEX IF NOT EXISTS idx_report_once ON reports(user_id, post_id);

  CREATE TABLE IF NOT EXISTS follows (
    follower_id  INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    followee_id  INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    created_at   TEXT NOT NULL DEFAULT (datetime('now')),
    PRIMARY KEY (follower_id, followee_id)
  );

  CREATE TABLE IF NOT EXISTS notifications (
    id         INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id    INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    actor_id   INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    type       TEXT NOT NULL,
    post_id    INTEGER REFERENCES posts(id) ON DELETE CASCADE,
    body       TEXT,
    read       INTEGER NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  );

  CREATE INDEX IF NOT EXISTS idx_posts_user    ON posts(user_id, created_at DESC);
  CREATE INDEX IF NOT EXISTS idx_comments_post ON comments(post_id, created_at);
  CREATE INDEX IF NOT EXISTS idx_notif_user    ON notifications(user_id, read);
`;

const PG_SCHEMA = `
  CREATE TABLE IF NOT EXISTS users (
    id         BIGINT GENERATED BY DEFAULT AS IDENTITY PRIMARY KEY,
    device_id  TEXT NOT NULL UNIQUE,
    name       TEXT,
    bio        TEXT DEFAULT '',
    avatar     TEXT,
    birthday   TEXT,
    last_seen  TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
  );
  CREATE UNIQUE INDEX IF NOT EXISTS users_name_lower ON users (LOWER(name)) WHERE name IS NOT NULL;

  CREATE TABLE IF NOT EXISTS posts (
    id             BIGINT GENERATED BY DEFAULT AS IDENTITY PRIMARY KEY,
    user_id        BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    caption        TEXT DEFAULT '',
    image          TEXT,
    video          TEXT,
    origin_post_id BIGINT REFERENCES posts(id) ON DELETE SET NULL,
    created_at     TIMESTAMPTZ NOT NULL DEFAULT now()
  );

  CREATE TABLE IF NOT EXISTS likes (
    user_id    BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    post_id    BIGINT NOT NULL REFERENCES posts(id) ON DELETE CASCADE,
    type       TEXT NOT NULL DEFAULT 'like',
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    PRIMARY KEY (user_id, post_id)
  );

  CREATE TABLE IF NOT EXISTS comments (
    id         BIGINT GENERATED BY DEFAULT AS IDENTITY PRIMARY KEY,
    post_id    BIGINT NOT NULL REFERENCES posts(id) ON DELETE CASCADE,
    user_id    BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    body       TEXT NOT NULL,
    parent_id  BIGINT REFERENCES comments(id) ON DELETE CASCADE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
  );

  CREATE TABLE IF NOT EXISTS post_hashtags (
    post_id BIGINT NOT NULL REFERENCES posts(id) ON DELETE CASCADE,
    tag     TEXT NOT NULL,
    PRIMARY KEY (post_id, tag)
  );
  CREATE INDEX IF NOT EXISTS idx_hashtag_tag ON post_hashtags(tag);

  CREATE TABLE IF NOT EXISTS stories (
    id         BIGINT GENERATED BY DEFAULT AS IDENTITY PRIMARY KEY,
    user_id    BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    image      TEXT NOT NULL,
    caption    TEXT DEFAULT '',
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
  );
  CREATE INDEX IF NOT EXISTS idx_stories_user ON stories(user_id, created_at DESC);

  CREATE TABLE IF NOT EXISTS story_views (
    story_id  BIGINT NOT NULL REFERENCES stories(id) ON DELETE CASCADE,
    user_id   BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    viewed_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    PRIMARY KEY (story_id, user_id)
  );

  CREATE TABLE IF NOT EXISTS events (
    id          BIGINT GENERATED BY DEFAULT AS IDENTITY PRIMARY KEY,
    user_id     BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    title       TEXT NOT NULL,
    description TEXT DEFAULT '',
    location    TEXT DEFAULT '',
    starts_at   TIMESTAMPTZ NOT NULL,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
  );

  CREATE TABLE IF NOT EXISTS event_rsvps (
    event_id   BIGINT NOT NULL REFERENCES events(id) ON DELETE CASCADE,
    user_id    BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    status     TEXT NOT NULL DEFAULT 'going',
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    PRIMARY KEY (event_id, user_id)
  );

  CREATE TABLE IF NOT EXISTS blocks (
    blocker_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    blocked_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    PRIMARY KEY (blocker_id, blocked_id)
  );

  CREATE TABLE IF NOT EXISTS reports (
    id         BIGINT GENERATED BY DEFAULT AS IDENTITY PRIMARY KEY,
    user_id    BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    post_id    BIGINT NOT NULL REFERENCES posts(id) ON DELETE CASCADE,
    reason     TEXT DEFAULT '',
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
  );
  CREATE UNIQUE INDEX IF NOT EXISTS idx_report_once ON reports(user_id, post_id);

  CREATE TABLE IF NOT EXISTS follows (
    follower_id  BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    followee_id  BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
    PRIMARY KEY (follower_id, followee_id)
  );

  CREATE TABLE IF NOT EXISTS notifications (
    id         BIGINT GENERATED BY DEFAULT AS IDENTITY PRIMARY KEY,
    user_id    BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    actor_id   BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    type       TEXT NOT NULL,
    post_id    BIGINT REFERENCES posts(id) ON DELETE CASCADE,
    body       TEXT,
    read       INTEGER NOT NULL DEFAULT 0,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
  );

  CREATE INDEX IF NOT EXISTS idx_posts_user    ON posts(user_id, created_at DESC);
  CREATE INDEX IF NOT EXISTS idx_comments_post ON comments(post_id, created_at);
  CREATE INDEX IF NOT EXISTS idx_notif_user    ON notifications(user_id, read);
`;

// ---------- Postgres helpers: convert ? and @name to $1..$n ----------

export function translatePg(sql) {
  let pos = 0;
  const named = [];
  const text = sql
    .replace(/\?/g, () => `$${++pos}`)
    .replace(/@([A-Za-z_]\w*)/g, (m, name) => {
      if (!named.includes(name)) named.push(name);
      return `$${pos + named.indexOf(name) + 1}`;
    });
  return { text, named };
}

export function buildArgs(args, named) {
  if (named.length === 0) return args;
  const isObj = (v) => v && typeof v === "object" && !Array.isArray(v);
  const namedCall = args.length === 1 && isObj(args[0]);
  const positional = namedCall ? [] : args.slice(0, args.length - (isObj(args[args.length - 1]) ? 1 : 0));
  const obj = namedCall ? args[0] : isObj(args[args.length - 1]) ? args[args.length - 1] : {};
  return [...positional, ...named.map((n) => obj[n])];
}

// ---------- adapters ----------

let sqlite;
let pool;

function prepare(sql) {
  if (isSupabase) {
    const { text, named } = translatePg(sql);
    return {
      get: async (...args) => (await pool.query(text, buildArgs(args, named))).rows[0],
      all: async (...args) => (await pool.query(text, buildArgs(args, named))).rows,
      run: async (...args) => {
        const r = await pool.query(text, buildArgs(args, named));
        return { lastInsertRowid: r.rows[0]?.id ?? null, changes: r.rowCount };
      },
    };
  }
  const stmt = sqlite.prepare(sql);
  return {
    get: (...args) => Promise.resolve(stmt.get(...args)),
    all: (...args) => Promise.resolve(stmt.all(...args)),
    run: (...args) => {
      const r = stmt.run(...args);
      return Promise.resolve({ lastInsertRowid: r.lastInsertRowid, changes: r.changes });
    },
  };
}

async function exec(sql) {
  if (isSupabase) await pool.query(sql);
  else sqlite.exec(sql);
}

// ---------- init ----------

export async function initDb() {
  if (isSupabase) {
    const url = new URL(process.env.DATABASE_URL);
    const useSsl = !/localhost|127\.0\.0\.1/.test(url.hostname);
    pool = new pg.Pool({
      connectionString: process.env.DATABASE_URL,
      ssl: useSsl ? { rejectUnauthorized: false } : undefined,
    });
    await exec(PG_SCHEMA);
    // -------- migrations for existing cloud DBs --------
    const pgMigrations = [
      `ALTER TABLE notifications ADD COLUMN IF NOT EXISTS body TEXT`,
      `ALTER TABLE users ADD COLUMN IF NOT EXISTS birthday TEXT`,
      `ALTER TABLE users ADD COLUMN IF NOT EXISTS last_seen TIMESTAMPTZ`,
      `ALTER TABLE posts ADD COLUMN IF NOT EXISTS origin_post_id BIGINT REFERENCES posts(id) ON DELETE SET NULL`,
      `ALTER TABLE posts ADD COLUMN IF NOT EXISTS video TEXT`,
      `ALTER TABLE comments ADD COLUMN IF NOT EXISTS parent_id BIGINT REFERENCES comments(id) ON DELETE CASCADE`,
      `ALTER TABLE likes ADD COLUMN IF NOT EXISTS type TEXT NOT NULL DEFAULT 'like'`,
      `CREATE TABLE IF NOT EXISTS post_hashtags (post_id BIGINT NOT NULL REFERENCES posts(id) ON DELETE CASCADE, tag TEXT NOT NULL, PRIMARY KEY (post_id, tag))`,
      `CREATE INDEX IF NOT EXISTS idx_hashtag_tag ON post_hashtags(tag)`,
      `CREATE TABLE IF NOT EXISTS stories (id BIGINT GENERATED BY DEFAULT AS IDENTITY PRIMARY KEY, user_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE, image TEXT NOT NULL, caption TEXT DEFAULT '', created_at TIMESTAMPTZ NOT NULL DEFAULT now())`,
      `CREATE INDEX IF NOT EXISTS idx_stories_user ON stories(user_id, created_at DESC)`,
      `CREATE TABLE IF NOT EXISTS story_views (story_id BIGINT NOT NULL REFERENCES stories(id) ON DELETE CASCADE, user_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE, viewed_at TIMESTAMPTZ NOT NULL DEFAULT now(), PRIMARY KEY (story_id, user_id))`,
      `CREATE TABLE IF NOT EXISTS events (id BIGINT GENERATED BY DEFAULT AS IDENTITY PRIMARY KEY, user_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE, title TEXT NOT NULL, description TEXT DEFAULT '', location TEXT DEFAULT '', starts_at TIMESTAMPTZ NOT NULL, created_at TIMESTAMPTZ NOT NULL DEFAULT now())`,
      `CREATE TABLE IF NOT EXISTS event_rsvps (event_id BIGINT NOT NULL REFERENCES events(id) ON DELETE CASCADE, user_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE, status TEXT NOT NULL DEFAULT 'going', created_at TIMESTAMPTZ NOT NULL DEFAULT now(), PRIMARY KEY (event_id, user_id))`,
      `CREATE TABLE IF NOT EXISTS blocks (blocker_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE, blocked_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE, created_at TIMESTAMPTZ NOT NULL DEFAULT now(), PRIMARY KEY (blocker_id, blocked_id))`,
      `CREATE TABLE IF NOT EXISTS reports (id BIGINT GENERATED BY DEFAULT AS IDENTITY PRIMARY KEY, user_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE, post_id BIGINT NOT NULL REFERENCES posts(id) ON DELETE CASCADE, reason TEXT DEFAULT '', created_at TIMESTAMPTZ NOT NULL DEFAULT now())`,
      `CREATE UNIQUE INDEX IF NOT EXISTS idx_report_once ON reports(user_id, post_id)`,
    ];
    for (const m of pgMigrations) await exec(m);
  } else {
    sqlite = new Database(path.join(DATA_DIR, "social.db"));
    sqlite.pragma("journal_mode = WAL");
    sqlite.pragma("foreign_keys = ON");
    await exec(SQLITE_SCHEMA);
    // -------- migrations for existing local DBs --------
    const ensureCol = (table, column, ddl) => {
      const cols = sqlite.prepare(`PRAGMA table_info(${table})`).all().map((c) => c.name);
      if (!cols.includes(column)) sqlite.exec(`ALTER TABLE ${table} ADD COLUMN ${ddl}`);
    };
    ensureCol("notifications", "body", "body TEXT");
    ensureCol("users", "birthday", "birthday TEXT");
    ensureCol("users", "last_seen", "last_seen TEXT");
    ensureCol("posts", "origin_post_id", "origin_post_id INTEGER REFERENCES posts(id) ON DELETE SET NULL");
    ensureCol("posts", "video", "video TEXT");
    ensureCol("comments", "parent_id", "INTEGER REFERENCES comments(id) ON DELETE CASCADE");
    ensureCol("likes", "type", "TEXT NOT NULL DEFAULT 'like'");
  }
}

export const db = { prepare, exec };

// ---------- serializers ----------

export function publicUser(row) {
  if (!row) return null;
  return {
    id: row.id,
    name: row.name,
    bio: row.bio || "",
    avatar: row.avatar || (row.name ? `/api/avatar/${row.name}` : `/api/avatar/device-${row.device_id}`),
    birthday: row.birthday || null,
    lastSeen: row.last_seen || null,
    createdAt: row.created_at,
  };
}

export function postToJson(row, viewerId) {
  const total = row.like_count ?? 0;
  const love = row.love_count ?? 0;
  const haha = row.haha_count ?? 0;
  const wow = row.wow_count ?? 0;
  const sad = row.sad_count ?? 0;
  const angry = row.angry_count ?? 0;
  const origin = row.origin_id
    ? {
        id: row.origin_id,
        caption: row.origin_caption,
        image: row.origin_image,
        createdAt: row.origin_created_at,
        author: {
          id: row.origin_author_id,
          name: row.origin_author_name,
          avatar: row.origin_author_avatar || `/api/avatar/${row.origin_author_name || row.origin_author_id}`,
        },
      }
    : null;
  return {
    id: row.id,
    caption: row.caption,
    image: row.image,
    video: row.video || null,
    createdAt: row.created_at,
    author: {
      id: row.author_id,
      name: row.author_name,
      avatar: row.author_avatar || `/api/avatar/${row.author_name || row.author_id}`,
      lastSeen: row.author_last_seen || null,
    },
    origin,
    likeCount: total,
    reactions: { like: Math.max(0, total - love - haha - wow - sad - angry), love, haha, wow, sad, angry },
    myReaction: row.my_reaction || null,
    commentCount: row.comment_count ?? 0,
  };
}

export function postRow(stmt, params, viewerId) {
  return stmt.get(params).then((row) => (row ? postToJson(row, viewerId) : null));
}

export function postRows(stmt, params, viewerId) {
  return stmt.all(params).then((rows) => rows.map((r) => postToJson(r, viewerId)));
}

export const POST_SELECT = `
  SELECT
    p.*,
    u.id             AS author_id,
    u.name           AS author_name,
    u.avatar         AS author_avatar,
    u.last_seen      AS author_last_seen,
    (SELECT COUNT(*) FROM likes l WHERE l.post_id = p.id) AS like_count,
    (SELECT COUNT(*) FROM likes lv WHERE lv.post_id = p.id AND lv.type = 'love') AS love_count,
    (SELECT COUNT(*) FROM likes hh WHERE hh.post_id = p.id AND hh.type = 'haha') AS haha_count,
    (SELECT COUNT(*) FROM likes ww WHERE ww.post_id = p.id AND ww.type = 'wow') AS wow_count,
    (SELECT COUNT(*) FROM likes sd WHERE sd.post_id = p.id AND sd.type = 'sad') AS sad_count,
    (SELECT COUNT(*) FROM likes ag WHERE ag.post_id = p.id AND ag.type = 'angry') AS angry_count,
    (SELECT COUNT(*) FROM comments c WHERE c.post_id = p.id) AS comment_count,
    (SELECT lr.type FROM likes lr WHERE lr.post_id = p.id AND lr.user_id = @viewer) AS my_reaction,
    op.id              AS origin_id,
    op.caption         AS origin_caption,
    op.image           AS origin_image,
    op.created_at      AS origin_created_at,
    ou.id              AS origin_author_id,
    ou.name            AS origin_author_name,
    ou.avatar          AS origin_author_avatar
  FROM posts p
  JOIN users u ON u.id = p.user_id
  LEFT JOIN posts op ON op.id = p.origin_post_id
  LEFT JOIN users ou ON ou.id = op.user_id
`;

export const BLOCK_FILTER = `p.user_id NOT IN (SELECT blocked_id FROM blocks WHERE blocker_id = @viewer)`;

export const BLOCKED_BY_FILTER = `p.user_id NOT IN (SELECT blocker_id FROM blocks WHERE blocked_id = @viewer)`;
