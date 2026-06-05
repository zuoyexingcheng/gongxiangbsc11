const form = document.querySelector("#post-form");
const filterForm = document.querySelector("#filter-form");
const coinNameInput = document.querySelector("#coin-name");
const nicknameInput = document.querySelector("#nickname");
const contentInput = document.querySelector("#content");
const contentCount = document.querySelector("#content-count");
const message = document.querySelector("#form-message");
const postsEl = document.querySelector("#posts");
const projectsEl = document.querySelector("#projects");
const refreshButton = document.querySelector("#refresh-button");
const searchInput = document.querySelector("#search-input");
const ratingFilter = document.querySelector("#rating-filter");
const tagFilter = document.querySelector("#tag-filter");
const sortSelect = document.querySelector("#sort-select");

const tagLabels = {
  good: "金狗推荐",
  neutral: "中立观察",
  warning: "避雷警告"
};

function setMessage(text, isError = true) {
  message.textContent = text;
  message.style.color = isError ? "#ff8a65" : "#f7c948";
}

function formatTime(value) {
  return new Intl.DateTimeFormat("zh-CN", {
    dateStyle: "medium",
    timeStyle: "short"
  }).format(new Date(`${value}Z`));
}

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

async function requestJson(url, options = {}) {
  const response = await fetch(url, {
    headers: { "Content-Type": "application/json" },
    ...options
  });

  if (response.status === 204) {
    return null;
  }

  const data = await response.json();
  if (!response.ok) {
    throw new Error(data.message || "请求失败，请稍后再试。");
  }

  return data;
}

function formatRating(rating) {
  if (!Number.isInteger(rating) || rating < 1 || rating > 5) {
    return "暂无评分";
  }

  return `${"★".repeat(rating)}${"☆".repeat(5 - rating)} ${rating}.0`;
}

function getSelectedRating() {
  const checked = form.querySelector('input[name="rating"]:checked');
  return checked ? Number(checked.value) : null;
}

function getSelectedTag() {
  const checked = form.querySelector('input[name="tag"]:checked');
  return checked ? checked.value : null;
}

function buildQuery() {
  const params = new URLSearchParams();
  const search = searchInput.value.trim();

  if (search) params.set("search", search);
  if (ratingFilter.value) params.set("rating", ratingFilter.value);
  if (tagFilter.value) params.set("tag", tagFilter.value);
  if (sortSelect.value) params.set("sort", sortSelect.value);

  return params.toString();
}

function renderProjects(projects) {
  if (!projects.length) {
    projectsEl.innerHTML = '<div class="empty">暂无项目统计，发布点评后会自动生成口碑榜。</div>';
    return;
  }

  projectsEl.innerHTML = projects
    .map(
      (project) => `
        <article class="project-card">
          <p class="project-name">${escapeHtml(project.coinName)}</p>
          <p class="project-score">${escapeHtml(formatRating(Math.round(project.averageRating)))}</p>
          <div class="project-stats">
            <span>${project.reviewCount} 条点评</span>
            <span>均分 ${project.averageRating ?? "暂无"}</span>
            <span>推荐 ${project.goodCount}</span>
            <span>避雷 ${project.warningCount}</span>
          </div>
        </article>
      `
    )
    .join("");
}

function renderPosts(posts) {
  if (!posts.length) {
    postsEl.innerHTML = '<div class="empty">没有匹配的点评，换个筛选条件试试。</div>';
    return;
  }

  postsEl.innerHTML = posts
    .map((post) => {
      const coinName = post.coinName || "未标注项目";
      const tag = tagLabels[post.tag] ? post.tag : "neutral";

      return `
        <article class="post">
          <div class="post-top">
            <div>
              <div class="coin-line">
                <p class="coin-name">${escapeHtml(coinName)}</p>
                <span class="tag-badge ${tag}">${escapeHtml(tagLabels[tag])}</span>
              </div>
              <p class="rating">${escapeHtml(formatRating(post.rating))}</p>
            </div>
            <button class="delete-button" type="button" data-id="${post.id}">
              删除
            </button>
          </div>
          <div class="post-meta">
            <span>${escapeHtml(post.nickname)}</span>
            <time datetime="${escapeHtml(post.createdAt)}">${formatTime(post.createdAt)}</time>
          </div>
          <p class="content">${escapeHtml(post.content)}</p>
        </article>
      `;
    })
    .join("");
}

async function loadProjects() {
  const params = new URLSearchParams();
  const search = searchInput.value.trim();
  if (search) params.set("search", search);

  projectsEl.innerHTML = '<div class="empty">正在统计项目口碑...</div>';
  try {
    const data = await requestJson(`/api/projects?${params.toString()}`);
    renderProjects(data.projects);
  } catch (error) {
    projectsEl.innerHTML = `<div class="empty">${escapeHtml(error.message)}</div>`;
  }
}

async function loadPosts() {
  postsEl.innerHTML = '<div class="empty">正在加载点评...</div>';
  try {
    const query = buildQuery();
    const data = await requestJson(`/api/posts?${query}`);
    renderPosts(data.posts);
  } catch (error) {
    postsEl.innerHTML = `<div class="empty">${escapeHtml(error.message)}</div>`;
  }
}

async function refreshAll() {
  await Promise.all([loadProjects(), loadPosts()]);
}

contentInput.addEventListener("input", () => {
  contentCount.textContent = `${contentInput.value.length} / 500`;
});

form.addEventListener("submit", async (event) => {
  event.preventDefault();
  const coinName = coinNameInput.value.trim();
  const rating = getSelectedRating();
  const tag = getSelectedTag();
  const nickname = nicknameInput.value.trim();
  const content = contentInput.value.trim();

  if (!coinName) {
    setMessage("请填写币名或代码。");
    coinNameInput.focus();
    return;
  }

  if (!Number.isInteger(rating) || rating < 1 || rating > 5) {
    setMessage("请选择 1 到 5 分的评分。");
    form.querySelector('input[name="rating"]').focus();
    return;
  }

  if (!tag) {
    setMessage("请选择点评标签。");
    form.querySelector('input[name="tag"]').focus();
    return;
  }

  if (!nickname) {
    setMessage("请填写昵称。");
    nicknameInput.focus();
    return;
  }

  if (!content) {
    setMessage("请填写点评内容。");
    contentInput.focus();
    return;
  }

  const submitButton = form.querySelector('button[type="submit"]');
  submitButton.disabled = true;
  setMessage("正在发布点评...", false);

  try {
    await requestJson("/api/posts", {
      method: "POST",
      body: JSON.stringify({ coinName, rating, tag, nickname, content })
    });
    form.reset();
    form.querySelector('input[name="tag"][value="neutral"]').checked = true;
    contentCount.textContent = "0 / 500";
    setMessage("点评发布成功。", false);
    await refreshAll();
  } catch (error) {
    setMessage(error.message);
  } finally {
    submitButton.disabled = false;
  }
});

filterForm.addEventListener("input", refreshAll);
filterForm.addEventListener("change", refreshAll);

postsEl.addEventListener("click", async (event) => {
  const button = event.target.closest(".delete-button");
  if (!button) return;

  const password = window.prompt("请输入管理员密码：");
  if (password === null) return;

  button.disabled = true;
  try {
    await requestJson(`/api/posts/${button.dataset.id}`, {
      method: "DELETE",
      body: JSON.stringify({ password })
    });
    setMessage("点评删除成功。", false);
    await refreshAll();
  } catch (error) {
    setMessage(error.message);
    button.disabled = false;
  }
});

refreshButton.addEventListener("click", refreshAll);
refreshAll();
