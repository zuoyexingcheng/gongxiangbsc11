const form = document.querySelector("#post-form");
const nicknameInput = document.querySelector("#nickname");
const contentInput = document.querySelector("#content");
const contentCount = document.querySelector("#content-count");
const message = document.querySelector("#form-message");
const postsEl = document.querySelector("#posts");
const refreshButton = document.querySelector("#refresh-button");

function setMessage(text, isError = true) {
  message.textContent = text;
  message.style.color = isError ? "#8f4b3e" : "#1f6f68";
}

function formatTime(value) {
  return new Intl.DateTimeFormat("zh-CN", {
    dateStyle: "medium",
    timeStyle: "short"
  }).format(new Date(`${value}Z`));
}

function escapeHtml(value) {
  return value
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

function renderPosts(posts) {
  if (!posts.length) {
    postsEl.innerHTML = '<div class="empty">还没有大事记，来写下第一条吧。</div>';
    return;
  }

  postsEl.innerHTML = posts
    .map(
      (post) => `
        <article class="post">
          <div class="post-top">
            <div>
              <p class="author">${escapeHtml(post.nickname)}</p>
              <time class="time" datetime="${escapeHtml(post.createdAt)}">
                ${formatTime(post.createdAt)}
              </time>
            </div>
            <button class="delete-button" type="button" data-id="${post.id}">
              删除
            </button>
          </div>
          <p class="content">${escapeHtml(post.content)}</p>
        </article>
      `
    )
    .join("");
}

async function loadPosts() {
  postsEl.innerHTML = '<div class="empty">正在加载...</div>';
  try {
    const data = await requestJson("/api/posts");
    renderPosts(data.posts);
  } catch (error) {
    postsEl.innerHTML = `<div class="empty">${escapeHtml(error.message)}</div>`;
  }
}

contentInput.addEventListener("input", () => {
  contentCount.textContent = `${contentInput.value.length} / 500`;
});

form.addEventListener("submit", async (event) => {
  event.preventDefault();
  const nickname = nicknameInput.value.trim();
  const content = contentInput.value.trim();

  if (!nickname) {
    setMessage("请填写昵称。");
    nicknameInput.focus();
    return;
  }

  if (!content) {
    setMessage("请填写大事记内容。");
    contentInput.focus();
    return;
  }

  const submitButton = form.querySelector('button[type="submit"]');
  submitButton.disabled = true;
  setMessage("正在发布...", false);

  try {
    await requestJson("/api/posts", {
      method: "POST",
      body: JSON.stringify({ nickname, content })
    });
    form.reset();
    contentCount.textContent = "0 / 500";
    setMessage("发布成功。", false);
    await loadPosts();
  } catch (error) {
    setMessage(error.message);
  } finally {
    submitButton.disabled = false;
  }
});

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
    setMessage("删除成功。", false);
    await loadPosts();
  } catch (error) {
    setMessage(error.message);
    button.disabled = false;
  }
});

refreshButton.addEventListener("click", loadPosts);
loadPosts();
