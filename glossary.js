(() => {
  const glossary = [
    ["最惠客户条款", "most-favored-customer clause"],
    ["交易前信息不对称", "pre-contract information asymmetry"],
    ["交易后隐藏行动", "post-contract hidden action"],
    ["同时行动博弈", "simultaneous-move game"],
    ["顺序行动博弈", "sequential-move game"],
    ["逆向归纳", "backward induction"],
    ["纳什均衡", "Nash equilibrium"],
    ["占优策略", "dominant strategy"],
    ["主导策略", "dominant strategy"],
    ["劣势策略", "dominated strategy"],
    ["反应函数", "reaction function"],
    ["伯川德竞争", "Bertrand competition"],
    ["库诺竞争", "Cournot competition"],
    ["斯塔克伯格竞争", "Stackelberg competition"],
    ["触发策略", "trigger strategy"],
    ["重复博弈", "repeated game"],
    ["合作机制", "cooperation mechanism"],
    ["道德风险", "moral hazard"],
    ["逆向选择", "adverse selection"],
    ["筛选机制", "screening mechanism"],
    ["信号机制", "signaling mechanism"],
    ["反信号", "counter-signaling"],
    ["价格歧视", "price discrimination"],
    ["第二高价拍卖", "second-price auction"],
    ["价格弹性", "price elasticity"],
    ["价格承诺", "price commitment"],
    ["价格竞争", "price competition"],
    ["价格战", "price war"],
    ["边际成本", "marginal cost"],
    ["消费者剩余", "consumer surplus"],
    ["容量限制", "capacity constraint"],
    ["搜索成本", "search cost"],
    ["贴现因子", "discount factor"],
    ["完全保险", "full insurance"],
    ["销售激励", "sales incentive"],
    ["销售团队", "salesforce"],
    ["市场细分", "market segmentation"],
    ["细分市场", "market segment"],
    ["利基市场", "niche market"],
    ["利基策略", "niche strategy"],
    ["大众市场", "mass market"],
    ["利润潜力", "profit potential"],
    ["产品策略", "product strategy"],
    ["质量选择", "quality choice"],
    ["质量差异", "quality difference"],
    ["垂直差异化", "vertical differentiation"],
    ["水平差异化", "horizontal differentiation"],
    ["品牌伞", "umbrella branding"],
    ["耐用品", "durable goods"],
    ["二手市场", "secondary market"],
    ["替换周期", "replacement cycle"],
    ["网络效应", "network effects"],
    ["用户基数", "user base"],
    ["互补品", "complements"],
    ["渠道冲突", "channel conflict"],
    ["独家区域", "exclusive territory"],
    ["环保卖点", "green value proposition"],
    ["平台传播", "platform diffusion"],
    ["战略互动", "strategic interaction"],
    ["信息不对称", "information asymmetry"],
    ["隐藏行动", "hidden action"],
    ["隐藏类型", "hidden type"],
    ["同主题变体", "same-topic variant"],
    ["同类题", "similar question"],
    ["变体题", "variant question"],
    ["判断规则", "decision rule"],
    ["知识点", "knowledge point"],
    ["课程资料", "course materials"],
    ["本地题库", "local question bank"],
    ["题库", "question bank"],
    ["课件", "slides"],
    ["错题", "missed question"],
    ["复盘", "review"],
    ["解析", "explanation"],
    ["复习建议", "review suggestion"],
    ["题干", "question stem"],
    ["选项", "option"],
    ["概念", "concept"],
    ["策略", "strategy"],
    ["战略", "strategy"],
    ["博弈", "game"],
    ["参与者", "player"],
    ["行动", "action"],
    ["收益", "payoff"],
    ["均衡", "equilibrium"],
    ["竞争", "competition"],
    ["竞争对手", "rival"],
    ["合谋", "collusion"],
    ["信号", "signaling"],
    ["筛选", "screening"],
    ["定价", "pricing"],
    ["拍卖", "auction"],
    ["弹性", "elasticity"],
    ["返利", "rebate"],
    ["保险", "insurance"],
    ["激励", "incentive"],
    ["谈判", "bargaining"],
    ["细分", "segmentation"],
    ["定位", "positioning"],
    ["差异化", "differentiation"],
    ["品牌", "brand"],
    ["广告", "advertising"],
    ["渠道", "channel"],
    ["零售商", "retailer"],
    ["服务", "service"],
    ["口碑", "word of mouth"],
    ["模型", "model"],
    ["机制", "mechanism"],
    ["定义", "definition"],
    ["利润", "profit"],
    ["需求", "demand"],
    ["降价", "price cut"],
    ["高价", "high price"],
    ["惩罚", "punishment"],
    ["监测", "monitoring"],
    ["可信度", "credibility"],
    ["客户", "customer"],
    ["类型", "type"],
    ["合同", "contract"],
    ["决策", "decision"]
  ].sort((a, b) => b[0].length - a[0].length);

  const skipTags = new Set(["SCRIPT", "STYLE", "TEXTAREA", "INPUT", "SELECT", "OPTION"]);

  function escapeRegExp(value) {
    return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  }

  function glossTerms(value) {
    let text = String(value ?? "");
    const protectedParts = [];
    text = text.replace(/[\u3400-\u9fffA-Za-z0-9\-]+（[^）]+）/g, (match) => {
      const token = `\uE000${protectedParts.length}\uE001`;
      protectedParts.push(match);
      return token;
    });
    for (const [zh, en] of glossary) {
      text = text.replace(new RegExp(`${escapeRegExp(zh)}(?![（(])`, "g"), () => {
        const token = `\uE000${protectedParts.length}\uE001`;
        protectedParts.push(`${zh}（${en}）`);
        return token;
      });
    }
    return text.replace(/\uE000(\d+)\uE001/g, (_, index) => protectedParts[Number(index)] || "");
  }

  function shouldSkip(node) {
    const parent = node.parentElement;
    return !parent || skipTags.has(parent.tagName) || parent.closest("[data-no-gloss]");
  }

  function glossTextNode(node) {
    if (shouldSkip(node)) return;
    const nextText = glossTerms(node.nodeValue);
    if (nextText !== node.nodeValue) node.nodeValue = nextText;
  }

  function glossElement(root) {
    if (!root) return;
    const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
    const nodes = [];
    while (walker.nextNode()) nodes.push(walker.currentNode);
    nodes.forEach(glossTextNode);
  }

  function startObserver() {
    glossElement(document.body);
    const observer = new MutationObserver((mutations) => {
      for (const mutation of mutations) {
        if (mutation.type === "characterData") {
          glossTextNode(mutation.target);
          continue;
        }
        for (const node of mutation.addedNodes) {
          if (node.nodeType === Node.TEXT_NODE) glossTextNode(node);
          else if (node.nodeType === Node.ELEMENT_NODE) glossElement(node);
        }
      }
    });
    observer.observe(document.body, { childList: true, characterData: true, subtree: true });
  }

  window.smiGloss = { glossTerms, glossElement };

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", startObserver, { once: true });
  } else {
    startObserver();
  }
})();
