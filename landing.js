const lines = [
  "Demand curve 说：再刷一组。",
  "Nash equilibrium 找到了：大家都先稳住。",
  "Price elasticity 正在盯着你的钱包。",
  "如果期末是 game tree，那就 backward induction。",
  "Second-price auction 提醒你：别报过头。",
  "Channel conflict 先放一放，先把题做完。",
  "Eco7 给你开绿灯。",
  "今晚的 trigger strategy 是咖啡。"
];

const hero = document.querySelector(".hero");
const floatingLine = document.querySelector("#floatingLine");
const chaosButton = document.querySelector("#chaosButton");
const memeButtons = document.querySelectorAll(".course-memes button");
const messageTrack = document.querySelector("#landingMessageTrack");
const searchToggleBtn = document.querySelector("#searchToggleBtn");
const searchCloseBtn = document.querySelector("#searchCloseBtn");
const searchPanel = document.querySelector("#conceptSearchPanel");
const searchForm = document.querySelector("#conceptSearchForm");
const searchInput = document.querySelector("#conceptSearchInput");
const searchSubmitBtn = document.querySelector("#conceptSearchSubmitBtn");
const searchResult = document.querySelector("#conceptSearchResult");
const searchGuides = document.querySelectorAll(".search-guides button");

let lineIndex = 0;
const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
const fallbackMessages = [
  "今天多看懂一个 model，考试当天就少慌一点。",
  "Missed question 不是失败，是期末前最划算的情报。",
  "把 Pricing、Competition、Segmentation 一块一块啃下来。",
  "先稳住，再提速。"
];

function setFloatingLine(text) {
  if (reduceMotion) {
    floatingLine.textContent = text;
    return;
  }
  floatingLine.classList.remove("is-changing");
  void floatingLine.offsetWidth;
  floatingLine.textContent = text;
  floatingLine.classList.add("is-changing");
}

function rotateLine() {
  if (document.hidden) return;
  lineIndex = (lineIndex + 1) % lines.length;
  setFloatingLine(lines[lineIndex]);
}

chaosButton.addEventListener("click", () => {
  hero.classList.remove("party");
  void hero.offsetWidth;
  hero.classList.add("party");
  rotateLine();
});

for (const button of memeButtons) {
  button.addEventListener("click", () => {
    setFloatingLine(button.dataset.line);
  });
}

searchToggleBtn.addEventListener("click", () => {
  const isOpen = searchPanel.hidden;
  setSearchOpen(isOpen);
  if (isOpen) searchInput.focus();
});
searchCloseBtn.addEventListener("click", () => setSearchOpen(false));
searchForm.addEventListener("submit", submitConceptSearch);
for (const button of searchGuides) {
  button.addEventListener("click", () => {
    searchInput.value = button.dataset.query || "";
    setSearchOpen(true);
    submitConceptSearch();
  });
}

window.setInterval(rotateLine, 4200);
loadLandingMessages();
if (!reduceMotion) window.setInterval(loadLandingMessages, 45000);

function setSearchOpen(isOpen) {
  searchPanel.hidden = !isOpen;
  searchToggleBtn.setAttribute("aria-expanded", String(isOpen));
}

async function submitConceptSearch(event) {
  event?.preventDefault();
  const query = searchInput.value.trim();
  if (query.length < 2) {
    renderSearchHint("输入一个概念试试，比如 Nash equilibrium 或 moral hazard。");
    return;
  }

  searchSubmitBtn.disabled = true;
  searchSubmitBtn.textContent = "查询中";
  searchResult.className = "concept-search-result loading";
  searchResult.textContent = "正在按题库找相关解释...";

  try {
    const response = await fetch("/api/concept-search", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ query })
    });
    const payload = await response.json();
    if (!response.ok) throw new Error(payload.error || "搜索失败");
    renderSearchResult(payload);
  } catch (error) {
    searchResult.className = "concept-search-result error";
    searchResult.textContent = error.message || "这次没搜出来，换个关键词再试一下。";
  } finally {
    searchSubmitBtn.disabled = false;
    searchSubmitBtn.textContent = "查一下";
  }
}

function renderSearchHint(message) {
  searchResult.className = "concept-search-result";
  searchResult.textContent = message;
}

function renderSearchResult(payload) {
  const keyPoints = Array.isArray(payload.keyPoints) ? payload.keyPoints : [];
  const suggestions = Array.isArray(payload.suggestions) ? payload.suggestions : [];
  const related = Array.isArray(payload.relatedQuestions) ? payload.relatedQuestions : [];
  searchResult.className = "concept-search-result has-result";
  searchResult.innerHTML = `
    <div class="result-mode">${payload.mode === "local" ? "课程题库" : "课程资料辅助"} · ${escapeHtml(payload.query || searchInput.value)}</div>
    <p>${escapeHtml(payload.answer || "题库里暂时没有清晰解释。")}</p>
    ${keyPoints.length ? `<ul>${keyPoints.map((item) => `<li>${escapeHtml(item)}</li>`).join("")}</ul>` : ""}
    ${payload.example ? `<div class="result-example">${escapeHtml(payload.example)}</div>` : ""}
    ${related.length ? `<details><summary>相关题型</summary>${related.map((item) => `<p>${escapeHtml(item)}</p>`).join("")}</details>` : ""}
    ${suggestions.length ? `<div class="result-suggestions">${suggestions.map((item) => `<span>${escapeHtml(item)}</span>`).join("")}</div>` : ""}
    ${payload.sourceNote ? `<small>${escapeHtml(payload.sourceNote)}</small>` : ""}
  `;
}

async function loadLandingMessages() {
  try {
    const response = await fetch("/api/messages");
    if (!response.ok) throw new Error("messages unavailable");
    const payload = await response.json();
    const texts = uniqueTexts((Array.isArray(payload.messages) ? payload.messages : [])
      .map((message) => String(message.text || "").trim())
      .filter(Boolean));
    renderLandingMessages(texts.length ? texts : fallbackMessages);
  } catch {
    renderLandingMessages(fallbackMessages);
  }
}

function renderLandingMessages(texts) {
  const recent = uniqueTexts(texts).slice(-18).reverse();
  const loop = recent.length >= 4 ? recent : [...recent, ...fallbackMessages].slice(0, 6);
  const row = uniqueTexts(loop).map((text) => `<span>${escapeHtml(text)}</span>`).join("");
  messageTrack.innerHTML = `<div class="landing-message-row">${row}</div>`;
}

function uniqueTexts(texts) {
  const seen = new Set();
  return texts.filter((text) => {
    const key = text.trim();
    if (!key || seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function escapeHtml(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

