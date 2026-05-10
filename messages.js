const allowedMoods = ["sunny", "focus", "brave", "calm", "spark"];
let autoScrollFrame = 0;
let lastScrollTime = 0;
let userPauseUntil = 0;
let isAutoScrolling = false;
let isHoveringStage = false;
let dragState = null;
let userPauseTimer = 0;
const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

const els = {
  form: document.querySelector("#wallForm"),
  author: document.querySelector("#authorInput"),
  text: document.querySelector("#messageInput"),
  mood: document.querySelector("#moodInput"),
  submit: document.querySelector("#submitMessageBtn"),
  count: document.querySelector("#messageCount"),
  refresh: document.querySelector("#refreshBtn"),
  toggleScroll: document.querySelector("#toggleScrollBtn"),
  stage: document.querySelector("#messageStage"),
  grid: document.querySelector("#messageGrid")
};

init();

function init() {
  els.form.addEventListener("submit", submitMessage);
  els.refresh.addEventListener("click", loadMessages);
  els.toggleScroll.addEventListener("click", toggleScroll);
  document.addEventListener("visibilitychange", () => {
    lastScrollTime = 0;
  });
  bindStageScroll();
  loadMessages();
}

function bindStageScroll() {
  els.stage.addEventListener("mouseenter", () => {
    isHoveringStage = true;
  });
  els.stage.addEventListener("mouseleave", () => {
    isHoveringStage = false;
  });
  els.stage.addEventListener(
    "wheel",
    (event) => {
      if (els.stage.classList.contains("is-empty") || els.stage.scrollWidth <= els.stage.clientWidth) return;
      const horizontalDelta = Math.abs(event.deltaX) >= Math.abs(event.deltaY) ? event.deltaX : event.deltaY;
      if (!horizontalDelta) return;
      event.preventDefault();
      pauseForUser();
      els.stage.scrollLeft += horizontalDelta;
      normalizeLoopScroll();
    },
    { passive: false }
  );
  els.stage.addEventListener("scroll", () => {
    if (!isAutoScrolling) pauseForUser(1200);
    normalizeLoopScroll();
  });
  els.stage.addEventListener("pointerdown", (event) => {
    if (els.stage.classList.contains("is-empty") || els.stage.scrollWidth <= els.stage.clientWidth) return;
    dragState = {
      pointerId: event.pointerId,
      startX: event.clientX,
      scrollLeft: els.stage.scrollLeft
    };
    els.stage.classList.add("is-dragging");
    els.stage.setPointerCapture(event.pointerId);
    pauseForUser(2400);
  });
  els.stage.addEventListener("pointermove", (event) => {
    if (!dragState || event.pointerId !== dragState.pointerId) return;
    els.stage.scrollLeft = dragState.scrollLeft - (event.clientX - dragState.startX);
    pauseForUser(1800);
    normalizeLoopScroll();
  });
  for (const eventName of ["pointerup", "pointercancel", "pointerleave"]) {
    els.stage.addEventListener(eventName, endStageDrag);
  }
}

async function loadMessages() {
  els.refresh.disabled = true;
  try {
    const payload = await fetchJson("/api/messages");
    renderMessages(payload);
  } catch {
    els.stage.classList.add("is-empty");
    els.grid.innerHTML = `<div class="empty-state">留言暂时没加载出来，等会儿再刷新一下。</div>`;
  } finally {
    els.refresh.disabled = false;
  }
}

async function submitMessage(event) {
  event.preventDefault();
  const text = els.text.value.trim();
  if (text.length < 2) {
    showToast("再多写几个字吧，这样大家更能接住你的意思。");
    els.text.focus();
    return;
  }

  const originalLabel = els.submit.textContent;
  els.submit.disabled = true;
  els.submit.classList.add("is-busy");
  els.submit.textContent = "正在贴";

  try {
    const payload = await fetchJson("/api/messages", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        author: els.author.value,
        text,
        mood: els.mood.value
      })
    });
    els.author.value = "";
    els.text.value = "";
    renderMessages(await fetchJson("/api/messages"));
    showToast(payload.message?.author ? "新留言已经贴上墙。" : "留言已经贴上墙。");
  } catch (error) {
    showToast(error.message || "留言没发出去，稍后再试一下。");
  } finally {
    els.submit.disabled = false;
    els.submit.classList.remove("is-busy");
    els.submit.textContent = originalLabel;
  }
}

function renderMessages(payload) {
  const messages = uniqueMessages(Array.isArray(payload?.messages) ? payload.messages : []);
  els.count.textContent = `${messages.length} 条留言`;

  if (!messages.length) {
    els.stage.classList.add("is-empty");
    els.grid.innerHTML = `<div class="empty-state">还没有留言。第一张便签就交给你了。</div>`;
    return;
  }

  els.stage.classList.remove("is-empty");
  const visibleMessages = messages.slice(0, 36);
  els.grid.innerHTML = visibleMessages.map(renderCard).join("");
  const duration = Math.max(24, visibleMessages.length * 7);
  els.grid.style.setProperty("--scroll-duration", `${duration}s`);
  els.stage.scrollLeft = 0;
  startAutoScroll();
}

function uniqueMessages(messages) {
  const seen = new Set();
  return messages.filter((message) => {
    const text = String(message.text || "").trim();
    const author = String(message.author || "").trim();
    const createdAt = new Date(message.createdAt).getTime();
    const timeBucket = Number.isFinite(createdAt) ? Math.floor(createdAt / 30000) : "now";
    const key = `${author}::${text}::${timeBucket}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function renderCard(message, index) {
  const mood = allowedMoods.includes(message.mood) ? message.mood : "sunny";
  const tilt = ((index % 5) - 2) * 0.75;
  return `
    <article class="message-card mood-${mood}" style="--tilt: ${tilt}deg; --delay: ${index % 8}">
      <h3>${escapeHtml(message.author || "匿名同学")}</h3>
      <p>${escapeHtml(message.text)}</p>
      <footer>
        <span>${formatDate(message.createdAt)}</span>
        <span>${moodLabel(mood)}</span>
      </footer>
    </article>
  `;
}

function moodLabel(mood) {
  const labels = {
    sunny: "暖黄色",
    focus: "清醒蓝",
    brave: "冲刺红",
    calm: "淡定绿",
    spark: "灵感粉"
  };
  return labels[mood] || labels.sunny;
}

function toggleScroll() {
  const isPaused = els.stage.classList.toggle("is-paused");
  els.toggleScroll.textContent = isPaused ? "继续滚动" : "暂停滚动";
  els.toggleScroll.setAttribute("aria-pressed", String(isPaused));
  lastScrollTime = 0;
}

function startAutoScroll() {
  cancelAnimationFrame(autoScrollFrame);
  lastScrollTime = 0;
  if (reduceMotion) return;
  autoScrollFrame = requestAnimationFrame(autoScroll);
}

function autoScroll(timestamp) {
  if (!lastScrollTime) lastScrollTime = timestamp;
  const elapsed = timestamp - lastScrollTime;
  lastScrollTime = timestamp;

  if (canAutoScroll()) {
    isAutoScrolling = true;
    els.stage.scrollLeft += elapsed * 0.032;
    normalizeLoopScroll();
    isAutoScrolling = false;
  }

  autoScrollFrame = requestAnimationFrame(autoScroll);
}

function canAutoScroll() {
  return (
    !document.hidden &&
    !reduceMotion &&
    !isHoveringStage &&
    Date.now() > userPauseUntil &&
    !els.stage.classList.contains("is-empty") &&
    !els.stage.classList.contains("is-paused") &&
    els.stage.scrollWidth > els.stage.clientWidth
  );
}

function pauseForUser(duration = 2400) {
  userPauseUntil = Date.now() + duration;
  els.stage.classList.add("is-user-paused");
  window.clearTimeout(userPauseTimer);
  userPauseTimer = window.setTimeout(() => {
    if (Date.now() >= userPauseUntil) els.stage.classList.remove("is-user-paused");
  }, duration + 60);
}

function normalizeLoopScroll() {
  const maxScroll = els.stage.scrollWidth - els.stage.clientWidth;
  if (!isAutoScrolling || maxScroll <= 0) return;
  if (els.stage.scrollLeft >= maxScroll - 1) {
    els.stage.scrollLeft = 0;
    lastScrollTime = 0;
  }
}

function endStageDrag(event) {
  if (!dragState || event.pointerId !== dragState.pointerId) return;
  dragState = null;
  els.stage.classList.remove("is-dragging");
  pauseForUser(2200);
}

function formatDate(value) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "刚刚";
  return new Intl.DateTimeFormat("zh-CN", {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit"
  }).format(date);
}

async function fetchJson(url, options) {
  const response = await fetch(url, options);
  const text = await response.text();
  let payload = null;
  if (text) {
    try {
      payload = JSON.parse(text);
    } catch {
      payload = { error: text };
    }
  }
  if (!response.ok) throw new Error(payload?.error || `Request failed: ${response.status}`);
  return payload;
}

function showToast(message) {
  document.querySelectorAll(".toast").forEach((node) => node.remove());
  const toast = document.createElement("div");
  toast.className = "toast";
  toast.textContent = message;
  document.body.appendChild(toast);
  setTimeout(() => {
    toast.classList.add("is-hiding");
    toast.addEventListener("animationend", () => toast.remove(), { once: true });
    setTimeout(() => toast.remove(), 240);
  }, 3000);
}

function escapeHtml(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}
