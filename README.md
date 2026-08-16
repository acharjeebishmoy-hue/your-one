# Your One — the one place for your people

A private, Facebook/Instagram-style social network for your friend group. No ads, no
strangers, no algorithm — just your crew: posts, photos, videos, stories, reactions,
comments, shares, hashtags, mentions, events, and live notifications.

## Features

- **No login page** — anyone can browse; posting just needs a picked name (no account, no password)
- **Posts** — photos, videos (up to 50 MB), or text with captions
- **Reactions** — 👍 ❤️ 😂 😮 😢 😡 with a live picker
- **Comments** — threaded replies, @mentions, and hashtags (`#` links to a hashtag feed)
- **Shares** — repost anything with your own comment
- **Stories** — 24-hour disappearing posts with a fullscreen viewer
- **Feed** — "Following" and "Everyone" views, plus today's birthdays 🎂
- **Profiles** — avatar, bio, birthday, post grid, follower stats, online dot
- **Events** — create, RSVP (going / interested), see who's coming
- **Notifications** — live bell + popup toasts for likes, comments, replies, mentions, shares, follows, joins, and event RSVPs
- **Search + suggestions** — find people, "People you may know"
- **Safety** — block users, report posts
- **No bots, no demo data** — starts empty; only real people create content

## Tech

- **Backend:** Node + Express. Dual-mode database: **better-sqlite3** (local dev) or
  **Supabase/Postgres** (cloud — set `DATABASE_URL` in `.env`)
- **Frontend:** React + Vite + react-router, hand-rolled CSS (no framework)
- **Uploads:** local `uploads/` folder, or **Supabase Storage** when configured

## Quick start

```bash
cd social-app
npm run setup      # installs server + client dependencies
npm run dev        # API on :3001, dev server on :5173
```

### Production mode (one port, 3001)

```bash
npm run build
npm start
```

The database starts empty — it's a real sandbox. Share the URL with friends; everyone
just picks a name.

## ☁️ Connect Supabase (so posts survive everything)

By default the app uses a local SQLite file (`data/social.db`). With Supabase, posts and
photos live in the cloud — they survive browser closes, restarts, and your laptop being off.

1. Create a **free project** at https://supabase.com
2. Run the guided helper and paste the 3 values it asks for:
   ```bash
   npm run connect
   ```
   (or copy `.env.example` to `.env` and fill it in manually)
3. Start the app — it auto-detects Supabase:
   ```bash
   npm start
   ```
   You'll see `☁️ Connected to Supabase`. Tables are created automatically; images and
   videos go to a public `uploads` bucket in Supabase Storage.

> ⚠️ The `service_role` key is powerful — it lives only in your own `.env` on your own
> server. Never ship it to the browser. Keep the app invite-only for your friends.

## Free tier reality check

- **500 MB** database (plenty — posts/comments are tiny)
- **1 GB** file storage — keep video clips short (≤30s) and it lasts months
- **5 GB** bandwidth/month — short clips stretch it further
- Project **pauses after 1 week of no activity** — just resume it from the Supabase dashboard
- **No automatic backups** on free — export a backup yourself with `npm run backup` (if added)

## API overview (main endpoints)

| Method | Path | Description |
| ------ | ---- | ----------- |
| GET/POST | `/api/identity` | Your device identity / pick a name |
| GET | `/api/feed` | Posts from people you follow + today's birthdays |
| GET | `/api/posts` | Newest posts (all, or `?hashtag=` to filter) |
| POST | `/api/posts` | Create post (multipart: image/video + caption) |
| POST | `/api/posts/:id/like` | React (body: `{type}`); DELETE removes |
| POST | `/api/posts/:id/share` | Share a post |
| POST | `/api/posts/:id/comments` | Comment (body: `{body, parentId}` for replies) |
| GET/POST | `/api/stories` | List / create stories (24h) |
| GET/POST | `/api/events` | List / create events |
| POST | `/api/events/:id/rsvp` | RSVP (`going` / `interested` / `not`) |
| GET | `/api/notifications` | Your notifications |
| GET | `/api/suggestions` | People you may know |
| POST | `/api/presence` | Online heartbeat (every 30s) |
| GET | `/api/search?q=` | Search users |

## Project layout

```
social-app/
├── server/
│   ├── index.js   # Express API + static serving
│   ├── db.js      # SQLite/Postgres schema + query adapters
│   └── connect.js # guided Supabase setup helper
├── client/
│   ├── src/
│   │   ├── pages/      # Feed, Explore, Events, Profile, HashtagPage
│   │   ├── components/ # PostCard, PostModal, Composer, Stories, Notifications, etc.
│   │   └── ...
│   └── vite.config.js
├── data/social.db      # local mode database (created on first run)
└── uploads/            # local mode uploads
```
