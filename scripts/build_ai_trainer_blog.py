#!/usr/bin/env python3
"""
Build the AI Trainer Practical Exam Blog (blog.html) with full answers, scoring rubrics,
code walkthroughs, and embedded MiMo TTS audio players.
"""

from __future__ import annotations

import html
import json
import re
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
BANK_FILE = ROOT / "games" / "ai-trainer" / "bank.json"
MANIFEST_FILE = ROOT / "podcasts" / "ai-trainer" / "manifest.json"
BLOG_HTML_PATH = ROOT / "games" / "ai-trainer" / "blog.html"

CODE_SNIPPETS = {
    "prac-01-4": """# ==============================================================
# 01题4：顾客评价情感识别算法测试 标准代码
# 考点：8:2数据集划分、TF-IDF特征提取、LogisticRegression训练、多维指标评估
# ==============================================================
import pandas as pd
from sklearn.model_selection import train_test_split
from sklearn.feature_extraction.text import TfidfVectorizer
from sklearn.linear_model import LogisticRegression
from sklearn.metrics import accuracy_score, precision_score, recall_score, f1_score, confusion_matrix, classification_report

# 1. 数据划分（8:2比例，固定随机种子42，确保实验可复现）
df = pd.read_csv('raw_data.csv')
X = df['review']
y = df['label']

X_train, X_test, y_train, y_test = train_test_split(
    X, y, test_size=0.2, random_state=42
)

# 保存划分结果
train_df = pd.DataFrame({'review': X_train, 'label': y_train})
test_df = pd.DataFrame({'review': X_test, 'label': y_test})
train_df.to_csv('train.csv', index=False, encoding='utf-8-sig')
test_df.to_csv('test.csv', index=False, encoding='utf-8-sig')
print("数据划分完成：train.csv 与 test.csv 保存成功")

# 2. 文本特征向量化与模型拟合训练
vectorizer = TfidfVectorizer(max_features=5000)
X_train_vec = vectorizer.fit_transform(X_train)
X_test_vec = vectorizer.transform(X_test)

model = LogisticRegression(max_iter=1000)
model.fit(X_train_vec, y_train)

# 3. 测试集预测与指标计算
y_pred = model.predict(X_test_vec)

acc = accuracy_score(y_test, y_pred)
prec = precision_score(y_test, y_pred, average='weighted')
rec = recall_score(y_test, y_pred, average='weighted')
f1 = f1_score(y_test, y_pred, average='weighted')
cm = confusion_matrix(y_test, y_pred)

print(f"评估指标 -> 准确率: {acc:.4f} | 精确率: {prec:.4f} | 召回率: {rec:.4f} | F1: {f1:.4f}")
print("混淆矩阵:\\n", cm)

# 4. 生成规范测试报告并保存
with open('2.2.3_report.txt', 'w', encoding='utf-8') as f:
    f.write("=== 顾客评价情感识别算法测试报告 ===\\n")
    f.write(f"测试样本量: {len(y_test)}\\n")
    f.write(f"准确率 Accuracy: {acc:.4f}\\n精确率 Precision: {prec:.4f}\\n召回率 Recall: {rec:.4f}\\nF1-Score: {f1:.4f}\\n\\n")
    f.write("详细分类评估报告:\\n")
    f.write(classification_report(y_test, y_pred))
print("测试报告已输出至 2.2.3_report.txt")""",

    "prac-09-4": """# ==============================================================
# 09题4：验证码识别算法训练与测试 标准代码
# 考点：PIL灰度缩放、图像像素展平、逻辑回归分类、模型持久化pkl与报告输出
# ==============================================================
import pandas as pd
from PIL import Image
from sklearn.linear_model import LogisticRegression
from sklearn.metrics import accuracy_score, precision_score, recall_score, f1_score, classification_report
import joblib

# 1. 图像预处理与特征转换（转L单通道灰度，缩放至32x32，扁平化特征）
def load_image(path):
    img = Image.open(path).convert("L")
    img = img.resize((32, 32))
    return list(img.getdata())

# 2. 读取数据与构建训练特征矩阵
train_df = pd.read_csv("captcha_train.csv")
test_df = pd.read_csv("captcha_test.csv")

X_train = [load_image(p) for p in train_df["image_path"]]
y_train = train_df["label"]

X_test = [load_image(p) for p in test_df["image_path"]]
y_test = test_df["label"]

# 3. 算法模型创建、拟合与持久化保存
model = LogisticRegression(max_iter=1000)
model.fit(X_train, y_train)

# 保存模型为 2.2.3_model.pkl
joblib.dump(model, "2.2.3_model.pkl")
print("模型已保存为 2.2.3_model.pkl")

# 4. 模型测试与全面性能评估
y_pred = model.predict(X_test)

acc = accuracy_score(y_test, y_pred)
prec = precision_score(y_test, y_pred, average='macro')
rec = recall_score(y_test, y_pred, average='macro')
f1 = f1_score(y_test, y_pred, average='macro')

print(f"测试集性能 -> 准确率: {acc:.4f} | 宏精确率: {prec:.4f} | 宏召回率: {rec:.4f} | F1: {f1:.4f}")

# 5. 撰写模型测试报告与误判分析
with open("2.2.3_report.txt", "w", encoding="utf-8") as f:
    f.write("=== 验证码识别算法测试与评估报告 ===\\n")
    f.write(f"测试图片数: {len(y_test)}\\n")
    f.write(f"准确率: {acc:.4f} | 精确率: {prec:.4f} | 召回率: {rec:.4f} | F1值: {f1:.4f}\\n\\n")
    f.write("【错误分析与改进建议】\\n")
    f.write("1. 字符粘连与背景干扰线是导致字符误判的主要原因；\\n")
    f.write("2. 建议引入二值化去噪与形态学膨胀腐蚀，或迁移至卷积神经网络CNN以进一步提升特征提取鲁棒性。\\n")""",

    "prac-07-4": """# ==============================================================
# 07题4：自然场景吸烟检测算法测试 标准代码
# 考点：图像特征提取、逻辑回归基线、随机森林/XGBoost优化纠偏、测试对比
# ==============================================================
import pandas as pd
from PIL import Image
from sklearn.linear_model import LogisticRegression
from sklearn.ensemble import RandomForestClassifier
from sklearn.metrics import accuracy_score, precision_score, recall_score, f1_score, confusion_matrix
import joblib

# 1. 图像数据读取与预处理
def load_image(path):
    img = Image.open(path).convert("L")
    img = img.resize((32, 32))
    return list(img.getdata())

train_df = pd.read_csv("train.csv")
test_df = pd.read_csv("test.csv")

X_train = [load_image("images/" + name) for name in train_df["image"]]
y_train = train_df["label"]

X_test = [load_image("images/" + name) for name in test_df["image"]]
y_test = test_df["label"]

# 2. 初始基线模型训练（逻辑回归）
model_base = LogisticRegression(max_iter=1000)
model_base.fit(X_train, y_train)
joblib.dump(model_base, "2.2.3_model.pkl")

# 基线预测
y_pred_base = model_base.predict(X_test)
acc_base = accuracy_score(y_test, y_pred_base)
rec_base = recall_score(y_test, y_pred_base)
cm_base = confusion_matrix(y_test, y_pred_base)

# 3. 算法纠偏与优化模型训练（改用随机森林集成模型，增强复杂自然背景泛化能力）
model_opt = RandomForestClassifier(n_estimators=100, max_depth=10, random_state=42)
model_opt.fit(X_train, y_train)

y_pred_opt = model_opt.predict(X_test)
acc_opt = accuracy_score(y_test, y_pred_opt)
rec_opt = recall_score(y_test, y_pred_opt)
cm_opt = confusion_matrix(y_test, y_pred_opt)

print(f"基线逻辑回归 -> 准确率: {acc_base:.4f}, 召回率: {rec_base:.4f}")
print(f"优化随机森林 -> 准确率: {acc_opt:.4f}, 召回率: {rec_opt:.4f} (显著提升)")

# 4. 保存测试报告与纠偏结果
with open("2.2.3_report.txt", "w", encoding="utf-8") as f:
    f.write("=== 自然场景吸烟检测算法测试与优化报告 ===\\n\\n")
    f.write(f"【基线模型指标】准确率: {acc_base:.4f}, 召回率: {rec_base:.4f}\\n")
    f.write(f"混淆矩阵:\\n{cm_base}\\n\\n")
    f.write(f"【优化后指标】准确率: {acc_opt:.4f}, 召回率: {rec_opt:.4f}\\n")
    f.write(f"混淆矩阵:\\n{cm_opt}\\n\\n")
    f.write("【纠错原因与改进说明】\\n")
    f.write("原始线性分类器在光照变化强烈和手部微动作复杂场景下易发生误检与漏检；\\n")
    f.write("引入树集成算法后，非线性特征捕捉能力大幅提升，有效降低了假阳性误报率。\\n")"""
}


def render_html() -> None:
    with BANK_FILE.open("r", encoding="utf-8") as f:
        bank = json.load(f)

    manifest_map = {}
    if MANIFEST_FILE.exists():
        with MANIFEST_FILE.open("r", encoding="utf-8") as f:
            for item in json.load(f):
                manifest_map[item["id"]] = item

    practical_list = bank.get("practical", [])

    # Group by paper
    papers = {
        "01": {"name": "01卷 · 自动化营销与质检", "desc": "以电商自动化营销与CEM客户体验管理为核心场景，考查表格与文本特征工程、情感分类、人机协同分工。", "items": []},
        "09": {"name": "09卷 · 验证码识别与RPA", "desc": "以验证码图像识别与RPA流程自动化为核心场景，考查灰度图像预处理、像素矩阵建模、CNN图像分类与监控预警。", "items": []},
        "07": {"name": "07卷 · 自然场景吸烟检测", "desc": "以公共安全与边缘安防吸烟识别为核心场景，考查自然场景小目标检测、召回率优化、模型纠偏重训与人机交互设计。", "items": []},
    }

    for p in practical_list:
        pkey = p["paperKey"]
        if pkey in papers:
            papers[pkey]["items"].append(p)

    def render_question_card(q: dict, idx: int) -> str:
        qid = q["id"]
        pkey = q["paperKey"]
        sub_no = qid.split("-")[-1]
        m_item = manifest_map.get(qid, {})
        audio_dur = m_item.get("duration", 0)
        dur_str = f"{int(audio_dur//60)}分{int(audio_dur%60)}秒" if audio_dur > 0 else "精讲音频"
        audio_slug = f"ai-trainer-{pkey}-{sub_no}"

        # Reconstruct answer with highlighting
        ans_html_parts = []
        for it in q["p"]:
            if isinstance(it, int):
                val = html.escape(q["b"][it])
                ans_html_parts.append(f'<mark class="score-key" title="核心采分点">{val}</mark>')
            else:
                escaped = html.escape(it)
                escaped = escaped.replace("\n", "<br>")
                ans_html_parts.append(escaped)
        answer_rendered = "".join(ans_html_parts)

        # Prompt formatting
        prompt_escaped = html.escape(q["prompt"]).replace("\n", "<br>")

        # Takeaway
        takeaway = m_item.get("takeaway", "紧扣标准流程步骤，踩准核心采分词作答。")

        # Code block if present
        code_block_html = ""
        if qid in CODE_SNIPPETS:
            escaped_code = html.escape(CODE_SNIPPETS[qid])
            code_block_html = f"""
            <div class="code-box">
              <div class="code-box-header">
                <span class="code-title">🐍 Python 满分标准实现与逐行注释</span>
                <button class="btn btn-sm btn-copy" onclick="copyCode(this, '{qid}-code')">📋 复制代码</button>
              </div>
              <pre><code id="{qid}-code" class="python">{escaped_code}</code></pre>
            </div>
            """

        qtype_badges = {
            "1": "流程设计 (15分)",
            "2": "效果优化 (15分)",
            "3": "数据规范 (15分)",
            "4": "算法实操代码 (20-25分)",
            "5": "系统监控 (15分)",
            "6": "人机交互 (15-20分)",
            "7": "培训考核 (5分)",
            "8": "指导考核 (5分)",
        }
        badge_type = qtype_badges.get(sub_no, "实操大题")

        return f"""
        <article class="question-card" id="{qid}" data-qid="{qid}" data-slug="{audio_slug}">
          <header class="q-header">
            <div class="q-title-group">
              <div class="q-badges">
                <span class="badge badge-paper">{q['paperKey']}卷</span>
                <span class="badge badge-type">{badge_type}</span>
                <span class="badge badge-num">第 {sub_no} 题</span>
              </div>
              <h3 class="q-title">{html.escape(q['title'])}</h3>
            </div>
            <div class="q-actions">
              <button class="btn btn-audio play-trigger" data-slug="{audio_slug}" data-qid="{qid}" title="播放 MiMo TTS 原声精讲带背">
                <span class="play-icon">▶</span>
                <span class="audio-text">听带背</span>
                <span class="audio-dur">{dur_str}</span>
                <span class="audio-wave">
                  <span></span><span></span><span></span><span></span>
                </span>
              </button>
              <a href="/games/ai-trainer/#cloze" target="_blank" class="btn btn-sm btn-practice" title="前往连击游戏自测本题">
                🎯 挖空自测
              </a>
            </div>
          </header>

          <details class="q-prompt-box">
            <summary class="prompt-toggle">
              <span>📋 考核背景与考题指令 (点击展开/折叠)</span>
              <span class="arrow">▼</span>
            </summary>
            <div class="prompt-content">
              {prompt_escaped}
            </div>
          </details>

          <div class="answer-section">
            <div class="section-tag">💡 标准答案与采分要点拆解</div>
            <div class="answer-body">
              {answer_rendered}
            </div>
          </div>

          {code_block_html}

          <div class="takeaway-box">
            <div class="takeaway-head">
              <span class="takeaway-icon">⚡</span>
              <span class="takeaway-title">考场高分口诀与避坑指南</span>
            </div>
            <div class="takeaway-text">{html.escape(takeaway)}</div>
          </div>
        </article>
        """

    # Generate full page HTML
    papers_html = []
    toc_html = []

    for pkey, pdata in papers.items():
        cards_html = [render_question_card(q, i) for i, q in enumerate(pdata["items"], 1)]
        papers_html.append(f"""
        <section class="paper-section" id="paper-{pkey}">
          <div class="paper-banner">
            <div class="paper-banner-left">
              <h2 class="paper-title">{pdata['name']}</h2>
              <p class="paper-desc">{pdata['desc']}</p>
            </div>
            <div class="paper-banner-right">
              <button class="btn btn-paper-play" onclick="playPaper('{pkey}')">
                <span>📻 播放本卷全套音频</span>
              </button>
            </div>
          </div>
          <div class="questions-list">
            {''.join(cards_html)}
          </div>
        </section>
        """)

        toc_subitems = "".join([
            f'<li><a href="#{q["id"]}" class="toc-sublink">{q["tag"]}: {q["title"].split("：")[-1]}</a></li>'
            for q in pdata["items"]
        ])
        toc_html.append(f"""
        <div class="toc-group">
          <a href="#paper-{pkey}" class="toc-mainlink">📑 {pdata['name'].split(' · ')[0]}</a>
          <ul class="toc-sublist">
            {toc_subitems}
          </ul>
        </div>
        """)

    full_html = f"""<!DOCTYPE html>
<html lang="zh-CN">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
  <title>人工智能训练师（高级/三级）实操通关博客 · 8大题型解题通式与24道实操大题全真带背</title>
  <meta name="description" content="人工智能训练师（高级/三级）实操全真模拟试题高分通关指南：8大考核题型万能模版、01/09/07全套24道大题核心采分点拆解、Python算法实操代码精析、全套MiMo TTS原声有声带背与磨耳朵。">
  <link rel="icon" href="/favicon.svg" type="image/svg+xml">
  <style>
    :root {{
      --ink: #1b1d4d;
      --ink-2: #484b7a;
      --ink-3: #7578a8;
      --paper: #fff8ec;
      --card-bg: #ffffff;
      --blue: #3b6bff;
      --blue-d: #234fdc;
      --blue-soft: #dce5ff;
      --pink: #ff7ab6;
      --pink-soft: #ffe4f0;
      --yellow: #ffd23f;
      --yellow-soft: #fff3c4;
      --mint: #10b981;
      --mint-soft: #d1fae5;
      --violet: #8b5cf6;
      --violet-soft: #ede9fe;
      --red: #ef4444;
      --red-soft: #fee2e2;
      --code-bg: #1e1e38;
      --code-text: #f8fafc;
      --border-ink: 2.5px solid var(--ink);
      --shadow-sm: 0 3px 0 var(--ink);
      --shadow-md: 0 5px 0 var(--ink);
      --shadow-lg: 0 8px 0 var(--ink);
      --radius-sm: 10px;
      --radius-md: 16px;
      --radius-lg: 22px;
      --font-main: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "PingFang SC", "Hiragino Sans GB", "Microsoft YaHei", sans-serif;
    }}

    * {{ box-sizing: border-box; margin: 0; padding: 0; }}
    html {{ scroll-behavior: smooth; }}
    body {{
      min-height: 100vh;
      background:
        radial-gradient(circle at 12% 18%, rgba(255,122,182,.12) 0 120px, transparent 121px),
        radial-gradient(circle at 88% 78%, rgba(59,107,255,.12) 0 160px, transparent 161px),
        linear-gradient(rgba(59,107,255,.07) 1.5px, transparent 1.5px) 0 0/28px 28px,
        linear-gradient(90deg, rgba(59,107,255,.07) 1.5px, transparent 1.5px) 0 0/28px 28px,
        var(--paper);
      color: var(--ink);
      font-family: var(--font-main);
      line-height: 1.7;
      padding-bottom: 120px;
      -webkit-font-smoothing: antialiased;
    }}

    /* Top Navigation Header */
    .blog-nav {{
      position: sticky;
      top: 0;
      z-index: 100;
      background: rgba(255, 248, 236, 0.94);
      backdrop-filter: blur(12px);
      border-bottom: var(--border-ink);
      padding: 12px 24px;
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 16px;
    }}
    .nav-brand {{
      display: flex;
      align-items: center;
      gap: 12px;
      text-decoration: none;
      color: var(--ink);
    }}
    .btn-back {{
      width: 36px;
      height: 36px;
      border-radius: 50%;
      border: var(--border-ink);
      background: var(--yellow);
      display: flex;
      align-items: center;
      justify-content: center;
      font-weight: 900;
      box-shadow: 0 2px 0 var(--ink);
      cursor: pointer;
      text-decoration: none;
      color: var(--ink);
      transition: transform 0.15s;
    }}
    .btn-back:hover {{ transform: scale(1.06); }}
    .brand-text {{ font-size: 16px; font-weight: 900; }}
    .brand-sub {{ font-size: 11px; color: var(--ink-2); font-weight: 700; }}

    .nav-actions {{
      display: flex;
      align-items: center;
      gap: 10px;
    }}
    .btn {{
      display: inline-flex;
      align-items: center;
      justify-content: center;
      gap: 6px;
      padding: 8px 16px;
      font-size: 13px;
      font-weight: 800;
      border-radius: var(--radius-sm);
      border: var(--border-ink);
      box-shadow: var(--shadow-sm);
      cursor: pointer;
      text-decoration: none;
      color: var(--ink);
      background: var(--card-bg);
      transition: all 0.15s ease;
    }}
    .btn:hover {{
      transform: translate(-1px, -1px);
      box-shadow: 0 4px 0 var(--ink);
    }}
    .btn:active {{
      transform: translate(1px, 1px);
      box-shadow: 0 1px 0 var(--ink);
    }}
    .btn-primary {{ background: var(--yellow); }}
    .btn-blue {{ background: var(--blue); color: #fff; }}
    .btn-mint {{ background: var(--mint); color: #fff; }}

    /* Layout */
    .blog-layout {{
      max-width: 1240px;
      margin: 24px auto;
      padding: 0 20px;
      display: grid;
      grid-template-columns: 280px 1fr;
      gap: 32px;
      align-items: start;
    }}

    @media (max-width: 980px) {{
      .blog-layout {{
        grid-template-columns: 1fr;
      }}
      .blog-sidebar {{
        display: none;
      }}
    }}

    /* Sidebar / TOC */
    .blog-sidebar {{
      position: sticky;
      top: 80px;
      max-height: calc(100vh - 180px);
      overflow-y: auto;
      background: var(--card-bg);
      border: var(--border-ink);
      border-radius: var(--radius-md);
      box-shadow: var(--shadow-md);
      padding: 18px;
    }}
    .sidebar-title {{
      font-size: 15px;
      font-weight: 900;
      display: flex;
      align-items: center;
      gap: 8px;
      padding-bottom: 12px;
      border-bottom: 2px dashed rgba(27,29,77,0.18);
      margin-bottom: 14px;
    }}
    .toc-group {{ margin-bottom: 16px; }}
    .toc-mainlink {{
      display: block;
      font-size: 13.5px;
      font-weight: 900;
      color: var(--ink);
      text-decoration: none;
      padding: 4px 8px;
      border-radius: 6px;
      transition: background 0.15s;
    }}
    .toc-mainlink:hover {{ background: var(--yellow-soft); }}
    .toc-sublist {{
      list-style: none;
      padding-left: 12px;
      margin-top: 4px;
      border-left: 2px solid rgba(27,29,77,0.1);
    }}
    .toc-sublink {{
      display: block;
      font-size: 12px;
      font-weight: 700;
      color: var(--ink-2);
      text-decoration: none;
      padding: 3px 6px;
      border-radius: 4px;
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
      transition: all 0.15s;
    }}
    .toc-sublink:hover {{
      color: var(--blue-d);
      background: var(--blue-soft);
    }}

    /* Main Content */
    .blog-main {{
      display: flex;
      flex-direction: column;
      gap: 32px;
    }}

    /* Hero Banner */
    .hero-banner {{
      background: var(--card-bg);
      border: var(--border-ink);
      border-radius: var(--radius-lg);
      box-shadow: var(--shadow-lg);
      padding: 32px;
      position: relative;
      overflow: hidden;
    }}
    .hero-banner::after {{
      content: "AI TRAINER";
      position: absolute;
      right: -20px;
      bottom: -15px;
      font-size: 80px;
      font-weight: 900;
      color: rgba(59,107,255,0.05);
      letter-spacing: -2px;
      pointer-events: none;
      line-height: 1;
    }}
    .hero-badges {{
      display: flex;
      flex-wrap: wrap;
      gap: 8px;
      margin-bottom: 14px;
    }}
    .badge {{
      display: inline-flex;
      align-items: center;
      gap: 4px;
      font-size: 11.5px;
      font-weight: 900;
      padding: 3px 10px;
      border-radius: 999px;
      border: 1.5px solid var(--ink);
      line-height: 1.4;
    }}
    .badge-paper {{ background: var(--pink-soft); color: var(--ink); }}
    .badge-type {{ background: var(--blue-soft); color: var(--blue-d); }}
    .badge-num {{ background: var(--yellow-soft); color: var(--ink); }}
    .badge-mimo {{ background: var(--mint-soft); color: var(--mint); }}

    .hero-title {{
      font-size: 28px;
      font-weight: 900;
      line-height: 1.3;
      margin-bottom: 12px;
      color: var(--ink);
    }}
    .hero-desc {{
      font-size: 14.5px;
      color: var(--ink-2);
      font-weight: 600;
      margin-bottom: 22px;
      line-height: 1.6;
    }}
    .hero-meta-grid {{
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(130px, 1fr));
      gap: 12px;
      margin-bottom: 22px;
    }}
    .meta-box {{
      background: var(--paper);
      border: 2px solid var(--ink);
      border-radius: var(--radius-sm);
      padding: 10px 14px;
      box-shadow: 0 2px 0 var(--ink);
    }}
    .meta-label {{ font-size: 11px; font-weight: 800; color: var(--ink-3); text-transform: uppercase; }}
    .meta-val {{ font-size: 18px; font-weight: 900; color: var(--ink); }}

    .hero-actions {{
      display: flex;
      flex-wrap: wrap;
      gap: 12px;
    }}

    /* Guide Strategy Section */
    .strategy-card {{
      background: var(--card-bg);
      border: var(--border-ink);
      border-radius: var(--radius-md);
      box-shadow: var(--shadow-md);
      padding: 24px;
    }}
    .section-title {{
      font-size: 20px;
      font-weight: 900;
      margin-bottom: 16px;
      display: flex;
      align-items: center;
      gap: 8px;
    }}
    .grid-2col {{
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: 16px;
      margin-top: 14px;
    }}
    @media (max-width: 680px) {{
      .grid-2col {{ grid-template-columns: 1fr; }}
    }}
    .info-pane {{
      background: var(--paper);
      border: 2px solid var(--ink);
      border-radius: var(--radius-sm);
      padding: 16px;
    }}
    .info-pane h4 {{
      font-size: 14.5px;
      font-weight: 900;
      margin-bottom: 8px;
      display: flex;
      align-items: center;
      gap: 6px;
    }}
    .info-pane ul {{
      padding-left: 18px;
      font-size: 13px;
      color: var(--ink-2);
    }}
    .info-pane li {{ margin-bottom: 6px; }}

    /* Universal Template Accordion */
    .template-box {{
      background: #faf8f5;
      border: 2px solid var(--ink);
      border-radius: var(--radius-sm);
      padding: 14px 18px;
      margin-bottom: 10px;
    }}
    .template-title {{
      font-size: 14.5px;
      font-weight: 900;
      color: var(--blue-d);
      margin-bottom: 6px;
    }}
    .template-formula {{
      font-size: 13px;
      background: #fff;
      border: 1.5px dashed rgba(27,29,77,0.25);
      border-radius: 6px;
      padding: 8px 12px;
      font-family: monospace;
      font-weight: 700;
      color: #b91c1c;
      line-height: 1.5;
    }}

    /* Paper Section */
    .paper-section {{
      display: flex;
      flex-direction: column;
      gap: 20px;
    }}
    .paper-banner {{
      background: linear-gradient(135deg, var(--paper) 0%, #fff 100%);
      border: var(--border-ink);
      border-radius: var(--radius-md);
      box-shadow: var(--shadow-sm);
      padding: 20px 24px;
      display: flex;
      align-items: center;
      justify-content: space-between;
      flex-wrap: wrap;
      gap: 14px;
    }}
    .paper-title {{ font-size: 20px; font-weight: 900; }}
    .paper-desc {{ font-size: 13px; color: var(--ink-2); margin-top: 4px; }}
    .btn-paper-play {{
      background: var(--mint);
      color: #fff;
      font-weight: 800;
      border: var(--border-ink);
      box-shadow: var(--shadow-sm);
      padding: 8px 16px;
      border-radius: var(--radius-sm);
      cursor: pointer;
    }}

    /* Question Card */
    .question-card {{
      background: var(--card-bg);
      border: var(--border-ink);
      border-radius: var(--radius-md);
      box-shadow: var(--shadow-md);
      padding: 24px;
      display: flex;
      flex-direction: column;
      gap: 16px;
      transition: border-color 0.2s, box-shadow 0.2s;
    }}
    .question-card.active-playing {{
      border-color: var(--blue);
      box-shadow: 0 0 0 3px var(--blue-soft), var(--shadow-lg);
    }}

    .q-header {{
      display: flex;
      align-items: flex-start;
      justify-content: space-between;
      flex-wrap: wrap;
      gap: 14px;
      padding-bottom: 14px;
      border-bottom: 2px solid rgba(27,29,77,0.08);
    }}
    .q-title-group {{ max-width: 680px; }}
    .q-badges {{ display: flex; gap: 6px; margin-bottom: 6px; }}
    .q-title {{ font-size: 17px; font-weight: 900; line-height: 1.4; }}
    .q-actions {{ display: flex; align-items: center; gap: 8px; }}

    /* Audio Play Trigger Button */
    .btn-audio {{
      display: inline-flex;
      align-items: center;
      gap: 6px;
      background: var(--mint-soft);
      color: var(--ink);
      border: 2px solid var(--ink);
      border-radius: 999px;
      padding: 6px 14px;
      font-size: 12.5px;
      font-weight: 800;
      cursor: pointer;
      box-shadow: 0 2px 0 var(--ink);
      transition: all 0.15s;
    }}
    .btn-audio:hover {{
      background: var(--mint);
      color: #fff;
      transform: translate(-1px, -1px);
    }}
    .btn-audio.is-playing {{
      background: var(--mint);
      color: #fff;
    }}
    .audio-dur {{ font-size: 11px; opacity: 0.8; font-weight: 600; }}
    .audio-wave {{
      display: none;
      align-items: flex-end;
      gap: 2px;
      height: 12px;
    }}
    .btn-audio.is-playing .audio-wave {{ display: inline-flex; }}
    .audio-wave span {{
      width: 2.5px;
      background: currentColor;
      border-radius: 1px;
      animation: waveBar 0.8s ease-in-out infinite alternate;
    }}
    .audio-wave span:nth-child(2) {{ animation-delay: 0.2s; }}
    .audio-wave span:nth-child(3) {{ animation-delay: 0.4s; }}
    .audio-wave span:nth-child(4) {{ animation-delay: 0.1s; }}
    @keyframes waveBar {{ 0% {{ height: 3px; }} 100% {{ height: 12px; }} }}

    /* Prompt Box */
    .q-prompt-box {{
      background: #faf8f5;
      border: 1.5px solid rgba(27,29,77,0.18);
      border-radius: var(--radius-sm);
      overflow: hidden;
    }}
    .prompt-toggle {{
      padding: 10px 14px;
      font-size: 12.5px;
      font-weight: 800;
      color: var(--ink-2);
      cursor: pointer;
      display: flex;
      justify-content: space-between;
      user-select: none;
    }}
    .prompt-content {{
      padding: 12px 14px;
      font-size: 13px;
      color: var(--ink-2);
      line-height: 1.6;
      border-top: 1px solid rgba(27,29,77,0.1);
      background: #fff;
    }}

    /* Answer Body & Score Key Highlighting */
    .answer-section {{
      display: flex;
      flex-direction: column;
      gap: 8px;
    }}
    .section-tag {{
      font-size: 12px;
      font-weight: 900;
      color: var(--blue-d);
      text-transform: uppercase;
      letter-spacing: 0.05em;
    }}
    .answer-body {{
      font-size: 14px;
      line-height: 1.8;
      color: var(--ink);
    }}
    .score-key {{
      background: #fef08a;
      color: #854d0e;
      font-weight: 900;
      padding: 1px 6px;
      border-radius: 4px;
      border: 1px solid #facc15;
      margin: 0 2px;
      display: inline-block;
      line-height: 1.4;
      box-shadow: 0 1px 2px rgba(0,0,0,0.05);
    }}

    /* Code Block */
    .code-box {{
      background: var(--code-bg);
      border: 2px solid var(--ink);
      border-radius: var(--radius-sm);
      overflow: hidden;
      margin: 8px 0;
      box-shadow: 0 3px 0 var(--ink);
    }}
    .code-box-header {{
      display: flex;
      justify-content: space-between;
      align-items: center;
      padding: 8px 14px;
      background: #141428;
      border-bottom: 1px solid #2d2d4d;
      color: #94a3b8;
      font-size: 12px;
      font-weight: 700;
    }}
    .btn-copy {{
      font-size: 11px;
      padding: 4px 10px;
      background: #2b2b4d;
      color: #f8fafc;
      border: 1px solid #475569;
      box-shadow: none;
    }}
    .btn-copy:hover {{ background: var(--blue); border-color: var(--blue); }}
    .code-box pre {{
      margin: 0;
      padding: 16px;
      overflow-x: auto;
      font-family: ui-monospace, SFMono-Regular, "SF Mono", Menlo, Consolas, monospace;
      font-size: 12.5px;
      line-height: 1.6;
      color: #e2e8f0;
    }}

    /* Takeaway Box */
    .takeaway-box {{
      background: var(--yellow-soft);
      border: 2px solid var(--ink);
      border-radius: var(--radius-sm);
      padding: 12px 16px;
      box-shadow: 0 2px 0 var(--ink);
    }}
    .takeaway-head {{
      display: flex;
      align-items: center;
      gap: 6px;
      font-size: 12.5px;
      font-weight: 900;
      margin-bottom: 4px;
    }}
    .takeaway-text {{
      font-size: 13px;
      font-weight: 700;
      color: var(--ink);
      line-height: 1.5;
    }}

    /* Persistent Audio Player Floating Bar */
    .audio-bar {{
      position: fixed;
      bottom: 0;
      left: 0;
      right: 0;
      z-index: 200;
      background: rgba(27, 29, 77, 0.96);
      backdrop-filter: blur(14px);
      color: #fff;
      border-top: 3px solid var(--yellow);
      padding: 12px 24px;
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 20px;
      box-shadow: 0 -4px 20px rgba(0,0,0,0.25);
    }}
    .player-left {{
      display: flex;
      align-items: center;
      gap: 14px;
      min-width: 240px;
    }}
    .player-avatar {{
      width: 42px;
      height: 42px;
      border-radius: 50%;
      background: var(--yellow);
      border: 2px solid #fff;
      display: flex;
      align-items: center;
      justify-content: center;
      font-size: 20px;
    }}
    .player-meta {{ display: flex; flex-direction: column; }}
    .player-title {{ font-size: 13.5px; font-weight: 900; color: #fff; max-width: 220px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }}
    .player-sub {{ font-size: 11px; color: #94a3b8; font-weight: 600; }}

    .player-center {{
      flex: 1;
      max-width: 580px;
      display: flex;
      flex-direction: column;
      align-items: center;
      gap: 6px;
    }}
    .player-controls {{
      display: flex;
      align-items: center;
      gap: 16px;
    }}
    .ctrl-btn {{
      background: none;
      border: none;
      color: #f1f5f9;
      font-size: 16px;
      cursor: pointer;
      display: flex;
      align-items: center;
      justify-content: center;
      transition: transform 0.1s, color 0.1s;
    }}
    .ctrl-btn:hover {{ color: var(--yellow); transform: scale(1.1); }}
    .ctrl-play {{
      width: 40px;
      height: 40px;
      border-radius: 50%;
      background: var(--yellow);
      color: var(--ink);
      font-size: 18px;
      font-weight: 900;
      border: 2px solid #fff;
      box-shadow: 0 2px 0 rgba(0,0,0,0.4);
    }}
    .ctrl-play:hover {{ transform: scale(1.08); color: var(--ink); }}

    .player-progress-row {{
      width: 100%;
      display: flex;
      align-items: center;
      gap: 10px;
      font-size: 11px;
      font-family: monospace;
      color: #94a3b8;
    }}
    .player-progress-row input[type="range"] {{
      flex: 1;
      accent-color: var(--yellow);
      height: 5px;
      border-radius: 3px;
      cursor: pointer;
    }}

    .player-right {{
      display: flex;
      align-items: center;
      gap: 12px;
    }}
    .rate-btn {{
      padding: 3px 8px;
      font-size: 11.5px;
      font-weight: 800;
      background: #334155;
      color: #f8fafc;
      border: 1px solid #64748b;
      border-radius: 6px;
      cursor: pointer;
    }}
    .rate-btn:hover {{ background: var(--blue); border-color: var(--blue); }}
    .loop-toggle {{
      font-size: 12px;
      display: flex;
      align-items: center;
      gap: 4px;
      color: #94a3b8;
      cursor: pointer;
      user-select: none;
    }}
    .loop-toggle input {{ accent-color: var(--yellow); }}

    @media (max-width: 768px) {{
      .audio-bar {{
        flex-direction: column;
        gap: 8px;
        padding: 10px 16px;
      }}
      .player-left {{ display: none; }}
      .player-center {{ width: 100%; max-width: 100%; }}
      .player-right {{ display: none; }}
    }}
  </style>
</head>
<body>

  <!-- Top Navigation Header -->
  <header class="blog-nav">
    <div class="nav-brand">
      <a href="/games/ai-trainer/" class="btn-back" title="返回实操模拟系统">◀</a>
      <div>
        <div class="brand-text">人工智能训练师（高级/三级）</div>
        <div class="brand-sub">实操全真题通关博客 · 8大题型解题通式与采分点精讲</div>
      </div>
    </div>
    <div class="nav-actions">
      <button class="btn btn-primary" onclick="startAllSequential()">
        <span>🎧 全卷磨耳朵带背</span>
      </button>
      <a href="/games/ai-trainer/#cloze" class="btn btn-mint">
        <span>🎯 实操挖空连击</span>
      </a>
      <a href="/games/ai-trainer/#theory" class="btn">
        <span>📝 理论真题</span>
      </a>
      <a href="/podcast.html" class="btn btn-blue">
        <span>🎙️ 播客频道</span>
      </a>
    </div>
  </header>

  <div class="blog-layout">

    <!-- Sticky Table of Contents Sidebar -->
    <aside class="blog-sidebar">
      <div class="sidebar-title">
        <span>📚 试卷目录索引</span>
      </div>
      <div class="toc-group">
        <a href="#strategy" class="toc-mainlink">🎯 考试大纲与时间分配战术</a>
      </div>
      <div class="toc-group">
        <a href="#templates" class="toc-mainlink">⚡ 8大题型「万能解题模版」</a>
      </div>
      {''.join(toc_html)}
    </aside>

    <!-- Main Content Stream -->
    <main class="blog-main">

      <!-- Hero Header -->
      <section class="hero-banner">
        <div class="hero-badges">
          <span class="badge badge-paper">国家职业技能等级认定</span>
          <span class="badge badge-type">三级／高级工</span>
          <span class="badge badge-num">120分钟实操考试</span>
          <span class="badge badge-mimo">🎙️ MiMo TTS 茉莉原声带背</span>
        </div>
        <h1 class="hero-title">人工智能训练师（高级/三级）实操全真题通关博客</h1>
        <p class="hero-desc">
          本博客系统梳理了 01卷（自动化营销）、09卷（验证码识别）、07卷（自然吸烟检测）共 3 套全真模拟卷、24 道实操技能大题。提炼出 8 大考核题型的解题通式与采分公式，并将 Python 算法实操代码逐行拆解。同时全网独家集成小米 MiMo TTS 茉莉原声带背，支持边看边听、倍速播放与通勤磨耳朵。
        </p>
        <div class="hero-meta-grid">
          <div class="meta-box">
            <div class="meta-label">试卷总数</div>
            <div class="meta-val">3 套全真卷</div>
          </div>
          <div class="meta-box">
            <div class="meta-label">实操大题</div>
            <div class="meta-val">24 道全收录</div>
          </div>
          <div class="meta-box">
            <div class="meta-label">题型分类</div>
            <div class="meta-val">8 大核心模版</div>
          </div>
          <div class="meta-box">
            <div class="meta-label">带背总时长</div>
            <div class="meta-val">约 90 分钟</div>
          </div>
        </div>
        <div class="hero-actions">
          <button class="btn btn-primary" onclick="startAllSequential()">
            <span>▶ 开启全卷顺序磨耳朵</span>
          </button>
          <a href="#templates" class="btn">
            <span>📖 查看8大题型模版</span>
          </a>
          <a href="/games/ai-trainer/#cloze" class="btn btn-mint">
            <span>🎯 检验学习效果（进入挖空模式）</span>
          </a>
        </div>
      </section>

      <!-- Section 1: Strategy & Timing Guide -->
      <section class="strategy-card" id="strategy">
        <h2 class="section-title">🎯 考试大纲剖析与 120 分钟考场得分战术</h2>
        <p style="font-size:14px; color:var(--ink-2); margin-bottom:12px;">
          实操技能考核总分 100 分，及格线为 60 分。题型分布严格固定为 8 个子模块。合理的时间管理是顺利拿高分的关键。
        </p>

        <div class="grid-2col">
          <div class="info-pane">
            <h4>⏱️ 120 分钟考场答题节奏推荐</h4>
            <ul>
              <li><strong>第 0~25 分钟：题1 业务流程设计（15分）</strong> —— 紧扣采集5步、处理4步、审核三率，稳拿满分。</li>
              <li><strong>第 25~45 分钟：题2 业务模块优化（15分）</strong> —— 三层归因+AB实验，快速定位瓶颈。</li>
              <li><strong>第 45~65 分钟：题3 数据规范制定（15分）</strong> —— 字段清洗+标注SOP，规范化条目输出。</li>
              <li><strong>第 65~95 分钟：题4 算法实操与代码（20-25分）</strong> —— Python代码跑通、出图出指标、写测试报告。</li>
              <li><strong>第 95~110 分钟：题5 监控 & 题6 交互（30-35分）</strong> —— 监控指标看板、人机双阈值分流。</li>
              <li><strong>第 110~120 分钟：题7 培训 & 题8 指导（10分）</strong> —— 检查答题完整性，查漏补缺。</li>
            </ul>
          </div>
          <div class="info-pane">
            <h4>💡 考场提分与防踩坑黄金法则</h4>
            <ul>
              <li><strong>采分点必须命中关键词：</strong> 考官按采分点给分。如“准确率≥95%”、“8:2划分”、“random_state=42”等硬性指标切勿写错。</li>
              <li><strong>代码题分步写分步得分：</strong> 就算最后模型预测报错，前面的导包（0.5分）、数据切分（1分）、预处理（1分）也能稳稳到手。</li>
              <li><strong>严禁交白卷：</strong> 培训大纲与指导题就算记不清细节，按通用 SOP 与分层带教框架写，也能拿到 80% 以上基础分。</li>
              <li><strong>结果文件务必按规范命名：</strong> 严格按准考证规则建立考生文件夹，注意 <code>train.csv</code>、<code>2.2.3_report.txt</code> 文件名。</li>
            </ul>
          </div>
        </div>
      </section>

      <!-- Section 2: Universal Templates -->
      <section class="strategy-card" id="templates">
        <h2 class="section-title">⚡ 实操 8 大核心题型「解题万能模版与采分公式」</h2>
        <p style="font-size:14px; color:var(--ink-2); margin-bottom:14px;">
          不管抽中 01 卷、09 卷还是 07 卷，8 道大题的底层考查逻辑完全一致。牢记以下通式即可举一反三！
        </p>

        <div class="template-box">
          <div class="template-title">模版 1：业务流程设计（15分）</div>
          <div class="template-formula">
            【采集五步】需求明确（定用途/准度） → 来源清晰（真实性/代表性） → 方式合理（API直连/频次） → 存储安全（AES加密/台账） → 更新机制（增量/周更）<br>
            【处理四步】数据清洗（去重/异常/缺失） → 数据转换（格式/归一/编码/特征） → 数据核验（规则/跨表） → 数据归档（字典/版本库）<br>
            【审核双层】三率指标（准确率/完整率/一致率） → 自动化机审全量 + 人工抽检 5%-10% → 异常闭环打回
          </div>
        </div>

        <div class="template-box">
          <div class="template-title">模版 2：业务模块效果优化（15分）</div>
          <div class="template-formula">
            【三层归因】数据层（样本倾斜/噪声多） → 模型层（欠拟合/参数不当/特征不足） → 业务层（长尾未覆盖/规则死板）<br>
            【闭环方案】针对性扩增样本清洗脏数据 → 调优超参/改用集成模型(RF/XGB) → 增加置信度人工兜底 → A/B测试验证显著性
          </div>
        </div>

        <div class="template-box">
          <div class="template-title">模版 3：数据处理规范制定（15分）</div>
          <div class="template-formula">
            【标准四部曲】入库统一格式（分辨率/命名/编码） → 清洗质检门槛（模糊/破损/无效剔除） → 标注SOP指引（统一边界/多重交叉校验） → 抽检验收（合格率≥95%，不达标整批返工）
          </div>
        </div>

        <div class="template-box">
          <div class="template-title">模版 4：算法实操与代码训练测试（20-25分）</div>
          <div class="template-formula">
            【核心四步】① 数据读取与切分(train_test_split 8:2, random_state=42) → ② 特征工程(文本TF-IDF / 图像32x32灰度展平) → ③ 模型fit与保存(joblib.dump model.pkl) → ④ 测试集预测计算Accuracy/Precision/Recall/F1，输出混淆矩阵与测试报告
          </div>
        </div>

        <div class="template-box">
          <div class="template-title">模版 5：系统监控与持续优化（15分）</div>
          <div class="template-formula">
            【监控双轮】技术性能监控（QPS、延迟、GPU显存、丢包率） + 业务质量监控（召回率、误检率、人工修改率）<br>
            【预警应急】阈值分级告警（短信/钉钉） → 异常激增触发熔断降级（切换人工/简化模型） → 难例回流触发增量更新
          </div>
        </div>

        <div class="template-box">
          <div class="template-title">模版 6：人机交互流程设计（15-20分）</div>
          <div class="template-formula">
            【双阈值路由】置信度高于上限（如90%）直接机器放行 → 置信度处于模糊带（60%~90%）推入人工复核队列 → 低于下限直接拦截预警<br>
            【人工托底】高危判罚与申诉场景必留人工通道，人工修正标注结果沉淀为负样本训练集
          </div>
        </div>

        <div class="template-box">
          <div class="template-title">模版 7：数据采集与处理培训（5分）</div>
          <div class="template-formula">
            【培训结构】分层对象（初级/中级工） → 课程大纲（采集技术/清洗SOP/质检指标） → 授课方法（理论讲授 + 沙箱实操上机） → 考核闭环（理论笔试 + 实操盲测抽检合格颁证）
          </div>
        </div>

        <div class="template-box">
          <div class="template-title">模版 8：数据指导与带教纠偏（5分）</div>
          <div class="template-formula">
            【带教流程】诊断常见痛点（漏标/格式错/逻辑混淆） → 手把手示范标准动作 → 建立典型案例错题库复盘 → 1对1跟进与长效质量追踪
          </div>
        </div>
      </section>

      <!-- Section 3, 4, 5: Paper Question Breakdown -->
      {''.join(papers_html)}

    </main>
  </div>

  <!-- Persistent Bottom Audio Player Bar -->
  <div class="audio-bar" id="audioBar">
    <div class="player-left">
      <div class="player-avatar">🎙️</div>
      <div class="player-meta">
        <span class="player-title" id="barTitle">准备就绪，点击题目播放</span>
        <span class="player-sub" id="barSub">MiMo TTS 茉莉 · 人工智能训练师精讲</span>
      </div>
    </div>

    <div class="player-center">
      <div class="player-controls">
        <button class="ctrl-btn" onclick="skipTime(-10)" title="后退10秒">⏪ 10s</button>
        <button class="ctrl-btn" onclick="playPrev()" title="上一题">⏮</button>
        <button class="ctrl-btn ctrl-play" id="btnMainPlay" onclick="togglePlay()" title="播放/暂停">▶</button>
        <button class="ctrl-btn" onclick="playNext()" title="下一题">⏭</button>
        <button class="ctrl-btn" onclick="skipTime(10)" title="快进10秒">10s ⏩</button>
      </div>
      <div class="player-progress-row">
        <span id="timeCurrent">00:00</span>
        <input type="range" id="seekSlider" value="0" min="0" max="100" step="0.1" oninput="onSeekInput()" onchange="onSeekChange()">
        <span id="timeTotal">00:00</span>
      </div>
    </div>

    <div class="player-right">
      <button class="rate-btn" id="btnRate" onclick="cyclePlaybackRate()">1.0x</button>
      <label class="loop-toggle">
        <input type="checkbox" id="chkAutoNext" checked>
        <span>自动连播</span>
      </label>
    </div>
  </div>

  <!-- Audio Element -->
  <audio id="globalAudio" preload="none"></audio>

  <script>
    // Audio Playlist Data & Player Management
    let playlist = [];
    let currentIndex = -1;
    let isSeeking = false;
    const rates = [0.75, 1.0, 1.25, 1.5, 2.0];
    let rateIdx = 1;

    const audio = document.getElementById('globalAudio');
    const barTitle = document.getElementById('barTitle');
    const barSub = document.getElementById('barSub');
    const btnMainPlay = document.getElementById('btnMainPlay');
    const seekSlider = document.getElementById('seekSlider');
    const timeCurrent = document.getElementById('timeCurrent');
    const timeTotal = document.getElementById('timeTotal');
    const btnRate = document.getElementById('btnRate');
    const chkAutoNext = document.getElementById('chkAutoNext');

    // Build playlist from question cards
    document.querySelectorAll('.question-card').forEach((card, idx) => {{
      const qid = card.dataset.qid;
      const slug = card.dataset.slug;
      const title = card.querySelector('.q-title')?.innerText || qid;
      const paperBadge = card.querySelector('.badge-paper')?.innerText || '';
      const typeBadge = card.querySelector('.badge-type')?.innerText || '';
      playlist.push({{
        index: idx,
        qid: qid,
        slug: slug,
        title: title,
        sub: paperBadge + ' · ' + typeBadge,
        card: card
      }});
    }});

    function formatTime(sec) {{
      sec = Math.floor(sec || 0);
      const m = Math.floor(sec / 60);
      const s = sec % 60;
      return String(m).padStart(2, '0') + ':' + String(s).padStart(2, '0');
    }}

    const GH_RAW = 'https://github.com/ppray/ppray.github.io/releases/download/podcast-audio';
    const AUDIO_MIRRORS = [
      'https://gh-proxy.com/' + GH_RAW,
      'https://ghfast.top/' + GH_RAW,
      GH_RAW
    ];
    let mirrorIdx = 0;

    function getAudioSrc(slug) {{
      if (location.protocol === 'file:' || location.hostname === 'localhost' || location.hostname === '127.0.0.1') {{
        return '/podcasts/ai-trainer/' + slug + '.mp3';
      }}
      return AUDIO_MIRRORS[mirrorIdx] + '/ai-trainer__' + slug + '.mp3';
    }}

    function playTrack(idx) {{
      if (idx < 0 || idx >= playlist.length) return;
      currentIndex = idx;
      const item = playlist[currentIndex];

      // Update audio source
      audio.src = getAudioSrc(item.slug);
      audio.playbackRate = rates[rateIdx];
      audio.play().catch(e => console.log('Autoplay blocked:', e));

      // Update UI
      barTitle.innerText = item.title;
      barSub.innerText = item.sub;
      btnMainPlay.innerText = '⏸';

      // Update cards UI active state
      document.querySelectorAll('.question-card').forEach(c => c.classList.remove('active-playing'));
      item.card.classList.add('active-playing');
      item.card.scrollIntoView({{ behavior: 'smooth', block: 'center' }});

      // Update trigger buttons
      document.querySelectorAll('.btn-audio').forEach(b => {{
        b.classList.remove('is-playing');
        b.querySelector('.play-icon').innerText = '▶';
        b.querySelector('.audio-text').innerText = '听带背';
      }});
      const curBtn = item.card.querySelector('.btn-audio');
      if (curBtn) {{
        curBtn.classList.add('is-playing');
        curBtn.querySelector('.play-icon').innerText = '⏸';
        curBtn.querySelector('.audio-text').innerText = '播放中';
      }}
    }}

    function togglePlay() {{
      if (currentIndex === -1) {{
        playTrack(0);
        return;
      }}
      if (audio.paused) {{
        audio.play();
        btnMainPlay.innerText = '⏸';
        const curBtn = playlist[currentIndex]?.card?.querySelector('.btn-audio');
        if (curBtn) {{
          curBtn.classList.add('is-playing');
          curBtn.querySelector('.play-icon').innerText = '⏸';
        }}
      }} else {{
        audio.pause();
        btnMainPlay.innerText = '▶';
        const curBtn = playlist[currentIndex]?.card?.querySelector('.btn-audio');
        if (curBtn) {{
          curBtn.classList.remove('is-playing');
          curBtn.querySelector('.play-icon').innerText = '▶';
        }}
      }}
    }}

    function playNext() {{
      if (currentIndex + 1 < playlist.length) {{
        playTrack(currentIndex + 1);
      }}
    }}

    function playPrev() {{
      if (currentIndex - 1 >= 0) {{
        playTrack(currentIndex - 1);
      }}
    }}

    function skipTime(delta) {{
      if (!audio.duration) return;
      audio.currentTime = Math.max(0, Math.min(audio.duration, audio.currentTime + delta));
    }}

    function cyclePlaybackRate() {{
      rateIdx = (rateIdx + 1) % rates.length;
      const r = rates[rateIdx];
      audio.playbackRate = r;
      btnRate.innerText = r + 'x';
    }}

    function onSeekInput() {{
      isSeeking = true;
    }}

    function onSeekChange() {{
      if (audio.duration) {{
        audio.currentTime = (seekSlider.value / 100) * audio.duration;
      }}
      isSeeking = false;
    }}

    audio.addEventListener('error', () => {{
      if (mirrorIdx < AUDIO_MIRRORS.length - 1) {{
        mirrorIdx++;
        if (currentIndex !== -1) {{
          audio.src = getAudioSrc(playlist[currentIndex].slug);
          audio.load();
          audio.play().catch(() => {{}});
        }}
      }}
    }});

    audio.addEventListener('timeupdate', () => {{
      if (!isSeeking && audio.duration) {{
        seekSlider.value = (audio.currentTime / audio.duration) * 100;
        timeCurrent.innerText = formatTime(audio.currentTime);
        timeTotal.innerText = formatTime(audio.duration);
      }}
    }});

    audio.addEventListener('loadedmetadata', () => {{
      timeTotal.innerText = formatTime(audio.duration);
    }});

    audio.addEventListener('ended', () => {{
      if (chkAutoNext.checked) {{
        playNext();
      }} else {{
        btnMainPlay.innerText = '▶';
      }}
    }});

    // Bind card play trigger buttons
    document.querySelectorAll('.play-trigger').forEach(btn => {{
      btn.addEventListener('click', (e) => {{
        e.stopPropagation();
        const slug = btn.dataset.slug;
        const targetIdx = playlist.findIndex(p => p.slug === slug);
        if (targetIdx !== -1) {{
          if (currentIndex === targetIdx && !audio.paused) {{
            togglePlay();
          }} else {{
            playTrack(targetIdx);
          }}
        }}
      }});
    }});

    function startAllSequential() {{
      playTrack(0);
    }}

    function playPaper(paperKey) {{
      const firstPaperItem = playlist.findIndex(p => p.qid.startsWith('prac-' + paperKey));
      if (firstPaperItem !== -1) {{
        playTrack(firstPaperItem);
      }}
    }}

    function copyCode(btn, elementId) {{
      const code = document.getElementById(elementId).innerText;
      navigator.clipboard.writeText(code).then(() => {{
        const originalText = btn.innerText;
        btn.innerText = '✓ 已复制';
        setTimeout(() => btn.innerText = originalText, 2000);
      }});
    }}
  </script>
</body>
</html>
"""

    BLOG_HTML_PATH.write_text(full_html, encoding="utf-8")
    print(f"Generated blog HTML: {BLOG_HTML_PATH} ({len(full_html)} chars)")


if __name__ == "__main__":
    render_html()
