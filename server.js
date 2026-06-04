import express from "express";
import { mkdirSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { DatabaseSync } from "node:sqlite";

const __dirname = fileURLToPath(new URL(".", import.meta.url));
const app = express();
const port = Number(process.env.PORT || 3000);
const isProduction = process.env.NODE_ENV === "production";
const adminPassword = process.env.ADMIN_PASSWORD || (!isProduction ? "admin123" : "");

if (isProduction && !adminPassword) {
  throw new Error(
    "ADMIN_PASSWORD must be set in production. Configure it in Render before starting the service."
  );
}

const dataDir = process.env.DATA_DIR
  ? process.env.DATA_DIR
  : join(__dirname, "data");

mkdirSync(dataDir, { recursive: true });

const db = new DatabaseSync(join(dataDir, "life-notes.sqlite"));
db.exec(`
  CREATE TABLE IF NOT EXISTS posts (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    nickname TEXT NOT NULL,
    content TEXT NOT NULL,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  );
`);

const listPosts = db.prepare(`
  SELECT id, nickname, content, created_at AS createdAt
  FROM posts
  ORDER BY id DESC
`);
const createPost = db.prepare(`
  INSERT INTO posts (nickname, content)
  VALUES (?, ?)
`);
const findPost = db.prepare("SELECT id FROM posts WHERE id = ?");
const deletePost = db.prepare("DELETE FROM posts WHERE id = ?");

app.use(express.json({ limit: "16kb" }));
app.use(express.static(join(__dirname, "public")));

app.get("/health", (req, res) => {
  res.json({ ok: true });
});

app.get("/api/posts", (req, res) => {
  res.json({ posts: listPosts.all() });
});

app.post("/api/posts", (req, res) => {
  const nickname = String(req.body?.nickname || "").trim();
  const content = String(req.body?.content || "").trim();

  if (!nickname) {
    return res.status(400).json({ message: "请填写昵称。" });
  }

  if (nickname.length > 20) {
    return res.status(400).json({ message: "昵称最多 20 个字。" });
  }

  if (!content) {
    return res.status(400).json({ message: "请填写生活记录内容。" });
  }

  if (content.length > 500) {
    return res.status(400).json({ message: "内容最多 500 个字。" });
  }

  const result = createPost.run(nickname, content);
  const post = db
    .prepare(`
      SELECT id, nickname, content, created_at AS createdAt
      FROM posts
      WHERE id = ?
    `)
    .get(result.lastInsertRowid);

  res.status(201).json({ post });
});

app.delete("/api/posts/:id", (req, res) => {
  const password = String(req.body?.password || "");

  if (password !== adminPassword) {
    return res.status(401).json({ message: "管理员密码不正确。" });
  }

  const id = Number(req.params.id);
  if (!Number.isInteger(id) || id <= 0) {
    return res.status(400).json({ message: "帖子 ID 无效。" });
  }

  if (!findPost.get(id)) {
    return res.status(404).json({ message: "帖子不存在或已被删除。" });
  }

  deletePost.run(id);
  res.status(204).send();
});

app.use((req, res) => {
  res.status(404).json({ message: "页面或接口不存在。" });
});

app.listen(port, () => {
  console.log(`Shared life notes is running at http://localhost:${port}`);
  console.log(
    isProduction
      ? "Production mode: ADMIN_PASSWORD is required and has been loaded."
      : "Default admin password: admin123"
  );
});
