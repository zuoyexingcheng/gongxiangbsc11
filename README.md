# 金狗点评

让市场有记忆，让作恶有代价。

这是一个简易 meme 币点评网站。用户可以填写币名/代码、1-5 分评分、点评标签、昵称和点评内容；管理员可以用密码删除点评。

## 本地运行

```powershell
npm install
npm start
```

然后打开：

```text
http://localhost:3000
```

本地默认管理员密码是：

```text
admin123
```

## 功能

- 发布 meme 币点评：币名/代码、评分、标签、昵称、点评内容。
- 标签：金狗推荐、中立观察、避雷警告。
- 搜索和筛选：按币名、昵称、内容搜索；按评分和标签筛选。
- 排序：最新发布、评分最高、评分最低。
- 项目口碑榜：按币名聚合平均分、点评数、推荐数、避雷数。
- 管理员删除：输入管理员密码删除指定点评。

## API

获取点评：

```text
GET /api/posts?search=DOGE&rating=5&tag=good&sort=rating_desc
```

获取项目口碑榜：

```text
GET /api/projects?search=DOGE
```

发布点评：

```json
{
  "coinName": "DOGE",
  "rating": 5,
  "tag": "good",
  "nickname": "点评人",
  "content": "点评内容"
}
```

删除点评：

```text
DELETE /api/posts/:id
```

请求体：

```json
{
  "password": "admin123"
}
```

## 数据保存

点评会保存到 SQLite：

```text
data/life-notes.sqlite
```

已有旧数据会兼容显示；如果旧记录没有币名、评分或标签，页面会显示默认信息。

## 环境变量

| 名称 | 用途 |
| --- | --- |
| `NODE_ENV` | 生产环境设置为 `production` |
| `ADMIN_PASSWORD` | 管理员删除点评时使用的密码 |
| `DATA_DIR` | 可选，SQLite 数据保存目录 |
