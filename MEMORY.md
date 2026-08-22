# Your One — Complete Reference

## Colors (IMO-style)
--bg: #f0f2f5 | --card: #ffffff | --border: #dddfe2
--text: #1c1e21 | --muted: #65676b | --accent: #1a73e8
--accent-dark: #1557b0 | --radius: 10px

## Dark Mode
--bg: #18191a | --card: #242526 | --border: #3a3b3c
--text: #e4e6eb | --muted: #b0b3b8 | --accent: #4599ff

## Server Routes (index.js)
identity, users, posts, feed, comments, likes, messages,
notifications, push, stories, events, blocks, reports,
suggestions, presence, online, avatar, search

## Client Files
App.jsx, auth.jsx, api.js, push.js, utils.js, styles.css
18 components, 7 pages

## Polling
messages: 4s | convos: 10s | toast: 8s | notifs: 10s
stories: 30s | presence: 30s

## Deploy
npm run build -> upload-to-github.mjs -> Render auto-deploy
