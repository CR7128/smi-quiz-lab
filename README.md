# Strategic Market Intelligence Quiz Lab

一个非官方的学生自制复习网站，根据课程资料整理选择题练习。支持分章节专项练习和全课程 10 题模拟题；做题时可以让 API 基于当前题生成同知识点变体；做完后会给出错题解析和复习建议。如果配置了 DeepSeek 或 OpenAI API key，网站会优先调用 API 生成题组、变体、课程概念搜索和复盘，本地题库作为备用。

每套题展示时会重新打散选项，并均衡 A/B/C/D 的正确答案位置，避免出现一整套答案都集中在同一个选项。

## 启动

```bash
node server.js
```

打开：

```text
http://localhost:4318
```

如果这个端口已经被旧服务占用，启动时会自动尝试下一个端口；以终端里打印的实际地址为准。

搞怪课程 landing page：

```text
http://localhost:4318/public/landing.html
```

匿名鼓励留言墙：

```text
http://localhost:4318/public/messages.html
```

## 发布到 Render

这个项目已经带有 `render.yaml`，可以直接用 Render Blueprint 部署。部署时只需要在 Render 的环境变量里填：

```text
DEEPSEEK_API_KEY=新的 DeepSeek key
```

不要把 API key 写进前端文件，也不要提交 `.env`。如果之前的 key 已经在聊天或截图里出现过，发布前建议先作废旧 key，重新生成一个。

部署完成后，公开入口是：

```text
https://你的-render服务名.onrender.com/public/landing.html
```

## 接入 DeepSeek API

复制 `.env.example` 为 `.env`，填入：

```text
API_PROVIDER=deepseek
DEEPSEEK_API_KEY=你的 key
DEEPSEEK_MODEL=deepseek-v4-flash
```

然后重新启动服务。当前策略是 API 优先：需要出题、换题、搜索概念或复盘时会先调用 API；没有 key 或 API 暂时不可用时，网站才会使用本地题库和本地解析。

这里的“训练”采用课程资料上下文增强，而不是微调模型：后端会把课程摘要和抽取出的课件/case/report 片段发送给 DeepSeek，让它基于这些资料生成题目、解释错题和给复习建议。概念搜索只回答 Strategic Market Intelligence 课程相关内容；题库和资料里没有命中的内容不会继续向 API 扩展回答。

## 公开发布安全说明

网站页面会显示声明：

```text
Unofficial student-made review tool. Not affiliated with or endorsed by Johns Hopkins University or the instructor.
```

公开页面不使用 JHU logo，不暗示学校或老师认可；landing page 不使用教授真实头像，也不再使用人物吉祥物，改为抽象的复习仪表板。真实 Canvas quiz 截图题目只保留为个人本地参考，不会被服务器合并进公开题库，也不会通过 `/api/bank` 暴露；公开版使用 `data/canvas-style-variant-bank.json` 里的同知识点变体题。服务器也限制静态文件访问范围，避免直接公开 `data/` 里的本地资料文件。

## 资料来源

首版题库根据这些课件整理：

- `Intro_Strategic_Thinking.pdf`
- `Segmentation and Positioning.pdf`
- `Competition.pdf`
- `Salesforce and Bargaining.pdf`
- `Pricing.pdf`
- `Product Strategy.pdf`
- `Advertising and Distribution.pdf`
- `Practice questions.pdf`
- `Report_Cournot Competition_BU.450.750.J1_group 3.pdf`
- `Report_Stackelberg Competition_BU.450.750.J1_group 2.pdf`
- `Report_Information Cascades_BU.450.750.J1_group 1.pdf`
- `Report_Network Effects_BU.450.750.J1_group 4.pdf`
- `Report_Durable Goods_BU.450.750.J1_group 5.pdf`
- `Report_Vertical Differentiation_BU.450.750.J1_group 6.pdf`
- `Report_Demarketing_BU.450.750.J1_group 7.pdf`
- `Report_Exclusive Territories_BU.450.750.J1_group 8.pdf`
- `Eco7 Case Opinion Question.pdf`
- `Eco7- Launching a New Motor Oil.pdf`
- `United_Breaks_Guitars_Case_Opinion1.docx`
- 个人本地参考的真实 Canvas quiz 截图题目，不进入公开题库；公开版只使用同知识点变体题

公开题目数据在 `data/question-bank.json`、`data/report-question-bank.json`、`data/case-question-bank.json` 和 `data/canvas-style-variant-bank.json`，课程摘要在 `data/source-digest.json`、`data/report-source-digest.json` 和 `data/case-source-digest.json`。`data/real-quiz-question-bank.json` 仅为个人本地参考，默认不被服务器读取。

同学留言保存在 `data/messages.json`。留言只做本地保存和展示，不会发送给 DeepSeek。
