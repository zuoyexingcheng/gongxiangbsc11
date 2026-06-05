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

const dataDir = process.env.DATA_DIR ? process.env.DATA_DIR : join(__dirname, "data");

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

const postColumns = db.prepare("PRAGMA table_info(posts)").all();
const hasColumn = (name) => postColumns.some((column) => column.name === name);

if (!hasColumn("coin_name")) {
  db.exec("ALTER TABLE posts ADD COLUMN coin_name TEXT");
}

if (!hasColumn("rating")) {
  db.exec("ALTER TABLE posts ADD COLUMN rating INTEGER");
}

if (!hasColumn("tag")) {
  db.exec("ALTER TABLE posts ADD COLUMN tag TEXT");
}

const findPost = db.prepare("SELECT id FROM posts WHERE id = ?");
const deletePost = db.prepare("DELETE FROM posts WHERE id = ?");
const createPost = db.prepare(`
  INSERT INTO posts (coin_name, rating, tag, nickname, content)
  VALUES (?, ?, ?, ?, ?)
`);
const findCreatedPost = db.prepare(`
  SELECT
    id,
    COALESCE(coin_name, '') AS coinName,
    rating,
    COALESCE(tag, 'neutral') AS tag,
    nickname,
    content,
    created_at AS createdAt
  FROM posts
  WHERE id = ?
`);

const tagValues = new Set(["good", "neutral", "warning"]);
const sortSql = {
  latest: "id DESC",
  rating_desc: "rating DESC, id DESC",
  rating_asc: "rating ASC, id DESC"
};

function buildPostFilters(query) {
  const clauses = [];
  const values = [];
  const search = String(query.search || "").trim();
  const rating = Number(query.rating);
  const tag = String(query.tag || "").trim();

  if (search) {
    clauses.push("(coin_name LIKE ? OR nickname LIKE ? OR content LIKE ?)");
    values.push(`%${search}%`, `%${search}%`, `%${search}%`);
  }

  if (Number.isInteger(rating) && rating >= 1 && rating <= 5) {
    clauses.push("rating = ?");
    values.push(rating);
  }

  if (tagValues.has(tag)) {
    clauses.push("COALESCE(tag, 'neutral') = ?");
    values.push(tag);
  }

  return {
    whereSql: clauses.length ? `WHERE ${clauses.join(" AND ")}` : "",
    values
  };
}

app.use(express.json({ limit: "16kb" }));
app.use(express.static(join(__dirname, "public")));

app.get("/health", (req, res) => {
  res.json({ ok: true });
});

app.get("/api/posts", (req, res) => {
  const { whereSql, values } = buildPostFilters(req.query);
  const sort = sortSql[String(req.query.sort || "latest")] || sortSql.latest;
  const posts = db
    .prepare(`
      SELECT
        id,
        COALESCE(coin_name, '') AS coinName,
        rating,
        COALESCE(tag, 'neutral') AS tag,
        nickname,
        content,
        created_at AS createdAt
      FROM posts
      ${whereSql}
      ORDER BY ${sort}
    `)
    .all(...values);

  res.json({ posts });
});

app.get("/api/projects", (req, res) => {
  const search = String(req.query.search || "").trim();
  const clauses = ["coin_name IS NOT NULL", "TRIM(coin_name) != ''"];
  const values = [];

  if (search) {
    clauses.push("coin_name LIKE ?");
    values.push(`%${search}%`);
  }

  const projects = db
    .prepare(`
      SELECT
        MAX(coin_name) AS coinName,
        COUNT(*) AS reviewCount,
        ROUND(AVG(rating), 1) AS averageRating,
        MAX(created_at) AS latestCreatedAt,
        SUM(CASE WHEN COALESCE(tag, 'neutral') = 'good' THEN 1 ELSE 0 END) AS goodCount,
        SUM(CASE WHEN COALESCE(tag, 'neutral') = 'warning' THEN 1 ELSE 0 END) AS warningCount
      FROM posts
      WHERE ${clauses.join(" AND ")}
      GROUP BY LOWER(TRIM(coin_name))
      ORDER BY reviewCount DESC, averageRating DESC, latestCreatedAt DESC
      LIMIT 12
    `)
    .all(...values);

  res.json({ projects });
});

app.post("/api/posts", (req, res) => {
  const coinName = String(req.body?.coinName || "").trim();
  const rating = Number(req.body?.rating);
  const tag = String(req.body?.tag || "").trim();
  const nickname = String(req.body?.nickname || "").trim();
  const content = String(req.body?.content || "").trim();

  if (!coinName) {
    return res.status(400).json({ message: "请填写币名或代码。" });
  }

  if (coinName.length > 40) {
    return res.status(400).json({ message: "币名或代码最多 40 个字。" });
  }

  if (!Number.isInteger(rating) || rating < 1 || rating > 5) {
    return res.status(400).json({ message: "请选择 1 到 5 分的评分。" });
  }

  if (!tagValues.has(tag)) {
    return res.status(400).json({ message: "请选择点评标签。" });
  }

  if (!nickname) {
    return res.status(400).json({ message: "请填写昵称。" });
  }

  if (nickname.length > 20) {
    return res.status(400).json({ message: "昵称最多 20 个字。" });
  }

  if (!content) {
    return res.status(400).json({ message: "请填写点评内容。" });
  }

  if (content.length > 500) {
    return res.status(400).json({ message: "点评内容最多 500 个字。" });
  }

  const result = createPost.run(coinName, rating, tag, nickname, content);
  res.status(201).json({ post: findCreatedPost.get(result.lastInsertRowid) });
});

app.delete("/api/posts/:id", (req, res) => {
  const password = String(req.body?.password || "");

  if (password !== adminPassword) {
    return res.status(401).json({ message: "管理员密码不正确。" });
  }

  const id = Number(req.params.id);
  if (!Number.isInteger(id) || id <= 0) {
    return res.status(400).json({ message: "点评 ID 无效。" });
  }

  if (!findPost.get(id)) {
    return res.status(404).json({ message: "点评不存在或已被删除。" });
  }

  deletePost.run(id);
  res.status(204).send();
});

app.use((req, res) => {
  res.status(404).json({ message: "页面或接口不存在。" });
});

app.listen(port, () => {
  console.log(`Jingou reviews is running at http://localhost:${port}`);
  console.log(
    isProduction
      ? "Production mode: ADMIN_PASSWORD is required and has been loaded."
      : "Default admin password: admin123"
  );
});
