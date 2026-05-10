const http = require("http");
const crypto = require("crypto");
const fs = require("fs");
const fsp = require("fs/promises");
const path = require("path");

const ROOT = __dirname;
loadEnv();

const PORT = Number(process.env.PORT || 4318);
const HOST = process.env.HOST || "0.0.0.0";
const API_PROVIDER = process.env.API_PROVIDER || (process.env.DEEPSEEK_API_KEY ? "deepseek" : "openai");
const OPENAI_MODEL = process.env.OPENAI_MODEL || "gpt-4.1-mini";
const DEEPSEEK_MODEL = process.env.DEEPSEEK_MODEL || "deepseek-v4-flash";
const DEEPSEEK_BASE_URL = process.env.DEEPSEEK_BASE_URL || "https://api.deepseek.com";
const MODEL_TIMEOUT_MS = Number(process.env.MODEL_TIMEOUT_MS || 70000);
const MESSAGE_FILE = resolveWritableDataPath("messages.json");
const MESSAGE_LIMIT = 200;
const MESSAGE_MOODS = new Set(["sunny", "focus", "brave", "calm", "spark"]);
let messageWriteQueue = Promise.resolve();
const FLAT_PUBLIC_FILES = new Map(
  [
    "index.html",
    "app.js",
    "glossary.js",
    "landing.css",
    "landing.html",
    "landing.js",
    "messages.css",
    "messages.html",
    "messages.js",
    "styles.css",
    "topic-map.svg"
  ].map((name) => [name, path.join(ROOT, name)])
);

const mimeTypes = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "application/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".svg": "image/svg+xml; charset=utf-8",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg"
};

function loadEnv() {
  const envPath = path.join(ROOT, ".env");
  if (!fs.existsSync(envPath)) return;
  const raw = fs.readFileSync(envPath, "utf8");
  for (const line of raw.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const equals = trimmed.indexOf("=");
    if (equals === -1) continue;
    const key = trimmed.slice(0, equals).trim();
    const value = trimmed.slice(equals + 1).trim().replace(/^['"]|['"]$/g, "");
    if (!process.env[key]) process.env[key] = value;
  }
}

function resolveReadablePath(relativePath) {
  const normalized = path.normalize(relativePath).replace(/^(\.\.[/\\])+/, "");
  const direct = path.join(ROOT, normalized);
  if (fs.existsSync(direct)) return direct;

  if (normalized.startsWith(`data${path.sep}`) || normalized.startsWith("data/")) {
    const flatDataPath = path.join(ROOT, path.basename(normalized));
    if (fs.existsSync(flatDataPath)) return flatDataPath;
  }

  if (normalized.startsWith(`public${path.sep}`) || normalized.startsWith("public/")) {
    const publicName = path.basename(normalized);
    const flatPublicPath = FLAT_PUBLIC_FILES.get(publicName);
    if (flatPublicPath && fs.existsSync(flatPublicPath)) return flatPublicPath;
  }

  return direct;
}

function isDirectory(filePath) {
  try {
    return fs.statSync(filePath).isDirectory();
  } catch {
    return false;
  }
}

function resolveWritableDataPath(filename) {
  const dataDir = path.join(ROOT, "data");
  return isDirectory(dataDir) ? path.join(dataDir, filename) : path.join(ROOT, filename);
}

async function readJson(relativePath) {
  const filePath = resolveReadablePath(relativePath);
  return JSON.parse(await fsp.readFile(filePath, "utf8"));
}

async function readMessages() {
  try {
    const messages = JSON.parse(await fsp.readFile(MESSAGE_FILE, "utf8"));
    return Array.isArray(messages) ? messages : [];
  } catch (error) {
    if (error.code === "ENOENT" || error.code === "ENOTDIR") return [];
    throw error;
  }
}

async function writeMessages(messages) {
  await fsp.mkdir(path.dirname(MESSAGE_FILE), { recursive: true });
  await fsp.writeFile(MESSAGE_FILE, `${JSON.stringify(messages, null, 2)}\n`, "utf8");
}

function withMessageWriteLock(task) {
  const run = messageWriteQueue.then(task, task);
  messageWriteQueue = run.catch(() => {});
  return run;
}

async function readCombinedJson(relativePaths) {
  const parts = await Promise.all(
    relativePaths.map(async (relativePath) => {
      const filePath = resolveReadablePath(relativePath);
      try {
        return JSON.parse(await fsp.readFile(filePath, "utf8"));
      } catch (error) {
        if (error.code === "ENOENT" || error.code === "ENOTDIR") return [];
        throw error;
      }
    })
  );
  return parts.flat();
}

async function readQuestionBank() {
  return readCombinedJson([
    "data/question-bank.json",
    "data/report-question-bank.json",
    "data/case-question-bank.json",
    "data/canvas-style-variant-bank.json"
  ]);
}

async function readSourceDigest() {
  return readCombinedJson(["data/source-digest.json", "data/report-source-digest.json", "data/case-source-digest.json"]);
}

async function readExtractedMaterials() {
  try {
    return await readJson("data/extracted-materials.json");
  } catch (error) {
    if (error.code === "ENOENT" || error.code === "ENOTDIR") return [];
    throw error;
  }
}

function sendJson(res, status, payload) {
  res.writeHead(status, { "Content-Type": "application/json; charset=utf-8" });
  res.end(JSON.stringify(payload));
}

function sendText(res, status, text) {
  res.writeHead(status, { "Content-Type": "text/plain; charset=utf-8" });
  res.end(text);
}

function normalizeMessageText(value, maxLength) {
  return String(value ?? "")
    .replace(/[\u0000-\u001f\u007f]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, maxLength);
}

async function readRequestBody(req) {
  const chunks = [];
  for await (const chunk of req) chunks.push(chunk);
  if (!chunks.length) return {};
  const raw = Buffer.concat(chunks).toString("utf8");
  try {
    return JSON.parse(raw);
  } catch {
    return {};
  }
}

function shuffle(items) {
  const copy = [...items];
  for (let i = copy.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy;
}

function hasCjk(value) {
  return /[\u3400-\u9fff]/.test(String(value || ""));
}

function hasEnglishQuestionText(question) {
  return !hasCjk(question.prompt) && Array.isArray(question.options) && question.options.every((option) => !hasCjk(option));
}

function countWords(value) {
  return String(value || "").trim().split(/\s+/).filter(Boolean).length;
}

function hasReasonableQuizLength(question, options = {}) {
  const promptLimit = options.variant ? 65 : 75;
  const optionLimit = options.variant ? 22 : 24;
  const prompt = String(question.prompt || "");
  if (prompt.length > 430 || countWords(prompt) > promptLimit) return false;
  return (question.options || []).every((option) => String(option || "").length <= 170 && countWords(option) <= optionLimit);
}

function naturalChinese(value, fallback) {
  const text = String(value || "").trim();
  return hasCjk(text) ? text : fallback;
}

function questionConceptKey(question = {}) {
  const topic = String(question.topic || "General").trim();
  const concept = String(question.subtopic || question.topic || "General").trim();
  return `${topic}::${concept}`.toLowerCase();
}

function questionMatchesWeakConcept(question, weakConcepts = []) {
  if (!Array.isArray(weakConcepts) || !weakConcepts.length) return false;
  const questionKey = questionConceptKey(question);
  const topic = String(question.topic || "").toLowerCase();
  const subtopic = String(question.subtopic || "").toLowerCase();
  return weakConcepts.some((item) => {
    const concept = String(item?.concept || "").toLowerCase();
    const itemTopic = String(item?.topic || "").toLowerCase();
    const itemKey = `${itemTopic}::${concept}`;
    return (
      (itemKey !== "::" && questionKey === itemKey) ||
      (concept && subtopic === concept) ||
      (concept && subtopic.includes(concept)) ||
      (itemTopic && topic === itemTopic)
    );
  });
}

function localSet(bank, body = {}) {
  const avoid = new Set(body.avoidIds || []);
  if (body.mode === "mistake" && Array.isArray(body.weakConcepts) && body.weakConcepts.length) {
    const exactMatches = bank.filter((q) => !avoid.has(q.id) && questionMatchesWeakConcept(q, body.weakConcepts));
    const weakTopics = new Set(body.weakConcepts.map((item) => String(item.topic || "")).filter(Boolean));
    const topicMatches = bank.filter((q) => !avoid.has(q.id) && !exactMatches.includes(q) && weakTopics.has(q.topic));
    const fill = bank.filter((q) => !avoid.has(q.id) && !weakTopics.has(q.topic));
    return [...shuffle(exactMatches), ...shuffle(topicMatches), ...shuffle(fill)].slice(0, 10);
  }

  const topicPool = bank.filter((q) => {
    if (avoid.has(q.id)) return false;
    if (body.topic && body.topic !== "All") return q.topic === body.topic;
    return true;
  });
  let primary = [...topicPool];
  if (body.difficulty && body.difficulty !== "mixed") primary = primary.filter((q) => q.difficulty === body.difficulty);

  if (body.mode === "chapter" && body.topic && body.topic !== "All") {
    const strictPool = primary.length ? primary : topicPool;
    return shuffle(strictPool).slice(0, 10);
  }

  const primaryIds = new Set(primary.map((q) => q.id));
  const fallback = bank.filter((q) => {
    if (avoid.has(q.id) || primaryIds.has(q.id)) return false;
    if (body.difficulty && body.difficulty !== "mixed") return q.difficulty === body.difficulty;
    return true;
  });

  return [...shuffle(primary), ...shuffle(fallback)].slice(0, 10);
}

function styleReferenceExamples(bank, body = {}, limit = 8) {
  const matchesTopic = (question) => !body.topic || body.topic === "All" || question.topic === body.topic;
  const scopedExamples = bank.filter(matchesTopic);
  const examples = scopedExamples.length ? scopedExamples : bank;
  return shuffle(examples).slice(0, limit);
}

function localVariant(bank, baseQuestion = {}) {
  const sameSubtopic = bank.filter((q) => q.id !== baseQuestion.id && q.topic === baseQuestion.topic && q.subtopic === baseQuestion.subtopic);
  const sameTopic = bank.filter((q) => q.id !== baseQuestion.id && q.topic === baseQuestion.topic);
  const sameDifficulty = sameTopic.filter((q) => q.difficulty === baseQuestion.difficulty);
  const sameSubtopicAndDifficulty = sameSubtopic.filter((q) => q.difficulty === baseQuestion.difficulty);
  const fallback =
    sameSubtopicAndDifficulty.length
      ? sameSubtopicAndDifficulty
      : sameSubtopic.length
        ? sameSubtopic
        : sameDifficulty.length
          ? sameDifficulty
          : sameTopic.length
            ? sameTopic
            : bank.filter((q) => q.id !== baseQuestion.id);
  const picked = shuffle(fallback)[0] || shuffle(bank)[0] || baseQuestion;

  return {
    ...picked,
    id: `local-variant-${Date.now()}`,
    variantOf: baseQuestion.id || picked.id,
    generated: false
  };
}

function buildLocalReview(wrongAnswers, bank) {
  if (!wrongAnswers.length) {
    return {
      mode: "local",
      summary: "这组没有错题，手感很好。下一步可以切到 Hard，或者挑一个薄弱章节继续稳一稳。",
      reviewPlan: [
        "保持 10 题一组的节奏，隔一段时间做一次全章节模拟。",
        "切到 Hard 难度，确认概念题和计算题都能稳定拿下。"
      ],
      explanations: []
    };
  }

  const byTopic = new Map();
  const explanations = wrongAnswers.map((wrong) => {
    const question = wrong.question || bank.find((q) => q.id === wrong.questionId);
    if (question?.topic) byTopic.set(question.topic, (byTopic.get(question.topic) || 0) + 1);
    const correct = question?.options?.[question.answerIndex] || "正确选项";
    const picked = typeof wrong.selectedIndex === "number" ? question?.options?.[wrong.selectedIndex] : "未作答";
    return {
      questionId: question?.id || wrong.questionId,
      topic: question?.topic || "Unknown",
      whyWrong: `你选的是「${picked || "未作答"}」，正确答案是「${correct}」。`,
      keyIdea: `这题考的是 ${question?.subtopic || question?.topic || "对应知识点"}。先抓题干里的决策情境，再判断哪个选项最符合课程里的机制或定义。`,
      nextAction: `回到 ${question?.source || question?.topic || "对应课件"}，把这题背后的判断规则写成一句话，再做一题同主题变体。`
    };
  });

  const weakTopics = [...byTopic.entries()].sort((a, b) => b[1] - a[1]).map(([topic]) => topic);
  return {
    mode: "local",
    summary: `错题主要落在 ${weakTopics.slice(0, 2).join("、") || "几个知识点"}。先把判断规则补上，再做同主题新题。`,
    reviewPlan: weakTopics.slice(0, 3).map((topic) => `复习 ${topic}：先回看课件摘要，再连续做 5 道同主题题。`),
    explanations
  };
}

function conceptTokens(value) {
  return String(value || "")
    .toLowerCase()
    .split(/[^a-z0-9\u3400-\u9fff]+/i)
    .filter((token) => token.length > 1);
}

function scoreTextForQuery(text, query, tokens) {
  const haystack = String(text || "").toLowerCase();
  const normalizedQuery = String(query || "").toLowerCase();
  let score = 0;
  if (normalizedQuery && haystack.includes(normalizedQuery)) score += 8;
  for (const token of tokens) {
    if (haystack.includes(token)) score += 2;
  }
  return score;
}

function scoreQuestionForQuery(question, query, tokens) {
  const topicText = `${question.topic || ""} ${question.subtopic || ""}`.toLowerCase();
  const bodyText = [
    question.prompt,
    ...(question.options || []),
    question.explanation,
    question.reviewHint,
    question.source
  ].join(" ");
  return scoreTextForQuery(topicText, query, tokens) * 2 + scoreTextForQuery(bodyText, query, tokens);
}

function scoreDigestForQuery(entry, query, tokens) {
  return scoreTextForQuery([entry.topic, entry.source, ...(entry.keyIdeas || [])].join(" "), query, tokens);
}

function findConceptContext(bank, digest, query) {
  const tokens = conceptTokens(query);
  const scoredQuestions = bank
    .map((question) => ({ question, score: scoreQuestionForQuery(question, query, tokens) }))
    .filter((item) => item.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, 10)
    .map((item) => item.question);
  const scoredDigest = digest
    .map((entry) => ({ entry, score: scoreDigestForQuery(entry, query, tokens) }))
    .filter((item) => item.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, 5)
    .map((item) => item.entry);

  return {
    questions: scoredQuestions,
    digest: scoredDigest
  };
}

function compactQuestionContext(questions) {
  return questions.map((question) => ({
    topic: question.topic,
    subtopic: question.subtopic,
    source: question.source,
    prompt: question.prompt,
    correctAnswer: question.options?.[question.answerIndex],
    explanation: question.explanation,
    reviewHint: question.reviewHint
  }));
}

function uniqueNonEmpty(items, limit = 5) {
  return [...new Set(items.map((item) => String(item || "").trim()).filter(Boolean))].slice(0, limit);
}

function buildLocalConceptAnswer(query, bank, digest) {
  const context = findConceptContext(bank, digest, query);
  const topQuestion = context.questions[0];
  const relatedDigest = context.digest[0];

  if (!topQuestion && !relatedDigest) {
    return {
      mode: "local",
      query,
      answer: `这个搜索只回答 Strategic Market Intelligence 课程相关内容。题库里暂时没有直接命中「${query}」，所以我不会展开无关解释。可以换成课件里的英文术语再搜一次。`,
      keyPoints: [
        "搜索范围限定在本课程题库、课件摘要、case 和课堂报告相关概念。",
        "尽量搜索英文概念名，和正式考试的表达更接近。",
        "如果只记得中文，可以搜对应章节名，例如 Pricing、Competition 或 Segmentation。",
        "搜不到时，先回到课程资料索引看相关章节，再做一题同章练习。"
      ],
      example: "可以输入：price discrimination、backward induction、trigger strategy。",
      relatedQuestions: [],
      sourceNote: "本地题库未找到高相关来源。",
      suggestions: ["换一个更短、更像课件标题的关键词。", "优先使用课件里的英文术语。"]
    };
  }

  const topicName = topQuestion?.subtopic || topQuestion?.topic || relatedDigest?.topic || query;
  const sourceNote = uniqueNonEmpty([
    topQuestion?.source,
    relatedDigest ? `${relatedDigest.source} p.${relatedDigest.pages}` : ""
  ]).join("；");
  const keyPoints = uniqueNonEmpty([
    ...(relatedDigest?.keyIdeas || []),
    ...context.questions.map((question) => question.explanation),
    ...context.questions.map((question) => question.reviewHint)
  ], 4);
  const relatedQuestions = context.questions.slice(0, 3).map((question) => question.prompt);

  return {
    mode: "local",
    query,
    answer: `题库里和「${query}」最接近的是 ${topicName}。先把它当作一个判断工具：看题干里的参与者、信息、激励和约束，再决定哪个选项符合课程里的机制。`,
    keyPoints: keyPoints.length
      ? keyPoints
      : ["先抓关键词，再判断它属于定价、竞争、信息不对称、渠道还是产品策略。"],
    example: topQuestion
      ? `相关题型：${topQuestion.prompt} 正确判断会落在「${topQuestion.options?.[topQuestion.answerIndex] || "对应机制"}」。`
      : `相关章节：${relatedDigest.topic}。`,
    relatedQuestions,
    sourceNote: sourceNote || "本地题库",
    suggestions: [
      "把这个概念和相近概念放在一起比较，考试里最容易卡在这些边界上。",
      "搜完后做一题同主题变体，确认自己不是只记住了定义。"
    ]
  };
}

function validateConceptAnswer(payload, query, fallback) {
  const keyPoints = Array.isArray(payload?.keyPoints) ? payload.keyPoints : [];
  const relatedQuestions = Array.isArray(payload?.relatedQuestions) ? payload.relatedQuestions : [];
  const suggestions = Array.isArray(payload?.suggestions) ? payload.suggestions : [];
  return {
    query,
    answer: naturalChinese(payload?.answer, fallback.answer),
    keyPoints: keyPoints.length ? uniqueNonEmpty(keyPoints, 5) : fallback.keyPoints,
    example: naturalChinese(payload?.example, fallback.example),
    relatedQuestions: relatedQuestions.length ? uniqueNonEmpty(relatedQuestions, 4) : fallback.relatedQuestions,
    sourceNote: String(payload?.sourceNote || fallback.sourceNote || "").trim(),
    suggestions: suggestions.length ? uniqueNonEmpty(suggestions, 3) : fallback.suggestions
  };
}

async function handleConceptSearch(req, res) {
  const body = await readRequestBody(req);
  const query = normalizeMessageText(body.query, 120);

  if (query.length < 2) {
    return sendJson(res, 400, { error: "请输入至少 2 个字符。" });
  }

  const [bank, digest] = await Promise.all([readQuestionBank(), readSourceDigest()]);
  const fallback = buildLocalConceptAnswer(query, bank, digest);
  const context = findConceptContext(bank, digest, query);

  if (!context.questions.length && !context.digest.length) {
    return sendJson(res, 200, fallback);
  }

  const config = apiConfig();

  if (!config.configured) {
    return sendJson(res, 200, fallback);
  }

  const prompt = [
    "You answer concept-search questions for a Strategic Market Intelligence final review website.",
    "Use ONLY the supplied question bank context and course digest. Do not invent course facts.",
    "Only answer course-related concepts. If the query drifts outside this course context, clearly refuse in Chinese and suggest relevant Strategic Market Intelligence terms.",
    "Answer in natural Chinese. Whenever you use a Chinese course term, immediately add the English original in parentheses, for example: 合谋（collusion）, 道德风险（moral hazard）, 细分（segmentation）.",
    "Be concise and useful for multiple-choice review.",
    "Return only valid JSON with this shape: {\"answer\":\"中文解释\",\"keyPoints\":[\"中文要点\"],\"example\":\"中文例子，可引用英文题干或选项\",\"relatedQuestions\":[\"English question prompt from the bank if useful\"],\"sourceNote\":\"来源说明\",\"suggestions\":[\"中文复习建议\"]}",
    "If the concept is not found in the context, say that clearly and suggest nearby searchable terms from the context.",
    "",
    `Student query: ${query}`,
    "",
    "Most relevant question-bank items:",
    JSON.stringify(compactQuestionContext(context.questions), null, 2),
    "",
    "Relevant course digest:",
    JSON.stringify(context.digest.length ? context.digest : digest.slice(0, 8), null, 2)
  ].join("\n");

  try {
    const payload = await callModel(prompt);
    return sendJson(res, 200, {
      mode: config.provider,
      ...validateConceptAnswer(payload, query, fallback)
    });
  } catch (error) {
    return sendJson(res, 200, {
      ...fallback,
      warning: error.message
    });
  }
}

function pickDigest(sourceDigest, topic, weakTopics = []) {
  const preferred = topic && topic !== "All" ? [topic] : weakTopics;
  const selected = sourceDigest.filter((entry) => preferred.includes(entry.topic));
  return selected.length ? selected : sourceDigest;
}

function sourceNamesFromDigest(selectedDigest) {
  const names = new Set();
  for (const entry of selectedDigest) {
    for (const part of String(entry.source || "").split(";")) {
      const trimmed = part.trim();
      if (trimmed) names.add(trimmed);
    }
  }
  return names;
}

function compactSourceText(materials, selectedDigest, maxChars = 12000) {
  const selectedNames = sourceNamesFromDigest(selectedDigest);
  const selectedMaterials = materials.filter((item) => selectedNames.has(item.source));
  const pool = selectedMaterials.length ? selectedMaterials : materials.slice(0, 8);
  const chunks = [];
  let used = 0;

  for (const material of pool) {
    for (const page of material.pages || []) {
      const normalized = String(page.text || "").replace(/\s+/g, " ").trim();
      if (!normalized) continue;
      const header = `[${material.source} p.${page.page}] `;
      const room = maxChars - used - header.length - 2;
      if (room <= 0) return chunks.join("\n");
      const excerpt = normalized.slice(0, Math.min(room, 1400));
      chunks.push(`${header}${excerpt}`);
      used += header.length + excerpt.length + 1;
    }
  }

  return chunks.join("\n");
}

function apiConfig() {
  if (API_PROVIDER === "deepseek") {
    return {
      provider: "deepseek",
      configured: Boolean(process.env.DEEPSEEK_API_KEY),
      model: process.env.DEEPSEEK_MODEL || DEEPSEEK_MODEL
    };
  }
  return {
    provider: "openai",
    configured: Boolean(process.env.OPENAI_API_KEY),
    model: process.env.OPENAI_MODEL || OPENAI_MODEL
  };
}

async function callModel(prompt) {
  return API_PROVIDER === "deepseek" ? callDeepSeek(prompt) : callOpenAI(prompt);
}

async function fetchModel(url, options, provider) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), MODEL_TIMEOUT_MS);
  try {
    return await fetch(url, { ...options, signal: controller.signal });
  } catch (error) {
    if (error.name === "AbortError") {
      throw new Error(`${provider} API timed out after ${Math.round(MODEL_TIMEOUT_MS / 1000)}s.`);
    }
    throw error;
  } finally {
    clearTimeout(timeout);
  }
}

async function callDeepSeek(prompt) {
  const apiKey = process.env.DEEPSEEK_API_KEY;
  if (!apiKey) throw new Error("DEEPSEEK_API_KEY is not configured.");

  const response = await fetchModel(`${DEEPSEEK_BASE_URL.replace(/\/$/, "")}/chat/completions`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`
    },
    body: JSON.stringify({
      model: process.env.DEEPSEEK_MODEL || DEEPSEEK_MODEL,
      messages: [
        {
          role: "system",
          content: "You are a precise teaching assistant. Use only the provided Strategic Market Intelligence course materials. Return valid JSON only."
        },
        { role: "user", content: prompt }
      ],
      response_format: { type: "json_object" },
      thinking: { type: "disabled" },
      temperature: 0.4,
      max_tokens: 4000,
      stream: false
    })
  }, "DeepSeek");

  if (!response.ok) {
    const detail = await response.text();
    throw new Error(`DeepSeek API error ${response.status}: ${detail.slice(0, 500)}`);
  }

  const payload = await response.json();
  const text = extractResponseText(payload);
  if (!text) throw new Error("DeepSeek API returned no text.");
  return parseJsonFromText(text);
}

async function callOpenAI(prompt) {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) throw new Error("OPENAI_API_KEY is not configured.");

  const response = await fetchModel("https://api.openai.com/v1/responses", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`
    },
    body: JSON.stringify({
      model: process.env.OPENAI_MODEL || OPENAI_MODEL,
      input: prompt
    })
  }, "OpenAI");

  if (!response.ok) {
    const detail = await response.text();
    throw new Error(`OpenAI API error ${response.status}: ${detail.slice(0, 500)}`);
  }

  const payload = await response.json();
  const text = extractResponseText(payload);
  if (!text) throw new Error("OpenAI API returned no text.");
  return parseJsonFromText(text);
}

function extractResponseText(payload) {
  if (payload.output_text) return payload.output_text;
  if (Array.isArray(payload.output)) {
    return payload.output
      .flatMap((item) => item.content || [])
      .map((content) => content.text || content.output_text || "")
      .join("\n")
      .trim();
  }
  if (payload.choices?.[0]?.message?.content) return payload.choices[0].message.content;
  return "";
}

function parseJsonFromText(text) {
  try {
    return JSON.parse(text);
  } catch {
    const match = text.match(/\{[\s\S]*\}|\[[\s\S]*\]/);
    if (!match) throw new Error("Response was not JSON.");
    return JSON.parse(match[0]);
  }
}

function validateGeneratedQuestions(payload) {
  const questions = Array.isArray(payload) ? payload : payload.questions;
  if (!Array.isArray(questions)) return [];
  return questions
    .filter(
      (q) =>
        q.prompt &&
        Array.isArray(q.options) &&
        q.options.length === 4 &&
        Number.isInteger(q.answerIndex) &&
        hasEnglishQuestionText(q) &&
        hasReasonableQuizLength(q)
    )
    .slice(0, 10)
    .map((q, index) => ({
      id: `api-${Date.now()}-${index + 1}`,
      topic: q.topic || "API Generated",
      subtopic: q.subtopic || "Generated",
      difficulty: q.difficulty || "medium",
      source: q.source || "Generated from course digest",
      prompt: q.prompt,
      options: q.options,
      answerIndex: Math.max(0, Math.min(3, q.answerIndex)),
      explanation: naturalChinese(q.explanation, "这题考的是课程里的对应概念。先看题干情境，再判断哪个选项最符合课件里的机制。"),
      reviewHint: naturalChinese(q.reviewHint, "回到对应课件，把这题背后的判断规则用一句话写下来。"),
      generated: true
    }));
}

function validateVariantQuestion(payload, baseQuestion = {}) {
  const raw = payload?.question || (Array.isArray(payload?.questions) ? payload.questions[0] : payload);
  if (
    !raw ||
    !raw.prompt ||
    !Array.isArray(raw.options) ||
    raw.options.length !== 4 ||
    !Number.isInteger(raw.answerIndex) ||
    !hasEnglishQuestionText(raw) ||
    !hasReasonableQuizLength(raw, { variant: true })
  ) {
    return null;
  }

  return {
    id: `api-variant-${Date.now()}`,
    variantOf: baseQuestion.id,
    topic: raw.topic || baseQuestion.topic || "API Generated",
    subtopic: raw.subtopic || baseQuestion.subtopic || "Generated Variant",
    difficulty: raw.difficulty || baseQuestion.difficulty || "medium",
    source: raw.source || baseQuestion.source || "Generated from course materials",
    prompt: raw.prompt,
    options: raw.options,
    answerIndex: Math.max(0, Math.min(3, raw.answerIndex)),
    explanation: naturalChinese(raw.explanation, "这道变体题考的是同一个知识点，只是换了情境。重点看题干里的决策条件有没有变。"),
    reviewHint: naturalChinese(raw.reviewHint, `再做一题 ${baseQuestion.subtopic || baseQuestion.topic || "同主题"} 题，确认不是只记住了原题答案。`),
    generated: true
  };
}

async function handleGenerateSet(req, res) {
  const body = await readRequestBody(req);
  const [bank, digest, materials] = await Promise.all([readQuestionBank(), readSourceDigest(), readExtractedMaterials()]);

  const config = apiConfig();
  if (!config.configured) {
    return sendJson(res, 200, { mode: "local", questions: localSet(bank, body) });
  }

  const selectedDigest = pickDigest(digest, body.topic, body.weakTopics);
  const sourceText = compactSourceText(materials, selectedDigest, 14000);
  const examples = styleReferenceExamples(bank, body, 8);
  const isChapterMode = body.mode === "chapter" && body.topic && body.topic !== "All";
  const isMistakeMode = body.mode === "mistake";
  const prompt = [
    "You generate exam-style multiple-choice practice questions for a Strategic Market Intelligence course.",
    "Use only the supplied course materials. Generate exactly 10 questions.",
    "Return only valid JSON with this shape: {\"questions\":[{\"topic\":\"\",\"subtopic\":\"\",\"difficulty\":\"easy|medium|hard\",\"source\":\"course source/page if known\",\"prompt\":\"English question text only\",\"options\":[\"English option A\",\"English option B\",\"English option C\",\"English option D\"] ,\"answerIndex\":0,\"explanation\":\"中文解析\",\"reviewHint\":\"中文复习建议\"}]}",
    "The exam is in English: prompt and all four options MUST be English. Do not put Chinese in prompt or options.",
    "The student review experience is Chinese: explanation and reviewHint MUST be natural Chinese.",
    "Whenever explanation or reviewHint uses a Chinese course term, immediately add the English original in parentheses, for example: 合谋（collusion）.",
    "Every question, correct answer, explanation, and review hint must be explainable by the supplied course digest/source excerpts or by standard concepts clearly present in those materials.",
    "Stay within course scope. If the source context is weak for a requested concept, choose a better-supported course concept instead. Never invent case facts, numbers, definitions, causal claims, or unsupported exceptions.",
    "Make options plausible but keep one unambiguously correct answer. Avoid copying the example questions.",
    "Keep questions short, direct, and concept-focused. Mirror the real quiz style: most stems should be one sentence and 6-30 words; applied scenarios may be 1-2 sentences but should normally stay under 55 words. Options should usually be 1-12 words and never become long paragraphs.",
    "Use the examples only as public-safe style references, not as text to copy.",
    "Prefer course-specific facts, case numbers, definitions, and strategic trade-offs over generic marketing trivia.",
    "",
    `Practice mode: ${
      isChapterMode
        ? "chapter practice; keep all questions within the requested topic"
        : isMistakeMode
          ? "mistake-topic practice; generate fresh variants around the weak topics and avoid copying previous missed questions"
          : "10-question mock exam; mix topics across the course"
    }`,
    `Requested topic: ${body.topic || "All"}`,
    `Requested difficulty: ${body.difficulty || "mixed"}`,
    `Weak topics: ${(body.weakTopics || []).join(", ") || "none yet"}`,
    `Weak concepts from the student's missed-concept notebook: ${Array.isArray(body.weakConcepts) ? body.weakConcepts.map((item) => `${item.topic || "Unknown"} / ${item.concept || "Unknown"} (${item.count || 1})`).join("; ") : "none yet"}`,
    "",
    "Course digest:",
    JSON.stringify(selectedDigest, null, 2),
    "",
    "Course source excerpts:",
    sourceText || "No extracted source text available.",
    "",
    "Example question style:",
    JSON.stringify(examples, null, 2)
  ].join("\n");

  try {
    const payload = await callModel(prompt);
    const questions = validateGeneratedQuestions(payload);
    if (questions.length < 10) throw new Error("Generated fewer than 10 valid questions.");
    return sendJson(res, 200, { mode: config.provider, questions });
  } catch (error) {
    return sendJson(res, 200, {
      mode: "local",
      warning: error.message,
      questions: localSet(bank, body)
    });
  }
}

async function handleGenerateVariant(req, res) {
  const body = await readRequestBody(req);
  const baseQuestion = body.question || {};
  const [bank, digest, materials] = await Promise.all([readQuestionBank(), readSourceDigest(), readExtractedMaterials()]);
  const config = apiConfig();

  if (!baseQuestion.prompt || !Array.isArray(baseQuestion.options)) {
    return sendJson(res, 400, { error: "缺少可生成变体的原题。" });
  }

  if (!config.configured) {
    return sendJson(res, 200, { mode: "local", question: localVariant(bank, baseQuestion) });
  }

  const selectedDigest = pickDigest(digest, baseQuestion.topic, []);
  const sourceText = compactSourceText(materials, selectedDigest, 9000);
  const localExamples = bank
    .filter((q) => q.id !== baseQuestion.id && q.topic === baseQuestion.topic)
    .slice(0, 4);
  const selectedOption =
    typeof body.selectedIndex === "number" ? baseQuestion.options?.[body.selectedIndex] || "none selected" : "none selected yet";

  const prompt = [
    "Generate one exam-style multiple-choice VARIANT for a Strategic Market Intelligence course.",
    "Use only the supplied course materials and the same underlying knowledge point as the original question.",
    "The new question must test the same concept, but use different wording, framing, surface scenario, numbers, or answer traps.",
    "Do not merely paraphrase the original. Do not copy the same answer choices.",
    "Change at least two of these: decision context, actor, market situation, numeric condition, inference direction, or likely misconception.",
    "If the original is a definition question, turn the variant into a short applied scenario where the student must recognize the concept in action.",
    "Return only valid JSON with this shape: {\"question\":{\"topic\":\"\",\"subtopic\":\"\",\"difficulty\":\"easy|medium|hard\",\"source\":\"course source/page if known\",\"prompt\":\"English question text only\",\"options\":[\"English option A\",\"English option B\",\"English option C\",\"English option D\"] ,\"answerIndex\":0,\"explanation\":\"中文解析\",\"reviewHint\":\"中文复习建议\"}}",
    "The exam is in English: prompt and all four options MUST be English. Do not put Chinese in prompt or options.",
    "The student review experience is Chinese: explanation and reviewHint MUST be natural Chinese.",
    "Whenever explanation or reviewHint uses a Chinese course term, immediately add the English original in parentheses, for example: 道德风险（moral hazard）.",
    "The answer and explanation must be grounded in the supplied course digest/source excerpts or a standard concept clearly present in those materials. Never invent facts, names, numbers, or unsupported exceptions.",
    "Keep the variant close to the real quiz length. The stem should normally be 8-35 words, with a hard maximum near 60 words only when a short scenario is necessary. Each option should be concise, usually 1-12 words.",
    "Keep exactly one unambiguously correct option.",
    "",
    `Requested difficulty: ${body.difficulty || baseQuestion.difficulty || "mixed"}`,
    `Original topic: ${baseQuestion.topic || "unknown"}`,
    `Original subtopic: ${baseQuestion.subtopic || "unknown"}`,
    `User selected option before variant: ${selectedOption}`,
    "",
    "Original question:",
    JSON.stringify(baseQuestion, null, 2),
    "",
    "Relevant course digest:",
    JSON.stringify(selectedDigest, null, 2),
    "",
    "Course source excerpts:",
    sourceText || "No extracted source text available.",
    "",
    "Nearby local examples for style, not to copy:",
    JSON.stringify(localExamples, null, 2)
  ].join("\n");

  try {
    const payload = await callModel(prompt);
    const question = validateVariantQuestion(payload, baseQuestion);
    if (!question) throw new Error("Generated variant was not valid.");
    return sendJson(res, 200, { mode: config.provider, question });
  } catch (error) {
    return sendJson(res, 200, {
      mode: "local",
      warning: error.message,
      question: localVariant(bank, baseQuestion)
    });
  }
}

async function handleReview(req, res) {
  const body = await readRequestBody(req);
  const [bank, digest, materials] = await Promise.all([readQuestionBank(), readSourceDigest(), readExtractedMaterials()]);
  const wrongAnswers = Array.isArray(body.wrongAnswers) ? body.wrongAnswers : [];
  const config = apiConfig();

  if (!config.configured) {
    return sendJson(res, 200, buildLocalReview(wrongAnswers, bank));
  }

  const wrongWithContext = wrongAnswers.map((wrong) => {
    const q = wrong.question || bank.find((item) => item.id === wrong.questionId);
    return {
      questionId: wrong.questionId,
      topic: q?.topic,
      prompt: q?.prompt,
      options: q?.options,
      selectedOption: typeof wrong.selectedIndex === "number" ? q?.options?.[wrong.selectedIndex] : "unanswered",
      correctOption: q?.options?.[q?.answerIndex],
      explanation: q?.explanation,
      source: q?.source
    };
  });
  const weakTopics = [...new Set(wrongWithContext.map((item) => item.topic).filter(Boolean))];
  const selectedDigest = pickDigest(digest, "All", weakTopics);
  const sourceText = compactSourceText(materials, selectedDigest, 10000);

  const prompt = [
    "You are a concise teaching assistant for a Strategic Market Intelligence final exam review.",
    "Explain the student's result in natural Chinese. If there are missed questions, explain only those missed questions. If there are no missed questions, give a short next-step review plan and return an empty explanations array.",
    "Return only valid JSON with this shape: {\"summary\":\"\",\"reviewPlan\":[\"\",\"\"],\"explanations\":[{\"questionId\":\"\",\"topic\":\"\",\"whyWrong\":\"\",\"keyIdea\":\"\",\"nextAction\":\"\"}]}",
    "summary, reviewPlan, whyWrong, keyIdea, and nextAction MUST be Chinese. It is fine to quote English answer choices when referring to the student's selected option or the correct option.",
    "Whenever you use a Chinese course term, immediately add the English original in parentheses, for example: 筛选（screening）, 价格弹性（price elasticity）.",
    "Every explanation must be traceable to the supplied course excerpts or to the specific missed question's stated concept. If the source context is not enough, say the student should verify it in class materials; do not guess or over-explain.",
    "Do not be verbose. Do not introduce unrelated concepts. Avoid generic AI-sounding encouragement; write like a helpful classmate who knows the material.",
    "",
    `Score: ${Number(body.correct ?? 0)} / ${Number(body.total ?? wrongAnswers.length)}`,
    `Accuracy: ${Math.round(Number(body.accuracy ?? 0) * 100)}%`,
    "",
    "Relevant course source excerpts:",
    sourceText || "No extracted source text available.",
    "",
    "Missed questions:",
    JSON.stringify(wrongWithContext, null, 2)
  ].join("\n");

  try {
    const payload = await callModel(prompt);
    return sendJson(res, 200, { mode: config.provider, ...payload });
  } catch (error) {
    return sendJson(res, 200, {
      ...buildLocalReview(wrongAnswers, bank),
      warning: error.message
    });
  }
}

async function handleCreateMessage(req, res) {
  const body = await readRequestBody(req);
  const text = normalizeMessageText(body.text, 220);
  const author = normalizeMessageText(body.author, 24) || "匿名同学";
  const mood = MESSAGE_MOODS.has(body.mood) ? body.mood : "sunny";

  if (text.length < 2) {
    return sendJson(res, 400, { error: "留言至少需要 2 个字符。" });
  }

  return withMessageWriteLock(async () => {
    const messages = await readMessages();
    const now = Date.now();
    const recentDuplicate = messages.find((item) => {
      const createdAt = new Date(item.createdAt).getTime();
      return (
        item.text === text &&
        item.author === author &&
        Number.isFinite(createdAt) &&
        now - createdAt < 15000
      );
    });
    if (recentDuplicate) {
      return sendJson(res, 200, { message: recentDuplicate, count: messages.length });
    }

    const message = {
      id: crypto.randomUUID(),
      author,
      text,
      mood,
      createdAt: new Date().toISOString()
    };
    const nextMessages = [message, ...messages].slice(0, MESSAGE_LIMIT);
    await writeMessages(nextMessages);
    return sendJson(res, 201, { message, count: nextMessages.length });
  });
}

async function serveStatic(req, res, pathname) {
  const fallback = pathname === "/" ? "/public/index.html" : pathname;
  if (!fallback.startsWith("/public/")) return sendText(res, 404, "Not found");
  const filePath = path.normalize(resolveReadablePath(fallback.slice(1)));
  if (!filePath.startsWith(ROOT)) return sendText(res, 403, "Forbidden");

  try {
    const stat = await fsp.stat(filePath);
    if (stat.isDirectory()) return sendText(res, 404, "Not found");
    const ext = path.extname(filePath).toLowerCase();
    res.writeHead(200, { "Content-Type": mimeTypes[ext] || "application/octet-stream" });
    fs.createReadStream(filePath).pipe(res);
  } catch {
    sendText(res, 404, "Not found");
  }
}

const requestHandler = async (req, res) => {
  const requestUrl = new URL(req.url, `http://${req.headers.host}`);
  const pathname = decodeURIComponent(requestUrl.pathname);

  try {
    if (req.method === "GET" && pathname === "/api/status") {
      const bank = await readQuestionBank();
      const config = apiConfig();
      return sendJson(res, 200, {
        hasApiKey: config.configured,
        provider: config.provider,
        model: config.model,
        questionCount: bank.length
      });
    }

    if (req.method === "GET" && pathname === "/api/bank") {
      return sendJson(res, 200, await readQuestionBank());
    }

    if (req.method === "GET" && pathname === "/api/source-digest") {
      return sendJson(res, 200, await readSourceDigest());
    }

    if (req.method === "GET" && pathname === "/api/messages") {
      const messages = await readMessages();
      return sendJson(res, 200, { messages, count: messages.length });
    }

    if (req.method === "POST" && pathname === "/api/generate-set") {
      return await handleGenerateSet(req, res);
    }

    if (req.method === "POST" && pathname === "/api/generate-variant") {
      return await handleGenerateVariant(req, res);
    }

    if (req.method === "POST" && pathname === "/api/review") {
      return await handleReview(req, res);
    }

    if (req.method === "POST" && pathname === "/api/concept-search") {
      return await handleConceptSearch(req, res);
    }

    if (req.method === "POST" && pathname === "/api/messages") {
      return await handleCreateMessage(req, res);
    }

    return await serveStatic(req, res, pathname);
  } catch (error) {
    sendJson(res, 500, { error: error.message });
  }
};

function startServer(port) {
  const server = http.createServer(requestHandler);
  server.once("error", (error) => {
    if ((error.code === "EADDRINUSE" || error.code === "EPERM") && port < PORT + 20) {
      startServer(port + 1);
      return;
    }
    throw error;
  });
  server.listen(port, HOST, () => {
    const displayHost = HOST === "0.0.0.0" ? "127.0.0.1" : HOST;
    console.log(`Strategic Market Intelligence Quiz Lab running at http://${displayHost}:${port}`);
  });
}

startServer(PORT);
