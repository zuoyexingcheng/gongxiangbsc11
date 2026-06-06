import express from "express";
import pg from "pg";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const { Pool } = pg;

const __dirname = fileURLToPath(new URL(".", import.meta.url));
const app = express();
const port = Number(process.env.PORT || 3000);
const isProduction = process.env.NODE_ENV === "production";
const adminPassword = process.env.ADMIN_PASSWORD || (!isProduction ? "admin123" : "");
const databaseUrl = process.env.DATABASE_URL;

if (isProduction && !adminPassword) {
  throw new Error(
    "ADMIN_PASSWORD must be set in production. Configure it in Render before starting the service."
  );
}

if (!databaseUrl) {
  throw new Error(
    "DATABASE_URL must be set. Create a PostgreSQL database and configure DATABASE_URL before starting the service."
  );
}

const pool = new Pool({
  connectionString: databaseUrl,
  ssl: isProduction ? { rejectUnauthorized: false } : undefined
});

const tagValues = new Set(["good", "neutral", "warning"]);
const sortSql = {
  latest: "id DESC",
  rating_desc: "rating DESC NULLS LAST, id DESC",
  rating_asc: "rating ASC NULLS LAST, id DESC"
};

async function initializeDatabase() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS posts (
      id BIGSERIAL PRIMARY KEY,
      coin_name TEXT,
      rating INTEGER,
      tag TEXT,
      nickname TEXT NOT NULL,
      content TEXT NOT NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
  `);

  await pool.query(`
    CREATE INDEX IF NOT EXISTS posts_created_at_idx ON posts (created_at DESC);
  `);

  await pool.query(`
    CREATE INDEX IF NOT EXISTS posts_coin_name_idx ON posts (LOWER(TRIM(coin_name)));
  `);
}

function addFilter(clauses, values, sql) {
  values.push(sql.value);
  clauses.push(sql.text.replace("?", `$${values.length}`));
}

function buildPostFilters(query) {
  const clauses = [];
  const values = [];
  const search = String(query.search || "").trim();
  const rating = Number(query.rating);
  const tag = String(query.tag || "").trim();

  if (search) {
    const placeholder = `$${values.length + 1}`;
    clauses.push(
      `(coin_name ILIKE ${placeholder} OR nickname ILIKE ${placeholder} OR content ILIKE ${placeholder})`
    );
    values.push(`%${search}%`);
  }

  if (Number.isInteger(rating) && rating >= 1 && rating <= 5) {
    addFilter(clauses, values, { text: "rating = ?", value: rating });
  }

  if (tagValues.has(tag)) {
    addFilter(clauses, values, { text: "COALESCE(tag, 'neutral') = ?", value: tag });
  }

  return {
    whereSql: clauses.length ? `WHERE ${clauses.join(" AND ")}` : "",
    values
  };
}

function mapPost(row) {
  const createdAt =
    row.createdAt instanceof Date
      ? row.createdAt.toISOString().replace(/Z$/, "")
      : String(row.createdAt || "");

  return {
    id: Number(row.id),
    coinName: row.coinName || "",
    rating: row.rating,
    tag: row.tag || "neutral",
    nickname: row.nickname,
    content: row.content,
    createdAt
  };
}

app.use(express.json({ limit: "16kb" }));
app.use(express.static(join(__dirname, "public")));

app.get("/health", (req, res) => {
  res.json({ ok: true });
});

app.get("/api/posts", async (req, res, next) => {
  try {
    const { whereSql, values } = buildPostFilters(req.query);
    const sort = sortSql[String(req.query.sort || "latest")] || sortSql.latest;
    const result = await pool.query(
      `
        SELECT
          id,
          COALESCE(coin_name, '') AS "coinName",
          rating,
          COALESCE(tag, 'neutral') AS tag,
          nickname,
          content,
          created_at AS "createdAt"
        FROM posts
        ${whereSql}
        ORDER BY ${sort}
      `,
      values
    );

    res.json({ posts: result.rows.map(mapPost) });
  } catch (error) {
    next(error);
  }
});

app.get("/api/projects", async (req, res, next) => {
  try {
    const search = String(req.query.search || "").trim();
    const clauses = ["coin_name IS NOT NULL", "TRIM(coin_name) != ''"];
    const values = [];

    if (search) {
      values.push(`%${search}%`);
      clauses.push(`coin_name ILIKE $${values.length}`);
    }

    const result = await pool.query(
      `
        SELECT
          MAX(coin_name) AS "coinName",
          COUNT(*)::int AS "reviewCount",
          ROUND(AVG(rating)::numeric, 1)::float AS "averageRating",
          MAX(created_at) AS "latestCreatedAt",
          SUM(CASE WHEN COALESCE(tag, 'neutral') = 'good' THEN 1 ELSE 0 END)::int AS "goodCount",
          SUM(CASE WHEN COALESCE(tag, 'neutral') = 'warning' THEN 1 ELSE 0 END)::int AS "warningCount"
        FROM posts
        WHERE ${clauses.join(" AND ")}
        GROUP BY LOWER(TRIM(coin_name))
        ORDER BY "reviewCount" DESC, "averageRating" DESC NULLS LAST, "latestCreatedAt" DESC
        LIMIT 12
      `,
      values
    );

    res.json({ projects: result.rows });
  } catch (error) {
    next(error);
  }
});

app.post("/api/posts", async (req, res, next) => {
  try {
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

    const result = await pool.query(
      `
        INSERT INTO posts (coin_name, rating, tag, nickname, content)
        VALUES ($1, $2, $3, $4, $5)
        RETURNING
          id,
          COALESCE(coin_name, '') AS "coinName",
          rating,
          COALESCE(tag, 'neutral') AS tag,
          nickname,
          content,
          created_at AS "createdAt"
      `,
      [coinName, rating, tag, nickname, content]
    );

    res.status(201).json({ post: mapPost(result.rows[0]) });
  } catch (error) {
    next(error);
  }
});

app.delete("/api/posts/:id", async (req, res, next) => {
  try {
    const password = String(req.body?.password || "");

    if (password !== adminPassword) {
      return res.status(401).json({ message: "管理员密码不正确。" });
    }

    const id = Number(req.params.id);
    if (!Number.isInteger(id) || id <= 0) {
      return res.status(400).json({ message: "点评 ID 无效。" });
    }

    const result = await pool.query("DELETE FROM posts WHERE id = $1", [id]);
    if (result.rowCount === 0) {
      return res.status(404).json({ message: "点评不存在或已被删除。" });
    }

    res.status(204).send();
  } catch (error) {
    next(error);
  }
});

app.use((req, res) => {
  res.status(404).json({ message: "页面或接口不存在。" });
});

app.use((error, req, res, next) => {
  console.error(error);
  res.status(500).json({ message: "服务器开小差了，请稍后再试。" });
});

await initializeDatabase();

app.listen(port, () => {
  console.log(`Jingou reviews is running at http://localhost:${port}`);
  console.log(
    isProduction
      ? "Production mode: PostgreSQL database and ADMIN_PASSWORD are loaded."
      : "Default admin password: admin123"
  );
});
