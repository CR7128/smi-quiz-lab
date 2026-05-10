const state = {
  bank: [],
  digest: [],
  topics: [],
  currentSet: [],
  currentIndex: 0,
  selections: [],
  submitted: false,
  review: null,
  apiReady: false,
  practiceMode: "mock"
};

const els = {
  modeMockBtn: document.querySelector("#modeMockBtn"),
  modeChapterBtn: document.querySelector("#modeChapterBtn"),
  topicField: document.querySelector("#topicField"),
  topicSelect: document.querySelector("#topicSelect"),
  topicHint: document.querySelector("#topicHint"),
  difficultySelect: document.querySelector("#difficultySelect"),
  newSetBtn: document.querySelector("#newSetBtn"),
  apiSetBtn: document.querySelector("#apiSetBtn"),
  mistakeSetBtn: document.querySelector("#mistakeSetBtn"),
  resetStatsBtn: document.querySelector("#resetStatsBtn"),
  attemptCount: document.querySelector("#attemptCount"),
  avgAccuracy: document.querySelector("#avgAccuracy"),
  apiStatus: document.querySelector("#apiStatus"),
  masteryGrid: document.querySelector("#masteryGrid"),
  questionMeta: document.querySelector("#questionMeta"),
  questionTitle: document.querySelector("#questionTitle"),
  scoreChip: document.querySelector("#scoreChip"),
  progressDots: document.querySelector("#progressDots"),
  questionPrompt: document.querySelector("#questionPrompt"),
  questionBody: document.querySelector(".question-body"),
  quizPanel: document.querySelector(".quiz-panel"),
  optionsList: document.querySelector("#optionsList"),
  prevBtn: document.querySelector("#prevBtn"),
  variantBtn: document.querySelector("#variantBtn"),
  nextBtn: document.querySelector("#nextBtn"),
  submitBtn: document.querySelector("#submitBtn"),
  resultsPanel: document.querySelector("#resultsPanel"),
  closeResultsBtn: document.querySelector("#closeResultsBtn"),
  resultTitle: document.querySelector("#resultTitle"),
  reviewSummary: document.querySelector("#reviewSummary"),
  reviewPlan: document.querySelector("#reviewPlan"),
  wrongList: document.querySelector("#wrongList"),
  sourceGrid: document.querySelector("#sourceGrid"),
  messageMiniForm: document.querySelector("#messageMiniForm"),
  messageName: document.querySelector("#messageName"),
  messageText: document.querySelector("#messageText"),
  messageMood: document.querySelector("#messageMood"),
  messageSubmitBtn: document.querySelector("#messageSubmitBtn"),
  messageCount: document.querySelector("#messageCount"),
  reviewMessageForm: document.querySelector("#reviewMessageForm"),
  reviewMessageName: document.querySelector("#reviewMessageName"),
  reviewMessageText: document.querySelector("#reviewMessageText"),
  reviewMessageMood: document.querySelector("#reviewMessageMood"),
  reviewMessageSubmitBtn: document.querySelector("#reviewMessageSubmitBtn"),
  reviewMessageStatus: document.querySelector("#reviewMessageStatus")
};

const optionLabels = ["A", "B", "C", "D"];
const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
let questionAnimationTimer = 0;
const sourceNotes = {
  "Foundations of Strategic Thinking": "先把战略互动、逆向归纳和信息不对称这条主线理顺。",
  "Segmentation and Positioning": "重点看细分是否可识别、可触达、稳定，并能带来利润。",
  "Competitive Analysis": "注意 Bertrand、重复博弈和合作机制之间的区别。",
  "Salesforce and Bargaining": "把激励、道德风险和谈判里的信号问题放在一起看。",
  "Pricing Strategy": "先判断这是定价、筛选、拍卖还是价格歧视，再套对应逻辑。",
  "Product Strategy": "重点看质量选择、信号、发布时间和品牌伞之间的取舍。",
  "Advertising and Distribution": "广告、渠道和零售商激励经常放在一起考，别只看单点结论。",
  "Cournot Competition": "记住数量竞争的反应函数和均衡直觉。",
  "Stackelberg Competition": "核心是先动承诺为什么会改变后来者反应。",
  "Information Cascades": "注意早期行为如何影响后面消费者的判断。",
  "Network Effects": "把产品当成系统看，用户基数和互补品都很关键。",
  "Durable Goods Pricing": "耐用品要考虑等待、二手市场和替换周期。",
  "Vertical Differentiation": "重点看质量差异如何帮企业避开纯价格竞争。",
  "Demarketing": "不是所有需求都要接住，有时主动筛掉需求反而更稳。",
  "Exclusive Territories": "注意独家区域如何改变零售商服务和竞争强度。",
  "Eco7 Launch Strategy": "把价格、渠道和环保卖点放在同一个决策里判断。",
  "United Breaks Guitars": "重点看服务失败后，口碑和平台传播如何放大影响。"
};

init();

async function init() {
  const [bank, digest, status, messages] = await Promise.all([
    fetchJson("/api/bank"),
    fetchJson("/api/source-digest"),
    fetchJson("/api/status").catch(() => null),
    fetchJson("/api/messages").catch(() => ({ messages: [], count: 0 }))
  ]);

  state.bank = bank;
  state.digest = digest;
  state.topics = ["All", ...new Set(bank.map((q) => q.topic))];
  state.apiReady = Boolean(status?.hasApiKey);

  fillTopicSelect();
  renderApiStatus(status);
  renderStats();
  renderSources();
  renderMessageCount(messages);
  bindEvents();
  renderPracticeControls();
  startPreferredSet();
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

function bindEvents() {
  els.modeMockBtn.addEventListener("click", () => setPracticeMode("mock"));
  els.modeChapterBtn.addEventListener("click", () => setPracticeMode("chapter"));
  els.topicSelect.addEventListener("change", renderPracticeControls);
  els.difficultySelect.addEventListener("change", renderPracticeControls);
  els.newSetBtn.addEventListener("click", startPreferredSet);
  els.apiSetBtn.addEventListener("click", startLocalSet);
  els.mistakeSetBtn.addEventListener("click", startMistakeSet);
  els.resetStatsBtn.addEventListener("click", resetStats);
  els.prevBtn.addEventListener("click", () => moveQuestion(-1));
  els.variantBtn.addEventListener("click", generateVariant);
  els.nextBtn.addEventListener("click", () => moveQuestion(1));
  els.submitBtn.addEventListener("click", submitSet);
  els.closeResultsBtn.addEventListener("click", () => els.resultsPanel.classList.add("hidden"));
  els.messageMiniForm.addEventListener("submit", submitMessage);
  els.reviewMessageForm.addEventListener("submit", submitReviewMessage);
  els.optionsList.addEventListener("click", (event) => {
    const button = event.target.closest(".option-btn");
    if (!button) return;
    chooseOption(Number(button.dataset.index));
  });
  els.progressDots.addEventListener("click", jumpFromProgress);
  document.addEventListener("keydown", handleKeyboard);
}

function fillTopicSelect() {
  els.topicSelect.innerHTML = state.topics
    .filter((topic) => topic !== "All")
    .map((topic) => `<option value="${escapeHtml(topic)}">${escapeHtml(topic)}</option>`)
    .join("");
}

function setPracticeMode(mode) {
  state.practiceMode = mode === "chapter" ? "chapter" : "mock";
  renderPracticeControls();
}

function renderPracticeControls() {
  const isChapter = state.practiceMode === "chapter";
  els.modeMockBtn.classList.toggle("active", !isChapter);
  els.modeChapterBtn.classList.toggle("active", isChapter);
  els.modeMockBtn.setAttribute("aria-pressed", String(!isChapter));
  els.modeChapterBtn.setAttribute("aria-pressed", String(isChapter));
  els.topicField.classList.toggle("disabled", !isChapter);
  els.topicSelect.disabled = !isChapter;
  els.newSetBtn.textContent = isChapter ? "AI 练这一章" : "AI 开始模拟";
  els.apiSetBtn.textContent = "本地备用题";

  if (isChapter) {
    const count = countQuestions(els.topicSelect.value, els.difficultySelect.value);
    const suffix = els.difficultySelect.value === "mixed" ? "" : "；如果这一档题量不够，会自动补同章其他难度";
    els.topicHint.textContent = state.apiReady
      ? `优先用 AI 出同章新题；本地题库有 ${count} 道可作备用${suffix}。`
      : `这一章现在有 ${count} 道本地题${suffix}。`;
    return;
  }

  const count = countQuestions("All", els.difficultySelect.value);
  els.topicHint.textContent = state.apiReady
    ? `模拟会优先调用 AI 生成 10 道题；本地 ${count} 道题作为备用。`
    : `模拟会从全课程 ${count} 道题里抽 10 道。`;
}

function countQuestions(topic, difficulty) {
  return state.bank.filter((question) => {
    const matchesTopic = !topic || topic === "All" || question.topic === topic;
    const matchesDifficulty = difficulty === "mixed" || question.difficulty === difficulty;
    return matchesTopic && matchesDifficulty;
  }).length;
}

function renderApiStatus(status) {
  const count = status?.questionCount || state.bank.length;
  if (state.apiReady) {
    const provider = status.provider === "deepseek" ? "DeepSeek" : "OpenAI";
    els.apiStatus.textContent = `${provider} 优先调用 · ${status.model} · 本地 ${count} 题备用`;
    els.apiStatus.classList.add("ready");
    return;
  }
  els.apiStatus.textContent = `当前用本地题库 · ${count} 题 · 可接入 AI 出题`;
  els.apiStatus.classList.remove("ready");
}

function startPreferredSet() {
  if (state.apiReady) {
    startApiSet();
    return;
  }
  showToast("还没接上 API，先用本地题库开始。");
  startLocalSet();
}

function startLocalSet() {
  const topic = selectedTopic();
  const difficulty = els.difficultySelect.value;
  const strictTopic = state.practiceMode === "chapter";
  const questions = buildQuestionSet(state.bank, topic, difficulty, { strictTopic });

  if (!questions.length) {
    showToast("这个范围暂时没有题，换个章节或难度再试试。");
    return;
  }
  if (strictTopic && difficulty !== "mixed" && countQuestions(topic, difficulty) === 0) {
    showToast("这一章暂时没有这个难度的题，已自动换成同章混合练习。");
  } else if (strictTopic && questions.length < 10) {
    showToast(`这一章目前有 ${questions.length} 道题，先把这一组练熟。`);
  }

  startSet(questions, practiceLabel("本地题库"));
}

async function startApiSet() {
  setLoading(true, "AI 出题中");
  const stats = getStats();
  const weakTopics = getWeakTopics(stats);
  try {
    const payload = await fetchJson("/api/generate-set", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        mode: state.practiceMode,
        topic: selectedTopic(),
        difficulty: els.difficultySelect.value,
        weakTopics
      })
    });
    const modeLabel = practiceLabel(payload.mode === "local" ? "本地题库" : `${payload.mode === "deepseek" ? "DeepSeek" : "AI"} 生成`);
    startSet(payload.questions, modeLabel);
    if (payload.warning) showToast("AI 刚才没出成功，已先切到本地题。");
  } catch {
    showToast("AI 请求失败，先用本地题继续练。");
    startLocalSet();
  } finally {
    setLoading(false);
  }
}

async function startMistakeSet() {
  const mistakeIds = getMistakes();
  const mistakes = mistakeIds.map((id) => state.bank.find((q) => q.id === id)).filter(Boolean);
  if (!mistakes.length) {
    showToast("还没有错题记录，先做完一组再回来练。");
    return;
  }

  if (state.apiReady) {
    setLoading(true, "AI 出错题中");
    try {
      const weakTopics = [...new Set(mistakes.map((question) => question.topic).filter(Boolean))].slice(0, 4);
      const payload = await fetchJson("/api/generate-set", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          mode: "mistake",
          topic: "All",
          difficulty: els.difficultySelect.value,
          weakTopics,
          avoidIds: mistakeIds
        })
      });
      if (payload.mode === "local" && payload.warning) {
        throw new Error(payload.warning);
      }
      const modeLabel = practiceLabel(payload.mode === "local" ? "错题重练" : `${payload.mode === "deepseek" ? "DeepSeek" : "AI"} 错题主题`);
      startSet(payload.questions, modeLabel);
      if (payload.warning) showToast("AI 刚才没出成功，已先切到本地错题。");
      return;
    } catch {
      showToast("AI 请求失败，先用本地错题继续练。");
    } finally {
      setLoading(false);
    }
  }

  const selected = shuffle(mistakes);
  const fill = shuffle(state.bank.filter((q) => !mistakeIds.includes(q.id)));
  startSet([...selected, ...fill].slice(0, 10), "错题重练");
}

function selectedTopic() {
  return state.practiceMode === "chapter" ? els.topicSelect.value : "All";
}

function practiceLabel(sourceLabel) {
  return `${state.practiceMode === "chapter" ? "章节练习" : "10 题模拟"} · ${sourceLabel}`;
}

function buildQuestionSet(bank, topic, difficulty, options = {}) {
  const topicPool = topic && topic !== "All" ? bank.filter((q) => q.topic === topic) : [...bank];
  let primary = [...topicPool];
  if (difficulty !== "mixed") primary = primary.filter((q) => q.difficulty === difficulty);

  if (options.strictTopic) {
    const strictPool = primary.length ? primary : topicPool;
    return shuffle(strictPool).slice(0, 10);
  }

  const primaryIds = new Set(primary.map((q) => q.id));
  const fallback = bank.filter((q) => {
    if (primaryIds.has(q.id)) return false;
    if (difficulty !== "mixed") return q.difficulty === difficulty;
    return true;
  });

  return [...shuffle(primary), ...shuffle(fallback)].slice(0, 10);
}

function startSet(questions, modeLabel) {
  const answerSlots = balancedAnswerSlots(questions.length);
  state.currentSet = questions.map((question, index) => prepareQuestion(question, answerSlots[index]));
  state.currentIndex = 0;
  state.selections = Array(questions.length).fill(null);
  state.submitted = false;
  state.review = null;
  els.resultsPanel.classList.add("hidden");
  els.questionTitle.dataset.mode = modeLabel;
  renderQuestion({ direction: 1, force: true });
  scrollQuizIntoView();
}

function balancedAnswerSlots(count) {
  const slots = [];
  while (slots.length < count) {
    slots.push(...shuffle([0, 1, 2, 3]));
  }
  return slots.slice(0, count);
}

function randomAnswerSlot(currentSet = [], replacingIndex = -1) {
  const recentCounts = optionLabels.map((_, index) =>
    currentSet.filter((question, questionIndex) => questionIndex !== replacingIndex && question.answerIndex === index).length
  );
  const minCount = Math.min(...recentCounts);
  return shuffle([0, 1, 2, 3].filter((index) => recentCounts[index] === minCount))[0];
}

function prepareQuestion(question, preferredAnswerIndex = null) {
  const targetAnswerIndex = Number.isInteger(preferredAnswerIndex)
    ? Math.max(0, Math.min(3, preferredAnswerIndex))
    : Math.floor(Math.random() * 4);
  const correctOption = question.options[question.answerIndex];
  const wrongOptions = question.options
    .map((text, index) => ({ text, index }))
    .filter((option) => option.index !== question.answerIndex);
  const shuffledWrongOptions = shuffle(wrongOptions);
  const arrangedOptions = [];

  for (let index = 0; index < 4; index += 1) {
    if (index === targetAnswerIndex) {
      arrangedOptions.push({ text: correctOption, index: question.answerIndex });
    } else {
      arrangedOptions.push(shuffledWrongOptions.shift());
    }
  }

  return {
    ...question,
    options: arrangedOptions.map((option) => option.text),
    answerIndex: targetAnswerIndex,
    originalAnswerIndex: question.answerIndex
  };
}

function renderQuestion(options = {}) {
  const question = state.currentSet[state.currentIndex];
  if (!question) return;
  const { direction = 0, force = false } = options;

  const selected = state.selections[state.currentIndex];
  const score = state.submitted ? calculateScore().correct : state.selections.filter((value) => value !== null).length;
  els.scoreChip.textContent = state.submitted ? `${score} / ${state.currentSet.length}` : `${score} / ${state.currentSet.length}`;
  els.questionMeta.textContent = `${els.questionTitle.dataset.mode || "练习"} · ${question.topic} · ${question.difficulty}`;
  els.questionTitle.textContent = `第 ${state.currentIndex + 1} 题`;
  els.questionPrompt.textContent = question.prompt;

  els.optionsList.innerHTML = question.options
    .map((option, index) => {
      const classes = ["option-btn"];
      if (selected === index) classes.push("selected");
      if (state.submitted && index === question.answerIndex) classes.push("correct");
      if (state.submitted && selected === index && selected !== question.answerIndex) classes.push("incorrect");
      return `
        <button class="${classes.join(" ")}" style="--delay: ${index}" data-index="${index}" type="button" aria-pressed="${selected === index ? "true" : "false"}">
          <span class="option-key">${optionLabels[index]}</span>
          <span class="option-text">${escapeHtml(option)}</span>
          <span class="option-mark" aria-hidden="true"></span>
        </button>
      `;
    })
    .join("");

  animateQuestion(direction, force);

  renderProgress();
  els.prevBtn.disabled = state.currentIndex === 0;
  els.nextBtn.disabled = state.currentIndex === state.currentSet.length - 1;
  els.submitBtn.disabled = state.submitted;
  els.variantBtn.disabled = state.submitted;
}

function renderProgress() {
  els.progressDots.innerHTML = state.currentSet
    .map((question, index) => {
      const classes = ["dot"];
      if (index === state.currentIndex) classes.push("active");
      if (state.selections[index] !== null) classes.push("answered");
      if (state.submitted && state.selections[index] !== question.answerIndex) classes.push("missed");
      const label = `第 ${index + 1} 题${state.selections[index] !== null ? "，已作答" : ""}`;
      return `<button class="${classes.join(" ")}" data-index="${index}" type="button" aria-label="${label}" aria-current="${index === state.currentIndex ? "step" : "false"}"></button>`;
    })
    .join("");
}

function chooseOption(index) {
  if (state.submitted || !state.currentSet.length) return;
  if (!Number.isInteger(index) || index < 0 || index >= 4) return;
  if (state.selections[state.currentIndex] === index) return;
  state.selections[state.currentIndex] = index;
  renderQuestion();
}

function moveQuestion(delta) {
  const next = state.currentIndex + delta;
  if (next < 0 || next >= state.currentSet.length) return;
  state.currentIndex = next;
  renderQuestion({ direction: delta });
}

function jumpFromProgress(event) {
  const button = event.target.closest(".dot");
  if (!button) return;
  const next = Number(button.dataset.index);
  if (!Number.isInteger(next) || next === state.currentIndex) return;
  const direction = next > state.currentIndex ? 1 : -1;
  state.currentIndex = next;
  renderQuestion({ direction });
}

function handleKeyboard(event) {
  if (isTypingTarget(event.target) || event.metaKey || event.ctrlKey || event.altKey) return;
  if (!state.currentSet.length) return;

  const number = Number(event.key);
  if (number >= 1 && number <= 4) {
    event.preventDefault();
    chooseOption(number - 1);
    return;
  }

  if (event.key === "ArrowLeft") {
    event.preventDefault();
    moveQuestion(-1);
    return;
  }

  if (event.key === "ArrowRight") {
    event.preventDefault();
    moveQuestion(1);
    return;
  }

  if (event.key === "Enter" && !state.submitted && state.selections[state.currentIndex] !== null) {
    event.preventDefault();
    if (state.currentIndex < state.currentSet.length - 1) moveQuestion(1);
    else if (state.selections.every((value) => value !== null)) submitSet();
  }
}

function isTypingTarget(target) {
  const tagName = target?.tagName;
  return target?.isContentEditable || tagName === "INPUT" || tagName === "TEXTAREA" || tagName === "SELECT";
}

function animateQuestion(direction = 0, force = false) {
  if (reduceMotion || (!direction && !force)) return;
  els.questionBody.classList.remove("enter-next", "enter-prev", "enter-pop");
  window.clearTimeout(questionAnimationTimer);
  void els.questionBody.offsetWidth;
  if (direction > 0) els.questionBody.classList.add("enter-next");
  else if (direction < 0) els.questionBody.classList.add("enter-prev");
  else els.questionBody.classList.add("enter-pop");
  questionAnimationTimer = window.setTimeout(() => {
    els.questionBody.classList.remove("enter-next", "enter-prev", "enter-pop");
  }, 420);
}

function scrollQuizIntoView() {
  if (reduceMotion || window.innerWidth > 1040) return;
  els.quizPanel.scrollIntoView({ behavior: "smooth", block: "start" });
}

async function generateVariant() {
  const question = state.currentSet[state.currentIndex];
  if (!question || state.submitted) {
    showToast("交卷后就不换题了。可以开新一组，或者去错题重练。");
    return;
  }

  const originalLabel = els.variantBtn.textContent;
  els.variantBtn.disabled = true;
  els.variantBtn.classList.add("is-busy");
  els.variantBtn.setAttribute("aria-busy", "true");
  els.variantBtn.textContent = "换题中";

  try {
    const payload = await fetchJson("/api/generate-variant", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        question,
        selectedIndex: state.selections[state.currentIndex],
        difficulty: els.difficultySelect.value
      })
    });
    const variant = prepareQuestion(payload.question, randomAnswerSlot(state.currentSet, state.currentIndex));
    state.currentSet[state.currentIndex] = variant;
    state.selections[state.currentIndex] = null;
    renderQuestion({ force: true });
    showToast(payload.mode === "local" ? "AI 暂时没接上，已换成本地同类题。" : "已换成同一个知识点的新题。");
  } catch (error) {
    showToast(error.message || "这次换题没成功，稍后再试。");
  } finally {
    els.variantBtn.disabled = false;
    els.variantBtn.classList.remove("is-busy");
    els.variantBtn.removeAttribute("aria-busy");
    els.variantBtn.textContent = originalLabel;
  }
}

async function submitSet() {
  if (!state.currentSet.length || state.submitted) return;
  state.submitted = true;
  const result = calculateScore();
  saveAttempt(result);
  renderStats();
  renderQuestion({ force: true });
  await renderReview(result);
}

function calculateScore() {
  const wrongAnswers = [];
  let correct = 0;

  state.currentSet.forEach((question, index) => {
    const selectedIndex = state.selections[index];
    if (selectedIndex === question.answerIndex) {
      correct += 1;
    } else {
      wrongAnswers.push({
        questionId: question.id,
        selectedIndex,
        question
      });
    }
  });

  return {
    total: state.currentSet.length,
    correct,
    wrongAnswers,
    accuracy: state.currentSet.length ? correct / state.currentSet.length : 0
  };
}

async function renderReview(result) {
  els.resultsPanel.classList.remove("hidden");
  els.resultTitle.textContent = `得分 ${result.correct} / ${result.total}`;
  els.reviewSummary.textContent = "正在整理错题解析...";
  els.reviewPlan.innerHTML = "";
  els.wrongList.innerHTML = "";
  els.reviewMessageStatus.textContent = "";
  els.reviewMessageStatus.className = "review-message-status";
  if (!reduceMotion) {
    requestAnimationFrame(() => {
      els.resultsPanel.scrollIntoView({ behavior: "smooth", block: "start" });
    });
  }

  try {
    const review = await fetchJson("/api/review", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        total: result.total,
        correct: result.correct,
        accuracy: result.accuracy,
        wrongAnswers: result.wrongAnswers
      })
    });
    state.review = review;
    fillReview(review, result);
  } catch {
    const fallback = {
      summary: "解析暂时没拿到。先按错题章节回看课件，再做一组同主题题。",
      reviewPlan: ["先回看错题对应的课件页。", "再做一组同章题，确认判断规则能用出来。"],
      explanations: []
    };
    fillReview(fallback, result);
  }
}

function fillReview(review, result) {
  els.reviewSummary.textContent = naturalChineseText(review.summary, "这组做完了。先看错题集中在哪些章节，再决定下一组练什么。");
  els.reviewPlan.innerHTML = (review.reviewPlan || [])
    .map((item) => `<div class="plan-item">${escapeHtml(naturalChineseText(item, "回看对应课件，再做一组同主题题。"))}</div>`)
    .join("");

  if (!result.wrongAnswers.length) {
    els.wrongList.innerHTML = `<div class="wrong-item"><h3>这组全对</h3><p>状态不错。下一步可以切到 Hard，或者做一组全章节模拟保持手感。</p></div>`;
    return;
  }

  const explanationMap = new Map((review.explanations || []).map((item) => [item.questionId, item]));
  els.wrongList.innerHTML = result.wrongAnswers
    .map((wrong) => {
      const question = wrong.question;
      const detail = explanationMap.get(question.id);
      const picked = wrong.selectedIndex === null ? "未作答" : question.options[wrong.selectedIndex];
      const correct = question.options[question.answerIndex];
      return `
        <article class="wrong-item">
          <h3>${escapeHtml(question.topic)} · ${escapeHtml(question.subtopic)}</h3>
          <p><strong>题目：</strong>${escapeHtml(question.prompt)}</p>
          <p><strong>你选的是：</strong>${escapeHtml(picked || "未作答")}</p>
          <p><strong>正确答案：</strong>${escapeHtml(correct)}</p>
          <p><strong>为什么：</strong>${escapeHtml(naturalChineseText(detail?.keyIdea, localKeyIdea(question)))}</p>
          <p><strong>接下来：</strong>${escapeHtml(naturalChineseText(detail?.nextAction, localNextAction(question)))}</p>
          <p><strong>来源：</strong>${escapeHtml(question.source)}</p>
        </article>
      `;
    })
    .join("");
}

function localKeyIdea(question) {
  const concept = question.subtopic || question.topic || "这个知识点";
  return `这题考的是 ${concept}。先抓题干里的决策情境，再判断哪个选项最符合课程里的机制或定义。`;
}

function localNextAction(question) {
  const source = question.source || question.topic || "对应课件";
  return `回到 ${source}，把这题背后的判断规则写成一句话，再做一题同主题变体。`;
}

function naturalChineseText(value, fallback) {
  const text = String(value || "").trim();
  return /[\u3400-\u9fff]/.test(text) ? text : fallback;
}

function saveAttempt(result) {
  const stats = getStats();
  const attempt = {
    at: new Date().toISOString(),
    total: result.total,
    correct: result.correct,
    questionIds: state.currentSet.map((q) => q.id),
    wrongIds: result.wrongAnswers.map((w) => w.questionId),
    topics: state.currentSet.map((q, index) => ({
      topic: q.topic,
      correct: state.selections[index] === q.answerIndex
    }))
  };
  stats.attempts.push(attempt);
  stats.mistakes = [...new Set([...stats.mistakes, ...attempt.wrongIds])].filter((id) => !attempt.questionIds.includes(id) || attempt.wrongIds.includes(id));
  localStorage.setItem("smiQuizStats", JSON.stringify(stats));
}

function getStats() {
  try {
    const parsed = JSON.parse(localStorage.getItem("smiQuizStats") || "{}");
    return {
      attempts: Array.isArray(parsed.attempts) ? parsed.attempts : [],
      mistakes: Array.isArray(parsed.mistakes) ? parsed.mistakes : []
    };
  } catch {
    return { attempts: [], mistakes: [] };
  }
}

function getMistakes() {
  return getStats().mistakes;
}

function renderStats() {
  const stats = getStats();
  els.attemptCount.textContent = String(stats.attempts.length);
  const totals = stats.attempts.reduce(
    (acc, attempt) => {
      acc.correct += attempt.correct;
      acc.total += attempt.total;
      return acc;
    },
    { correct: 0, total: 0 }
  );
  els.avgAccuracy.textContent = totals.total ? `${Math.round((totals.correct / totals.total) * 100)}%` : "--";
  renderMastery(stats);
}

function resetStats() {
  localStorage.removeItem("smiQuizStats");
  renderStats();
  showToast("练习记录已重置。");
}

function renderMastery(stats) {
  const topicRows = new Map();
  for (const topic of state.topics.filter((topic) => topic !== "All")) {
    topicRows.set(topic, { correct: 0, total: 0 });
  }
  for (const attempt of stats.attempts) {
    for (const row of attempt.topics || []) {
      const current = topicRows.get(row.topic) || { correct: 0, total: 0 };
      current.total += 1;
      if (row.correct) current.correct += 1;
      topicRows.set(row.topic, current);
    }
  }

  els.masteryGrid.innerHTML = [...topicRows.entries()]
    .map(([topic, row]) => {
      const percent = row.total ? Math.round((row.correct / row.total) * 100) : 0;
      return `
        <div class="mastery-item" title="${escapeHtml(topic)}">
          <span>${escapeHtml(topic)} · ${row.total ? `${percent}%` : "new"}</span>
          <div class="bar"><div class="bar-fill" style="width:${percent}%"></div></div>
        </div>
      `;
    })
    .join("");
}

function getWeakTopics(stats) {
  const rows = new Map();
  for (const attempt of stats.attempts) {
    for (const row of attempt.topics || []) {
      const current = rows.get(row.topic) || { correct: 0, total: 0 };
      current.total += 1;
      if (row.correct) current.correct += 1;
      rows.set(row.topic, current);
    }
  }
  return [...rows.entries()]
    .filter(([, row]) => row.total >= 2)
    .sort((a, b) => a[1].correct / a[1].total - b[1].correct / b[1].total)
    .slice(0, 3)
    .map(([topic]) => topic);
}

function renderSources() {
  els.sourceGrid.innerHTML = state.digest
    .map((entry) => `
      <article class="source-card">
        <h3>${escapeHtml(entry.topic)}</h3>
        <p>${escapeHtml(entry.source)} · ${escapeHtml(entry.pages)}</p>
        <p>${escapeHtml(sourceNotes[entry.topic] || "这部分建议回看课件标题、例子和课堂里的判断规则。")}</p>
      </article>
    `)
    .join("");
}

function renderMessageCount(payload) {
  const count = Number(payload?.count ?? payload?.messages?.length ?? 0);
  els.messageCount.textContent = String(count);
}

async function submitMessage(event) {
  event.preventDefault();
  const text = els.messageText.value.trim();
  if (text.length < 2) {
    showToast("再多写几个字吧，这样大家更能接住你的意思。");
    els.messageText.focus();
    return;
  }

  const originalLabel = els.messageSubmitBtn.textContent;
  els.messageSubmitBtn.disabled = true;
  els.messageSubmitBtn.classList.add("is-busy");
  els.messageSubmitBtn.setAttribute("aria-busy", "true");
  els.messageSubmitBtn.textContent = "发送中";

  try {
    const payload = await createMessage({
      author: els.messageName.value,
      text,
      mood: els.messageMood.value
    });
    renderMessageCount(payload);
    els.messageText.value = "";
    els.messageName.value = "";
    showToast("留言已经贴上墙。");
  } catch (error) {
    showToast(error.message || "留言没发出去，稍后再试一下。");
  } finally {
    els.messageSubmitBtn.disabled = false;
    els.messageSubmitBtn.classList.remove("is-busy");
    els.messageSubmitBtn.removeAttribute("aria-busy");
    els.messageSubmitBtn.textContent = originalLabel;
  }
}

async function submitReviewMessage(event) {
  event.preventDefault();
  const text = els.reviewMessageText.value.trim();
  if (text.length < 2) {
    els.reviewMessageStatus.textContent = "再多写几个字吧，别人更容易接住你的意思。";
    els.reviewMessageStatus.className = "review-message-status error";
    els.reviewMessageText.focus();
    return;
  }

  const originalLabel = els.reviewMessageSubmitBtn.textContent;
  els.reviewMessageSubmitBtn.disabled = true;
  els.reviewMessageSubmitBtn.classList.add("is-busy");
  els.reviewMessageSubmitBtn.setAttribute("aria-busy", "true");
  els.reviewMessageSubmitBtn.textContent = "贴上墙中";
  els.reviewMessageStatus.textContent = "";
  els.reviewMessageStatus.className = "review-message-status";

  try {
    const payload = await createMessage({
      author: els.reviewMessageName.value,
      text,
      mood: els.reviewMessageMood.value
    });
    renderMessageCount(payload);
    els.reviewMessageText.value = "";
    els.reviewMessageName.value = "";
    els.reviewMessageStatus.textContent = "已经贴到留言墙，也会出现在首页留言流里。";
    els.reviewMessageStatus.className = "review-message-status success";
  } catch (error) {
    els.reviewMessageStatus.textContent = error.message || "留言没发出去，稍后再试一下。";
    els.reviewMessageStatus.className = "review-message-status error";
  } finally {
    els.reviewMessageSubmitBtn.disabled = false;
    els.reviewMessageSubmitBtn.classList.remove("is-busy");
    els.reviewMessageSubmitBtn.removeAttribute("aria-busy");
    els.reviewMessageSubmitBtn.textContent = originalLabel;
  }
}

function createMessage({ author, text, mood }) {
  return fetchJson("/api/messages", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ author, text, mood })
  });
}

function setLoading(isLoading, label = "") {
  els.apiSetBtn.disabled = isLoading;
  els.newSetBtn.disabled = isLoading;
  els.mistakeSetBtn.disabled = isLoading;
  els.newSetBtn.classList.toggle("is-busy", isLoading);
  if (isLoading) {
    els.newSetBtn.textContent = label;
    els.newSetBtn.setAttribute("aria-busy", "true");
  }
  else renderPracticeControls();
  if (!isLoading) els.newSetBtn.removeAttribute("aria-busy");
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

function shuffle(items) {
  const copy = [...items];
  for (let i = copy.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy;
}

function escapeHtml(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}
