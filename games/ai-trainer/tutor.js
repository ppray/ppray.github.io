/**
 * 人工智能训练师 · 智能学习与答疑助手 (DeepSeek AI Tutor)
 * 参考 trainer.deepinferstudio.com/tutor.js 架构
 * 支持：DeepSeek API Key 本地存储、题目上下文感知注入、流式 SSE 交互输出、
 * 零基础口诀与保底考点答疑、答题草稿智能批改
 */
(() => {
  'use strict';

  const STORAGE_KEY = 'aiTrainer_deepseek_key';

  // DOM Elements
  const chatFab = document.getElementById('chatfab');
  const chatPanel = document.getElementById('chatpanel');
  const btnCloseTutor = document.getElementById('close-tutor');
  const btnToggleKey = document.getElementById('toggle-key');
  const keySetup = document.getElementById('keysetup');
  const keyForm = document.getElementById('key-form');
  const apiKeyInput = document.getElementById('api-key');
  const btnForgetKey = document.getElementById('forget-key');
  const messagesBox = document.getElementById('tutor-messages');
  const suggestionsBox = document.getElementById('tutor-suggestions');
  const askForm = document.getElementById('ask-form');
  const chatInput = document.getElementById('chatin');
  const btnSend = document.getElementById('send-question');
  const btnStop = document.getElementById('stop-answer');
  const btnContinue = document.getElementById('continue-answer');
  const btnClearChat = document.getElementById('clear-chat');
  const tutorStatus = document.getElementById('tutor-status');
  const tutorContextBadge = document.getElementById('tutor-context');

  let apiKey = localStorage.getItem(STORAGE_KEY) || '';
  let abortController = null;
  let chatHistory = [];
  let currentContext = null;
  let isGenerating = false;

  // Build static background knowledge from lessons
  function getKnowledgeBase() {
    if (!window.AI_TRAINER_LESSONS || !window.AI_TRAINER_LESSONS.paper09Questions) {
      return '';
    }
    const L = window.AI_TRAINER_LESSONS;
    const questionsText = L.paper09Questions.map(q => {
      const qHead = `【第 ${q.number} 题】${q.title}（满分 ${q.points} 分，及格目标 ${q.targetPoints} 分，建议 ${q.minutes} 分钟）
考点：${q.topic} ｜ 文体：${q.docType} ｜ 核心打法：${q.strategy}
口诀：${q.rhyme}（白话：${q.rhymeExplanation}）
避坑指南：
${q.traps.map(t => '  ' + t).join('\n')}
各小问标准与保底：
` + q.parts.map(p => `  第（${p.partNumber}）问（${p.points} 分）：${p.prompt.join(' ')}
    口诀：${p.rhyme}
    📌 极简保底背诵版（2,900字骨架）：${p.baodiBrief}
    采分关键词：${p.checkpoints.join('、')}
    名师讲题：${p.lecture}`).join('\n\n');
      return qHead;
    }).join('\n\n====================\n\n');

    return `
试卷概述：
国家职业技能等级认定 · 人工智能训练师（三级/高级）实操技能考核试卷 09。
全卷 8 道大题，满分 100 分，考试时间 180 分钟。
【开场算账】：官方参考答案 8,300 字按手写 30 字/分要 4.5 小时，3 小时内根本抄不完！必须背诵【极简保底版 2,900 字】（只需 96 分钟写完，剩下 84 分钟翻手册抄词与检查），稳拿 60~75 分。
【及格稳过策略（73分计划）】：题1(12/15) + 题2(6/10) + 题3(11/15) + 题4(15/20) + 题5(10/15) + 题6(16/20) + 题7(2/3) + 题8(1/2) = 73 分（及格线 60 分，多 13 分容错）。
【考场做题顺序】：圈卷 8 分钟 → 题6 (人机协同照抄手册) → 题4 前三问 (代码填空+指标) → 题3 (五删一统+标注) → 题8/7 (指导培训) → 题1 (业务流程) → 题5 (质检表算账) → 题4 后两问 → 题2 (业务优化) → 查漏 20 分钟。
【必背数字】：审核三率 95%/90%/95%，抽检 5%~10%，标注 1/0/2，划分 8:2，四个指标全 80%，质检 7/12(58.3%) 正确与 5/12(41.7%) 介入，阈值 0.85。

各题详细题库与讲师逐字稿：
${questionsText}
`;
  }

  function getSystemPrompt() {
    const kb = getKnowledgeBase();
    return `你是国家职业技能等级认定「人工智能训练师（高级／三级）」的金牌答疑名师。
你正在辅导学员备考实操卷 09（验证码识别与 RPA）、01 卷、07 卷、03 卷（政务服务智能问答、命名实体识别、智能卖点生成）与理论考试。
你的授课风格深入浅出、极具实战针对性、通俗幽默，善用比喻（如“AI 模型＝单位新招的科员，你＝老同志带新人；一张验证码的一生”）。

核心回答准则：
1. 【零基础白话】：学员普遍零基础或文科背景。讲代码先说这段在干嘛，讲公式用“分母数谁、分子数谁”带着算，多用口诀（五四三倒着数、五删一统、八份学两份考、四个指标全80%）。
2. 【保底拿分为先】：时刻牢记 8,300 字抄不完的铁律，优先为学员提炼【极简保底背诵骨架】（小标题＋关键词＋核心数字）。
3. 【避坑红线明确】：当学员询问易错点或要求批改时，主动指出常见的“坑”（如题1别把处理写成采集、题3以能不能用为准、题4代码缺失函数名和下划线笔误、题6抄完六步别漏后三块、题7目录必须加说明等）。
4. 【答题草稿批改】：若用户发来自己的回答草稿，指出已有得分点、遗漏的核心采分点、格式序号规范，并给出优化后的满分/保底示范答句。
5. 【公式渲染】：所有 LaTeX 数学公式必须用 $...$ 包裹行内公式，或 $$...$$ 包裹独立公式块，便于 KaTeX 正确渲染。

参考知识库：
${kb}`;
  }

  // Current Question Context detection
  function detectCurrentContext() {
    // 1. Check if user is in practice mode
    if (window.AI_TRAINER_APP && window.AI_TRAINER_APP.currentPracticeQuestion) {
      const q = window.AI_TRAINER_APP.currentPracticeQuestion;
      const part = window.AI_TRAINER_APP.currentPracticePart || q.parts[0];
      return {
        type: 'practice',
        title: `实操 09 卷 · 第 ${q.number} 题 第（${part.partNumber}）问`,
        prompt: part.prompt.join(' '),
        rhyme: part.rhyme || q.rhyme,
        checkpoints: part.checkpoints || [],
        baodiBrief: part.baodiBrief || '',
        qNumber: q.number,
        partNumber: part.partNumber
      };
    }
    // 2. Check if user is in cloze mode
    if (window.AI_TRAINER_APP && window.AI_TRAINER_APP.currentClozeItem) {
      const item = window.AI_TRAINER_APP.currentClozeItem;
      return {
        type: 'cloze',
        title: item.title || item.tag,
        desc: item.desc || item.q || '',
        tag: item.tag
      };
    }
    // 3. Check if user is in theory mode
    if (window.AI_TRAINER_APP && window.AI_TRAINER_APP.currentTheoryItem) {
      const t = window.AI_TRAINER_APP.currentTheoryItem;
      return {
        type: 'theory',
        title: `理论题 ${t.num} · ${t.type}`,
        prompt: t.q,
        options: t.options,
        ans: t.ans,
        analysis: t.analysis
      };
    }
    return {
      type: 'general',
      title: '人工智能训练师（高级／三级）全卷备考'
    };
  }

  function updateContextUI() {
    currentContext = detectCurrentContext();
    if (tutorContextBadge) {
      tutorContextBadge.textContent = `📍 当前答疑聚焦：${currentContext.title}`;
    }
    renderSuggestions();
  }

  function renderSuggestions() {
    if (!suggestionsBox) return;
    suggestionsBox.innerHTML = '';

    let prompts = [];
    if (currentContext && currentContext.type === 'practice') {
      prompts = [
        `💡 零基础白话解析这道题（第${currentContext.qNumber}题第${currentContext.partNumber}问）`,
        `🎯 考场写哪几句能稳拿及格保底分？`,
        `🧠 这题的答题口诀和骨架怎么背？`,
        `⚠️ 这道题最容易被扣分的坑在哪里？`,
        `📝 请帮我批改我写的答题草稿`
      ];
    } else if (currentContext && currentContext.type === 'theory') {
      prompts = [
        `💡 用大白话解析这道理论题的考点`,
        `🔍 为什么选 ${currentContext.ans || '正确答案'}？干扰项怎么排除？`,
        `📚 这个知识点在国标里对应哪项技能？`
      ];
    } else {
      prompts = [
        `🎯 8,300字抄不完！保底答案怎么背？`,
        `⏱️ 180 分钟考场黄金做题顺序是什么？`,
        `🧮 题4 算法评估四个指标（准确/精确/召回/F1）怎么算？`,
        `💡 “AI 模型＝新科员”的故事是怎么串联 8 道题的？`
      ];
    }

    prompts.forEach(text => {
      const chip = document.createElement('button');
      chip.type = 'button';
      chip.className = 'sug-chip';
      chip.textContent = text;
      chip.onclick = () => {
        if (text === '📝 请帮我批改我写的答题草稿') {
          // Grab current draft from textarea
          const draftText = window.AI_TRAINER_APP ? window.AI_TRAINER_APP.getCurrentDraftText() : '';
          if (draftText && draftText.trim()) {
            chatInput.value = `老师好，这是我针对【第${currentContext.qNumber}题第${currentContext.partNumber}问】写的回答草稿：\n\n${draftText.trim()}\n\n请按照考场评分细则帮我批改：指出现有的采分点、漏掉的要点，并给出修改建议！`;
          } else {
            chatInput.value = `老师好，我想请教针对【第${currentContext.qNumber}题第${currentContext.partNumber}问】，这道题的标准作答逻辑和采分点。`;
          }
        } else {
          chatInput.value = text;
        }
        askForm.dispatchEvent(new Event('submit'));
      };
      suggestionsBox.appendChild(chip);
    });
  }

  function addMessageBubble(role, content) {
    const item = document.createElement('div');
    item.className = `msg ${role === 'user' ? 'u' : 'a'}`;
    if (role === 'user') {
      item.textContent = content;
    } else {
      item.innerHTML = typeof mdLite === 'function' ? mdLite(content) : content;
    }
    messagesBox.appendChild(item);
    messagesBox.scrollTop = messagesBox.scrollHeight;
    return item;
  }

  // Simulated fallback answer if no API Key provided
  function getSimulatedFallback(prompt) {
    if (prompt.includes('指标') || prompt.includes('80%') || prompt.includes('算')) {
      return `### 🧮 题 4 算法评估指标零基础速成

题目给定混淆矩阵：$TP=80, FP=20, FN=20, TN=80$。
**牢记口诀**：*“准确看全部，精确看报出。召回看真的，F1 两头顾。”*

1. **准确率 (Accuracy)**：所有样本里猜对的比例
   $$\\text{Accuracy} = \\frac{TP + TN}{TP + TN + FP + FN} = \\frac{80 + 80}{200} = 80\\%$$
2. **精确率 (Precision)**：模型报出“有效”的里面，真有效的比例（报出的准不准）
   $$\\text{Precision} = \\frac{TP}{TP + FP} = \\frac{80}{80 + 20} = 80\\%$$
3. **召回率 (Recall)**：实际真有效的样本里，被模型抓出来的比例（抓得全不全）
   $$\\text{Recall} = \\frac{TP}{TP + FN} = \\frac{80}{80 + 20} = 80\\%$$
4. **F1-Score**：精确率与召回率的调和平均值
   $$F_1 = \\frac{2 \\times P \\times R}{P + R} = \\frac{2 \\times 0.8 \\times 0.8}{0.8 + 0.8} = 80\\%$$

> 💡 **考场绝招**：原题计算结果四项**全部都是 80%**！答题卡上务必写出代入算式的完整步骤（比如 $160/200=80\\%$），直接写 80% 可能会被扣步骤分。

---
*(提示：配置您的 DeepSeek API Key 即可享受针对您的个人答题草稿的无限制实时深度批改与针对性提问！)*`;
    }

    if (prompt.includes('8,300') || prompt.includes('保底') || prompt.includes('抄不完')) {
      return `### 📌 为什么必须背「保底答案 2,900 字」？

1. **考场残酷算账**：
   - 官方参考答案全卷 **8,300 字**！
   - 考生手写平均速度约 **30 字/分钟**。
   - 8,300 字 ÷ 30字/分 ＝ **约 4.5 小时**！
   - 但实操考试标准时间只有 **180 分钟（3 小时）**，硬抄官方参考答案的人，到交卷时往往连题 5 都还没写完！

2. **保底极简版（2,900 字）的威力**：
   - 2,900 字 ÷ 30字/分 ＝ **约 96 分钟**即可写完全部骨架！
   - 剩下 **84 分钟**，从容翻阅题 5、题 6 的系统操作手册抄现成词，核对题干文件名与路径，查漏补缺！
   - 这样写，稳稳拿到 **60~75 分**，轻松通过及格线！

3. **怎么背**：
   - 牢记每道题的**小标题**（如题 1 的“五四三，倒着数：五步采集、四步处理、三步审核”）。
   - 每个小标题后接**一句关键动作＋必背数字**（如 $\\ge 95\\%, \\ge 90\\%$，抽检 $5\\%\\sim 10\\%$）。`;
    }

    if (prompt.includes('顺序') || prompt.includes('180') || prompt.includes('考场')) {
      return `### 🧭 考场做题黄金顺序（不按题号，按把握做！）

考场切忌从题 1 傻傻按顺序做到题 8！推荐名师黄金次序：

1. **0~8 分钟【圈卷】**：通读试卷，圈出手册、路径、文件名，识别公文文体。
2. **8~26 分钟【题 6 人机交互】**：字数最多，但**照着手册直接抄**！先拿下 16 分保底！
3. **26~38 分钟【题 4 前三问】**：代码词（train_test_split, fit, predict）＋ 四个 80% 计算，白捡 8 分！
4. **38~58 分钟【题 3 规范制定】**：五删一统清洗六步＋标注 1/0/2，稳拿 11 分！
5. **58~68 分钟【题 8、题 7 培训与指导】**：体制内常见公文，轻松拿下 3 分！
6. **68~88 分钟【题 1 业务流程设计】**：五四三倒着数，套骨架写采分点，稳拿 12 分！
7. **88~108 分钟【题 5 系统监控】**：质检表算账（58.3%与41.7%）＋优化方案，稳拿 10 分！
8. **108~130 分钟【题 4 后两问】**：测试报告编写＋错误案例分析，稳拿 7 分！
9. **130~150 分钟【题 2 效果优化】**：人机料法找原因＋优化对招，拿 6 分！
10. **150~180 分钟【查漏补缺】**：核对答题卡序号、确认小标题完整，绝不留空！

合计目标分：**73 分**（及格 60 分，余量足足 13 分）！`;
    }

    if (prompt.includes('故事') || prompt.includes('比喻') || prompt.includes('新科员')) {
      return `### 📖 一个比喻讲懂全卷：一张验证码的一生

把 AI 模型想象成**“单位新录用的科员”**，你就是带他的老同志。8 道题其实就是你带他的全流程：

1. **收材料（题 1 数据采集）**：给新科员准备学习资料，明确采什么、从哪拿、怎么存。
2. **挑废材料（题 1、题 3 数据清洗）**：把打不开的、太小的、模糊的烂图挑出去（五删一统）。
3. **标答案（题 3 标注）**：老同志先在材料上标清“这图能不能用”（1 可用、0 不可用、2 待复核）。
4. **分题做卷（题 4 划分集合）**：把材料按 $8:2$ 分成“学习题（训练集）”和“考试题（测试集）”，绝不能抄答案。
5. **模考训练（题 4 模型训练与评估）**：让新科员做题（fit 与 predict），算算成绩单（四个 80%）。
6. **质检查账（题 5 监控）**：查查他的工作流水表（12 条里 7 条认对，5 条需要老同志介入帮忙）。
7. **人机协同（题 6 流程）**：定个规则——置信度 $\\ge 0.85$ 新科员自己定，低的交老同志复核，错题收录进错题本回流学习！
8. **带新人（题 7、题 8 培训指导）**：把这套经验写成培训讲义，指导更多新人上手！`;
    }

    // Default response
    return `收到学员提问！当前处于**离线问答模式**。
针对您的问题：*“${prompt}”*

💡 **备考锦囊建议**：
1. **查骨架**：如果是实操题，先看顶部【💡 答题口诀】，在答题卡上把大写序号的小标题（一、二、三...）默写下来；
2. **查数字**：检查是否带上了核心数字（如 $\\ge 95\\%, \\ge 90\\%, 5\\%\\sim 10\\%, 1/0/2, 8:2, 80\\%, 0.85$）；
3. **查手册**：如果是题 5 或题 6，直接翻原卷所附的《系统操作手册》，原词照搬！

⚙️ **想要解锁完整 AI 自由追问与个人答题草稿深度批改？**
点击右上角 **⚙️ 设置 API Key**，填入您的 DeepSeek API Key（仅保存在您的当前浏览器本地），即可与 DeepSeek 展开实时对话！`;
  }

  // Handle Send Question
  async function handleSend(e) {
    if (e) e.preventDefault();
    const text = chatInput.value.trim();
    if (!text || isGenerating) return;

    chatInput.value = '';
    addMessageBubble('user', text);
    chatHistory.push({ role: 'user', content: text });

    // Update status
    isGenerating = true;
    btnSend.hidden = true;
    btnStop.hidden = false;
    tutorStatus.textContent = 'DeepSeek 思考中…';

    const aiBubble = addMessageBubble('assistant', '<span class="typing-dot">●</span>');

    // If no API key, use rich simulated fallback
    if (!apiKey) {
      setTimeout(() => {
        const reply = getSimulatedFallback(text);
        aiBubble.innerHTML = typeof mdLite === 'function' ? mdLite(reply) : reply;
        chatHistory.push({ role: 'assistant', content: reply });
        isGenerating = false;
        btnSend.hidden = false;
        btnStop.hidden = true;
        tutorStatus.textContent = '完成（演示模式 · 填入 Key 解锁完整流式对话）';
      }, 500);
      return;
    }

    // Real DeepSeek API Streaming Call
    abortController = new AbortController();
    try {
      const messagesPayload = [
        { role: 'system', content: getSystemPrompt() },
        ...chatHistory.slice(-8) // Keep last 4 turns
      ];

      // Add context injection to the latest prompt
      if (currentContext && currentContext.type === 'practice') {
        messagesPayload[messagesPayload.length - 1].content = 
          `[学员正在查看实操 09 卷 第 ${currentContext.qNumber} 题 第（${currentContext.partNumber}）问]\n` + text;
      }

      const response = await fetch('https://api.deepseek.com/chat/completions', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${apiKey}`
        },
        body: JSON.stringify({
          model: 'deepseek-chat',
          messages: messagesPayload,
          stream: true,
          temperature: 0.3,
          max_tokens: 3000
        }),
        signal: abortController.signal
      });

      if (!response.ok) {
        const errJson = await response.json().catch(() => ({}));
        throw new Error(errJson.error?.message || `HTTP ${response.status} 响应错误`);
      }

      const reader = response.body.getReader();
      const decoder = new TextDecoder('utf-8');
      let fullText = '';
      let buffer = '';

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop(); // Keep trailing incomplete chunk

        for (const line of lines) {
          const trimmed = line.trim();
          if (!trimmed || trimmed === 'data: [DONE]') continue;
          if (trimmed.startsWith('data: ')) {
            try {
              const data = JSON.parse(trimmed.slice(6));
              const delta = data.choices?.[0]?.delta?.content || '';
              fullText += delta;
              aiBubble.innerHTML = typeof mdLite === 'function' ? mdLite(fullText) : fullText;
              messagesBox.scrollTop = messagesBox.scrollHeight;
            } catch (err) {}
          }
        }
      }

      chatHistory.push({ role: 'assistant', content: fullText });
      tutorStatus.textContent = '回答完毕';
    } catch (err) {
      if (err.name === 'AbortError') {
        tutorStatus.textContent = '已停止生成';
      } else {
        aiBubble.innerHTML = `<span style="color:var(--red); font-weight:700;">⚠️ 答疑请求出错：${err.message}</span><br><small style="color:var(--ink-2);">请检查 DeepSeek API Key 是否有效，或检查网络连接。</small>`;
        tutorStatus.textContent = '请求失败';
      }
    } finally {
      isGenerating = false;
      btnSend.hidden = false;
      btnStop.hidden = true;
      abortController = null;
    }
  }

  // Key form events
  function initKeyEvents() {
    if (apiKeyInput) {
      apiKeyInput.placeholder = apiKey ? '已保存 Key（填写可替换）' : 'sk-…';
    }
    if (keyForm) {
      keyForm.onsubmit = (e) => {
        e.preventDefault();
        const val = apiKeyInput.value.trim();
        if (val) {
          apiKey = val;
          localStorage.setItem(STORAGE_KEY, val);
          apiKeyInput.value = '';
          apiKeyInput.placeholder = '已保存 Key（填写可替换）';
          keySetup.hidden = true;
          if (window.AI_TRAINER_APP && window.AI_TRAINER_APP.showToast) {
            window.AI_TRAINER_APP.showToast('✅ DeepSeek API Key 已安全保存在本地浏览器！');
          }
        }
      };
    }
    if (btnForgetKey) {
      btnForgetKey.onclick = () => {
        apiKey = '';
        localStorage.removeItem(STORAGE_KEY);
        apiKeyInput.placeholder = 'sk-…';
        apiKeyInput.value = '';
        if (window.AI_TRAINER_APP && window.AI_TRAINER_APP.showToast) {
          window.AI_TRAINER_APP.showToast('🗑️ 已清除本地保存的 API Key');
        }
      };
    }
    if (btnToggleKey) {
      btnToggleKey.onclick = () => {
        keySetup.hidden = !keySetup.hidden;
      };
    }
  }

  // Bind Open/Close
  function initDrawer() {
    if (chatFab) {
      chatFab.onclick = () => {
        chatPanel.classList.add('open');
        updateContextUI();
        if (messagesBox.children.length === 0) {
          addMessageBubble('assistant', `👋 你好！我是你的 **人工智能训练师（高级／三级）AI 学习助手**！\n\n我可以帮你：\n- 💡 **零基础白话拆解** 任何一道实操大题或 Python 代码\n- 🎯 提供考场最实用的 **2,900 字保底背诵骨架** 与采分点\n- 📝 **批改你的答题草稿**，指出现存要点与遗漏点\n- ⚠️ 提醒每道题最容易被扣分的**名师避坑红线**\n\n请在下方点击快捷问题，或随时向我提问！`);
        }
      };
    }
    if (btnCloseTutor) {
      btnCloseTutor.onclick = () => {
        chatPanel.classList.remove('open');
      };
    }
    if (btnStop) {
      btnStop.onclick = () => {
        if (abortController) abortController.abort();
      };
    }
    if (btnClearChat) {
      btnClearChat.onclick = () => {
        chatHistory = [];
        messagesBox.innerHTML = '';
        tutorStatus.textContent = '';
        addMessageBubble('assistant', '💬 对话已清空。有什么可以帮您的？');
      };
    }
    if (askForm) {
      askForm.onsubmit = handleSend;
    }
    if (chatInput) {
      chatInput.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' && !e.shiftKey) {
          e.preventDefault();
          handleSend();
        }
      });
    }
  }

  // Public API
  window.AI_TRAINER_TUTOR = {
    openTutorWithPrompt: (promptText) => {
      if (chatFab) chatFab.click();
      if (chatInput) {
        chatInput.value = promptText;
        askForm.dispatchEvent(new Event('submit'));
      }
    },
    updateContext: updateContextUI
  };

  // Init on DOM ready
  document.addEventListener('DOMContentLoaded', () => {
    initKeyEvents();
    initDrawer();
  });
})();
