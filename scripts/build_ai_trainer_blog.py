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
    # 三段代码均取自飞书原文「参考答案」（2026-11-14 核对），只补了原文排版丢失的空格/括号，
    # 文件名、列名、参数一律以原文为准；改动前先对照飞书文档。
    "prac-01-4": """# ==============================================================
# 01题4：顾客评价情感识别算法测试 · 参考答案代码
# 考点：train_test_split 8:2 划分、TfidfVectorizer.fit_transform、LogisticRegression、四项指标
# ==============================================================
# （1）训练集与测试集划分
import pandas as pd
from sklearn.model_selection import train_test_split

df = pd.read_csv('raw_data.csv')
X = df['review']
y = df['label']
X_train, X_test, y_train, y_test = train_test_split(
    X, y, test_size=0.2, random_state=42
)
train_df = pd.DataFrame({'review': X_train, 'label': y_train})
test_df = pd.DataFrame({'review': X_test, 'label': y_test})
train_df.to_csv('train.csv', index=False, encoding='utf-8-sig')
test_df.to_csv('test.csv', index=False, encoding='utf-8-sig')
print('数据划分完成，已保存为train.csv和test.csv')

# （2）模型训练
from sklearn.feature_extraction.text import TfidfVectorizer
from sklearn.linear_model import LogisticRegression

train_df = pd.read_csv('train.csv')
X_train = train_df['review']
y_train = train_df['label']
vectorizer = TfidfVectorizer()
X_train_vec = vectorizer.fit_transform(X_train)
model = LogisticRegression(max_iter=1000)
model.fit(X_train_vec, y_train)
print('模型训练完成！')

# （3）模型测试与性能指标计算
from sklearn.metrics import accuracy_score, precision_score, recall_score, f1_score, confusion_matrix

X_test_vec = vectorizer.transform(X_test)
y_pred = model.predict(X_test_vec)
accuracy = accuracy_score(y_test, y_pred)
precision = precision_score(y_test, y_pred)
recall = recall_score(y_test, y_pred)
f1 = f1_score(y_test, y_pred)
cm = confusion_matrix(y_test, y_pred)
print(f'准确率:{accuracy:.3f}')
print(f'精确率:{precision:.3f}')
print(f'召回率:{recall:.3f}')
print(f'F1分数:{f1:.3f}')
print(f'混淆矩阵:\\n{cm}')""",

    "prac-09-4": """# ==============================================================
# 09题4：验证码识别算法训练与测试 · 参考答案代码
# 考点：stratify 分层划分 8:2、灰度 + 32×32 像素特征、LogisticRegression、macro 平均指标
# ==============================================================
# （1）captcha_dataset_split.ipynb：训练集与测试集划分
import pandas as pd
from sklearn.model_selection import train_test_split

data = pd.read_csv(
    "captcha/label.txt",
    sep=" ",
    names=["image", "label"]
)
X = data["image"]
y = data["label"]
X_train, X_test, y_train, y_test = train_test_split(X, y, test_size=0.2,
    random_state=42, stratify=y
)
train = pd.DataFrame({"image": X_train, "label": y_train})
test = pd.DataFrame({"image": X_test, "label": y_test})
train.to_csv("captcha_train.csv", index=False)
test.to_csv("captcha_test.csv", index=False)
print("数据划分完成，已保存为 captcha_train.csv 和 captcha_test.csv")

# （2）captcha_model_train_eval.ipynb：模型训练与测试
from PIL import Image
from sklearn.linear_model import LogisticRegression
from sklearn.metrics import accuracy_score, precision_score, recall_score, f1_score

train = pd.read_csv("captcha_train.csv")
test = pd.read_csv("captcha_test.csv")

def load_image(path):
    img = Image.open(path).convert("L")
    img = img.resize((32, 32))
    return list(img.getdata())

X_train = [load_image("captcha/image/" + name) for name in train["image"]]
y_train = train["label"]
X_test = [load_image("captcha/image/" + name) for name in test["image"]]
y_test = test["label"]

model = LogisticRegression(max_iter=1000)
model.fit(X_train, y_train)

y_pred = model.predict(X_test)
accuracy = accuracy_score(y_test, y_pred)
precision = precision_score(y_test, y_pred, average="macro")
recall = recall_score(y_test, y_pred, average="macro")
f1 = f1_score(y_test, y_pred, average="macro")
print("准确率：", accuracy)
print("精确率：", precision)
print("召回率：", recall)
print("F1分数：", f1)""",

    "prac-07-4": """# ==============================================================
# 07题4：自然场景吸烟检测算法测试 · 参考答案代码
# 考点：灰度 + 32×32 像素特征、LogisticRegression、joblib 存取模型、四项指标
# ==============================================================
# （1）train.ipynb：模型训练
import pandas as pd
from PIL import Image
from sklearn.linear_model import LogisticRegression
import joblib

train = pd.read_csv("train.csv")

def load_image(path):
    img = Image.open(path).convert("L")
    img = img.resize((32, 32))
    return list(img.getdata())

X_train = [load_image("images/" + name) for name in train["image"]]
y_train = train["label"]
model = LogisticRegression(max_iter=1000)
model.fit(X_train, y_train)
joblib.dump(model, "smoking_model.pkl")
print("模型训练完成")

# （2）test.ipynb：模型测试
from sklearn.metrics import accuracy_score, precision_score, recall_score, f1_score

test = pd.read_csv("test.csv")
X_test = [load_image("images/" + name) for name in test["image"]]
y_test = test["label"]
model = joblib.load("smoking_model.pkl")
y_pred = model.predict(X_test)
accuracy = accuracy_score(y_test, y_pred)
precision = precision_score(y_test, y_pred)
recall = recall_score(y_test, y_pred)
f1 = f1_score(y_test, y_pred)
print("准确率：", accuracy)
print("精确率：", precision)
print("召回率：", recall)
print("F1分数：", f1)""",
}

# 「8 大核心题型万能模版」里的术语注释：键是弹窗标题，值是一两句大白话解释。
# 模版正文里用 {term('键')} 或 {term('键', '页面上显示的字')} 标出；只标真正的行话，
# 每个模版只标第一次出现。指标举例用 07 卷第 4 题的 TP=120、FP=30、FN=20、TN=130，
# 改了题库数字要同步这里。
GLOSSARY = {
    # 模版 1：业务流程设计
    "代表性": "采来的数据要覆盖真实场景的各种情况（不同时段、人群、地区）。只采一小撮，模型上线就会“水土不服”。",
    "API直连": "让程序通过系统开放的接口自动拉取数据，不靠人工导出、复制粘贴，又快又不容易出错。",
    "AES加密": "一种通用的加密算法，加密、解密用同一把密钥。敏感数据加密后再存，文件泄露了没有密钥也看不懂。",
    "台账": "一本登记簿：每批数据从哪来、什么时候采、谁负责、做什么用都记下来，出了问题能查到源头。",
    "增量": "每次只采新增或有变化的那部分数据，不用每次从头全部重采。",
    "异常值": "明显不合理的数值，如年龄 200 岁、金额为负数。要么修正，要么剔除。",
    "归一化": "把单位、大小不同的数值缩放到同一范围（如 0～1），免得数值大的字段“嗓门大”，盖过其他字段。",
    "类别编码": "把文字类别换成数字，模型才能计算，如 男／女 → 0／1。",
    "特征构造": "从原始字段算出更有用的新字段，如由出生日期算出年龄、由消费流水算出月均消费。",
    "跨表核验": "同一信息在不同表里对一对，如订单表的金额要和支付表一致，对不上就说明有错。",
    "数据字典": "数据的“说明书”：每个字段叫什么、什么意思、什么类型、允许填哪些值。",
    "三率指标": "衡量数据质量的三把尺子。准确率：内容写对的比例；完整率：该填的字段没空着的比例；一致率：同一信息在各处写法相同的比例。",
    "机审全量": "先让程序把全部数据自动检查一遍，一条不落，又快又省；再配人工抽检，看机器审得靠不靠谱。",
    "异常闭环": "发现问题 → 打回修改 → 复查确认，走完一圈才算结束，不能发现了就不了了之。",
    # 模版 2：业务模块效果优化
    "归因": "找原因。按数据、模型、业务三层逐层排查，定位效果差到底卡在哪一环。",
    "样本倾斜": "各类别数量相差悬殊，如 95 条正常、5 条异常。模型容易“偷懒”全猜多数类，少数类总认不出来。",
    "噪声": "数据里的错误和干扰，如标签标错、图片模糊。噪声一多，模型就会学到错东西。",
    "欠拟合": "模型太简单或训练不够，连训练数据都学不好。反面是过拟合：训练过的题全会，新题不会。",
    "长尾": "单看很少见、但种类很多的情况，如罕见口音、遮挡严重的画面。模型见得少，最容易在这里出错。",
    "扩增样本": "增加训练数据：补采真实数据，或把已有图片翻转、裁剪、调亮度“变出”新样本（数据增强）。",
    "超参": "训练前由人设定、模型自己学不出来的参数，如迭代次数 max_iter、树的棵数。调优就是试出效果最好的一组。",
    "集成模型": "把很多个简单模型（通常是决策树）的判断合起来，“三个臭皮匠，顶个诸葛亮”。RF 是随机森林，XGB 是 XGBoost。",
    "置信度": "模型对这次判断有几成把握。如“吸烟，置信度 0.92”，就是它有 92% 的把握。",
    "人工兜底／托底": "机器拿不准或风险高时，由人来做最终决定，保证不出大错。",
    "A/B测试": "把用户随机分成两组，一组用旧方案、一组用新方案，同时运行，用数据比出哪个更好。",
    "显著性": "判断两组的差距是真的还是碰巧。统计检验通过（常用 p＜0.05），才能说新方案确实更好。",
    # 模版 3：数据处理规范制定
    "文件编码": "文件的存储格式：文本统一用 UTF-8 防止乱码，图片统一 JPG 或 PNG，后面的程序才能批量处理。",
    "SOP": "标准作业程序：把每一步怎么做写成操作手册，保证不同的人做出来的结果一样。",
    "统一边界": "事先约定标到哪儿才算对：框要贴紧目标边缘、被挡住一半算不算、看不清的归哪类，大家用同一把尺子。",
    "多重交叉校验": "同一条数据由两人以上各自独立标注，结果对不上，再请第三人或专家裁定。",
    "抽检验收": "每批数据随机抽一部分检查，合格率达标（如 ≥95%）整批通过，不达标整批退回返工。",
    # 模版 4：算法实操与代码训练测试
    "train_test_split": "sklearn 的函数，把数据随机切成训练集（给模型学）和测试集（留着考模型）。test_size=0.2 就是 8:2 切分。",
    "random_state=42": "随机种子。固定这个数，每次切分的结果都一样，别人运行能复现；42 只是习惯写法，换别的数也行。",
    "特征工程": "把原始数据（文字、图片）加工成模型能计算的数字。模型只认数字。",
    "TF-IDF": "把文本变成数字的方法：一个词在这条评论里出现得越多、在所有评论里越少见，就越能代表这条评论，权重越高。",
    "32x32灰度展平": "图片先转成黑白灰度，再缩成 32×32 像素，最后把这张二维表拉成一行 1024 个数字，交给模型。",
    "fit": "训练。model.fit(训练特征, 标签) 就是让模型从训练数据里学规律。",
    "joblib.dump": "把训练好的模型存成文件（如 model.pkl）。之后用 joblib.load 读回来就能直接预测，不用重新训练。",
    "Accuracy": "准确率＝判对的 ÷ 全部＝(TP+TN) ÷ 总数。07 卷第 4 题：(120+130) ÷ 300＝83.3%。类别不均衡时会虚高。",
    "Precision": "精确率＝TP ÷ (TP+FP)：模型判“是”的里面，真“是”的占多少，管误报。07 卷第 4 题：120 ÷ 150＝80.0%。",
    "Recall": "召回率＝TP ÷ (TP+FN)：真“是”的里面，模型找出了多少，管漏报。07 卷第 4 题：120 ÷ 140＝85.7%。",
    "F1": "精确率和召回率的调和平均：2×P×R ÷ (P+R)，两个都高 F1 才高。07 卷第 4 题：2×0.80×0.857 ÷ (0.80+0.857)＝82.8%。",
    "混淆矩阵": "按“实际 × 预测”分四格：TP 实际是、判是；FP 实际不是、判是（误报）；FN 实际是、判不是（漏报）；TN 实际不是、判不是。sklearn 输出里行是实际、列是预测。",
    # 模版 5：系统监控与持续优化
    "QPS": "每秒处理的请求数（Queries Per Second），看系统忙不忙、扛不扛得住。",
    "GPU显存": "显卡自带的内存，模型运行时要占用。快满时会变慢，甚至报错崩溃。",
    "丢包率": "网络传输中丢掉的数据包比例。摄像头视频流丢包多，画面就会卡顿、漏帧。",
    "召回率": "即 Recall：该抓的里面实际抓到了多少。100 个真在吸烟的，其中 90 个被系统抓到，召回率就是 90%。",
    "误检率": "没问题却被报成有问题的比例，也就是“误报”。误报多了，值班人员会被假警报淹没。",
    "人工修改率": "机器结果被人工改掉的比例。越高说明模型越不靠谱，是很直观的业务质量指标。",
    "阈值分级告警": "给指标划警戒线并分级（如提示／警告／严重），越严重通知越急、通知的人越多。",
    "熔断降级": "熔断：模型出故障时立刻停止调用，像电闸跳闸，防止故障扩散。降级：先用人工或更简单的模型顶上，业务不停。",
    "难例回流": "把模型判错或拿不准的样本收集回来，人工标注后放回训练集，让模型专门补这块短板。",
    "增量更新": "用新收集的数据在原模型基础上继续训练、更新，不必从零全部重训。",
    # 模版 6：人机交互流程设计
    "双阈值路由": "用上下两条置信度线把结果分三路：高于上限机器直接放行，低于下限直接拦截，夹在中间的交给人。",
    "模糊带": "两条阈值之间的区间（如 60%～90%）。机器在这里最拿不准，最需要人来判断。",
    "负样本": "不属于目标类别的样本，如“没在吸烟”的画面。机器误报、被人工改正的样本就是典型负样本，加回训练集，模型就少犯同样的错。",
    # 模版 7：数据采集与处理培训
    "沙箱实操": "在和真实系统隔离的练习环境里上机操作，练错了也不会影响线上数据。",
    "盲测抽检": "用学员事先不知道答案的数据考核，再抽查结果，测出真实水平，防止“背答案”。",
    # 模版 8：数据指导与带教纠偏
    "漏标": "该标的目标没标上，如画面里两个人在吸烟只框了一个。漏标会让模型以为那不是目标。",
    "逻辑混淆": "把相近的类别或规则弄混，如把“手里拿着笔”标成“吸烟”。",
}

# 校验规则（声明式）：解释不能为空、不能超过这个长度——弹窗要一眼看完。
GLOSSARY_RULES = {"max_chars": 110}

_USED_TERMS: set = set()


def term(key: str, label: str | None = None) -> str:
    """模版公式里的一个术语：虚线下划线，点开（电脑上悬停）弹出 GLOSSARY 里的解释。"""
    tip = GLOSSARY.get(key)
    if tip is None:
        raise KeyError(
            f"术语「{key}」不在 GLOSSARY 里：先在 GLOSSARY 加上它的大白话解释，或改用已有的键"
        )
    _USED_TERMS.add(key)
    return (
        f'<span class="term" role="button" tabindex="0" aria-expanded="false" '
        f'data-term="{html.escape(key, quote=True)}" data-tip="{html.escape(tip, quote=True)}">'
        f"{html.escape(label or key)}</span>"
    )


def validate_glossary(glossary: dict | None, used: set | None, rules: dict | None = None) -> dict:
    """返回 {valid, errors[]}：每条解释非空、不超长，且确实在模版里用到。"""
    glossary = glossary or {}
    used = used or set()
    max_chars = (rules or GLOSSARY_RULES).get("max_chars", 110)
    errors = []
    for key, tip in glossary.items():
        if not isinstance(tip, str) or not tip.strip():
            errors.append(f"术语「{key}」的解释为空：写一两句大白话解释")
        elif len(tip) > max_chars:
            errors.append(f"术语「{key}」的解释有 {len(tip)} 字，超过 {max_chars} 字上限：删到一两句")
        if key not in used:
            errors.append(
                f"术语「{key}」在 GLOSSARY 里但模版里没用到：删掉它，或在模版正文里用 term('{key}') 标出"
            )
    return {"valid": not errors, "errors": errors}


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
                <span class="code-title">🐍 Python 参考答案代码（飞书原文）</span>
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
      flex-wrap: wrap;               /* 放不下时按钮整体换到下一行，而不是把按钮文字挤成竖排 */
      align-items: center;
      justify-content: space-between;
      gap: 12px 16px;
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
      flex-wrap: wrap;
      align-items: center;
      gap: 10px;
    }}
    .nav-actions .btn {{ white-space: nowrap; }}
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
        /* minmax(0, …)：1fr 的默认最小宽度是内容宽度，长代码行会把整列（和整页）撑宽 */
        grid-template-columns: minmax(0, 1fr);
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
      min-width: 0;
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

    /* 模版术语注释：虚线下划线 + 点开的大白话弹窗 */
    .term-hint {{
      font-size: 12.5px;
      color: var(--ink-3);
      margin: -8px 0 14px;
    }}
    .term {{
      border-bottom: 1.5px dotted currentColor;
      border-radius: 3px;
      padding: 0 1px;
      cursor: pointer;
      white-space: nowrap;
      -webkit-tap-highlight-color: transparent;
      transition: background .15s;
    }}
    .term[aria-expanded="true"] {{ background: var(--yellow-soft); }}
    @media (hover: hover) {{
      .term:hover {{ background: var(--yellow-soft); }}
    }}
    .term:focus {{ outline: none; }}
    .term:focus-visible {{ outline: 2px solid var(--blue); outline-offset: 2px; }}
    .term-pop {{
      position: fixed;
      left: 0;
      top: 0;
      z-index: 300;
      width: max-content;
      max-width: min(300px, calc(100vw - 24px));
      background: #fff;
      color: var(--ink);
      border: 2px solid var(--ink);
      border-radius: var(--radius-sm);
      box-shadow: 0 4px 0 var(--ink);
      padding: 10px 13px;
      font-size: 13px;
      line-height: 1.65;
      text-align: left;
    }}
    .term-pop[hidden] {{ display: none; }}
    .term-pop-title {{
      font-size: 13.5px;
      font-weight: 900;
      color: var(--blue-d);
      margin-bottom: 3px;
    }}
    .term-pop-body {{ color: var(--ink-2); }}
    @media print {{
      .term-pop {{ display: none !important; }}
      .term {{ border-bottom: 0; }}
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
      max-width: 100%;
      line-height: 1.4;
      box-shadow: 0 1px 2px rgba(0,0,0,0.05);
    }}
    /* 公式、代码片段、文件名这类不带空格的长串，在窄屏上允许断开，不把整页撑宽 */
    .answer-body, .prompt-content, .takeaway-text, .info-pane, .template-formula, .hero-desc {{
      overflow-wrap: anywhere;
      word-break: break-word;
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

    /* 手机布局：导航不再吸顶（底部已有播放条，顶部再钉一条会吃掉近四分之一屏），
       四个入口排成 2×2；卡片收窄内边距，给正文和代码留宽度 */
    @media (max-width: 680px) {{
      .blog-nav {{
        position: relative;
        gap: 10px;
        padding: 10px 12px 12px;
      }}
      .nav-brand {{ flex: 1 1 100%; min-width: 0; gap: 10px; }}
      .nav-brand > div {{ min-width: 0; }}
      .btn-back {{ width: 32px; height: 32px; flex-shrink: 0; }}
      .brand-text {{ font-size: 15px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }}
      .brand-sub {{ display: none; }}
      .nav-actions {{
        flex: 1 1 100%;
        display: grid;
        grid-template-columns: repeat(2, minmax(0, 1fr));
        gap: 8px;
      }}
      .nav-actions .btn {{ padding: 7px 8px; font-size: 12.5px; }}
      .blog-layout {{ margin: 14px auto; padding: 0 12px; gap: 20px; }}
      .blog-main {{ gap: 20px; }}
      .hero-banner {{ padding: 20px 16px; }}
      .hero-banner::after {{ font-size: 48px; }}
      .hero-title {{ font-size: 22px; }}
      .hero-desc {{ font-size: 13.5px; }}
      .strategy-card, .question-card {{ padding: 18px 14px; }}
      .paper-banner {{ padding: 16px; }}
      .section-title {{ font-size: 18px; }}
      .template-box {{ padding: 12px; }}
      .template-formula {{ padding: 8px 10px; }}
      .q-title {{ font-size: 16px; }}
      .code-box pre {{ padding: 12px; font-size: 12px; }}
      .player-controls {{ gap: 12px; }}
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
      <a href="/podcast.html?channel=ai-trainer" class="btn btn-blue">
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
              <li><strong>结果文件务必按规范命名：</strong> 严格按准考证规则建立考生文件夹，文件名以题目要求为准，如 <code>captcha_train.csv</code>、<code>captcha_test.csv</code>、<code>smoking_model.pkl</code>。</li>
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
        <p class="term-hint">💡 公式里带虚线的术语可以点开（电脑上鼠标悬停即可），看一两句话的大白话解释。</p>

        <div class="template-box">
          <div class="template-title">模版 1：业务流程设计（15分）</div>
          <div class="template-formula">
            【采集五步】需求明确（定用途/准度） → 来源清晰（真实性/{term('代表性')}） → 方式合理（{term('API直连')}/频次） → 存储安全（{term('AES加密')}/{term('台账')}） → 更新机制（{term('增量')}/周更）<br>
            【处理四步】数据清洗（去重/{term('异常值', '异常')}/缺失） → 数据转换（格式/{term('归一化', '归一')}/{term('类别编码', '编码')}/{term('特征构造', '特征')}） → 数据核验（规则/{term('跨表核验', '跨表')}） → 数据归档（{term('数据字典', '字典')}/版本库）<br>
            【审核双层】{term('三率指标')}（准确率/完整率/一致率） → 自动化{term('机审全量')} + 人工抽检 5%-10% → {term('异常闭环')}打回
          </div>
        </div>

        <div class="template-box">
          <div class="template-title">模版 2：业务模块效果优化（15分）</div>
          <div class="template-formula">
            【三层{term('归因')}】数据层（{term('样本倾斜')}/{term('噪声')}多） → 模型层（{term('欠拟合')}/参数不当/特征不足） → 业务层（{term('长尾')}未覆盖/规则死板）<br>
            【闭环方案】针对性{term('扩增样本')}清洗脏数据 → 调优{term('超参')}/改用{term('集成模型', '集成模型(RF/XGB)')} → 增加{term('置信度')}{term('人工兜底／托底', '人工兜底')} → {term('A/B测试')}验证{term('显著性')}
          </div>
        </div>

        <div class="template-box">
          <div class="template-title">模版 3：数据处理规范制定（15分）</div>
          <div class="template-formula">
            【标准四部曲】入库统一格式（分辨率/命名/{term('文件编码', '编码')}） → 清洗质检门槛（模糊/破损/无效剔除） → 标注{term('SOP')}指引（{term('统一边界')}/{term('多重交叉校验')}） → {term('抽检验收')}（合格率≥95%，不达标整批返工）
          </div>
        </div>

        <div class="template-box">
          <div class="template-title">模版 4：算法实操与代码训练测试（20-25分）</div>
          <div class="template-formula">
            【核心四步】① 数据读取与切分({term('train_test_split')} 8:2, {term('random_state=42')}) → ② {term('特征工程')}(文本{term('TF-IDF')} / 图像{term('32x32灰度展平')}) → ③ 模型{term('fit')}与保存({term('joblib.dump')} model.pkl) → ④ 测试集预测计算{term('Accuracy')}/{term('Precision')}/{term('Recall')}/{term('F1')}，输出{term('混淆矩阵')}与测试报告
          </div>
        </div>

        <div class="template-box">
          <div class="template-title">模版 5：系统监控与持续优化（15分）</div>
          <div class="template-formula">
            【监控双轮】技术性能监控（{term('QPS')}、延迟、{term('GPU显存')}、{term('丢包率')}） + 业务质量监控（{term('召回率')}、{term('误检率')}、{term('人工修改率')}）<br>
            【预警应急】{term('阈值分级告警')}（短信/钉钉） → 异常激增触发{term('熔断降级')}（切换人工/简化模型） → {term('难例回流')}触发{term('增量更新')}
          </div>
        </div>

        <div class="template-box">
          <div class="template-title">模版 6：人机交互流程设计（15-20分）</div>
          <div class="template-formula">
            【{term('双阈值路由')}】{term('置信度')}高于上限（如90%）直接机器放行 → 置信度处于{term('模糊带')}（60%~90%）推入人工复核队列 → 低于下限直接拦截预警<br>
            【{term('人工兜底／托底', '人工托底')}】高危判罚与申诉场景必留人工通道，人工修正标注结果沉淀为{term('负样本')}训练集
          </div>
        </div>

        <div class="template-box">
          <div class="template-title">模版 7：数据采集与处理培训（5分）</div>
          <div class="template-formula">
            【培训结构】分层对象（初级/中级工） → 课程大纲（采集技术/清洗{term('SOP')}/质检指标） → 授课方法（理论讲授 + {term('沙箱实操')}上机） → 考核闭环（理论笔试 + 实操{term('盲测抽检')}合格颁证）
          </div>
        </div>

        <div class="template-box">
          <div class="template-title">模版 8：数据指导与带教纠偏（5分）</div>
          <div class="template-formula">
            【带教流程】诊断常见痛点（{term('漏标')}/格式错/{term('逻辑混淆')}） → 手把手示范标准动作 → 建立典型案例错题库复盘 → 1对1跟进与长效质量追踪
          </div>
        </div>
      </section>

      <!-- Section 3, 4, 5: Paper Question Breakdown -->
      {''.join(papers_html)}

    </main>
  </div>

  <!-- 模版术语弹窗（全页共用一个） -->
  <div class="term-pop" id="termPop" role="tooltip" hidden>
    <div class="term-pop-title"></div>
    <div class="term-pop-body"></div>
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
      return AUDIO_MIRRORS[mirrorIdx] + '/' + slug + '.mp3';
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

    // 8 大模版术语弹窗：点一下打开/再点关闭；电脑上悬停预览、点击固定；
    // 点空白处或按 Esc 关闭。弹窗避开顶部导航和底部播放条，放不下就翻到术语上方。
    (function () {{
      const pop = document.getElementById('termPop');
      const terms = document.querySelectorAll('.term');
      if (!pop || !terms.length) return;
      const popTitle = pop.querySelector('.term-pop-title');
      const popBody = pop.querySelector('.term-pop-body');
      const header = document.querySelector('.blog-nav');
      const bar = document.getElementById('audioBar');
      const canHover = !!(window.matchMedia && window.matchMedia('(hover: hover) and (pointer: fine)').matches);
      let current = null;
      let pinned = false;
      let rafId = 0;

      function close() {{
        if (!current) return;
        current.setAttribute('aria-expanded', 'false');
        current.removeAttribute('aria-describedby');
        current = null;
        pinned = false;
        pop.hidden = true;
      }}

      // 以用户实际看到的区域（visual viewport）为界：手机上页面被撑宽或双指缩放时，
      // 布局视口比屏幕大，按 innerWidth/innerHeight 算会把弹窗放到屏幕外。
      function visibleBox() {{
        const vv = window.visualViewport;
        const x = vv ? vv.offsetLeft : 0;
        const y = vv ? vv.offsetTop : 0;
        const w = vv ? vv.width : document.documentElement.clientWidth;
        const h = vv ? vv.height : window.innerHeight;
        const top = Math.max(header ? header.getBoundingClientRect().bottom : 0, y);
        const bottom = Math.min(bar ? bar.getBoundingClientRect().top : Infinity, y + h);
        return {{ left: x, right: x + w, top: top, bottom: bottom }};
      }}

      function place() {{
        rafId = 0;
        if (!current) return;
        const r = current.getBoundingClientRect();
        const box = visibleBox();
        const topLimit = box.top;
        const bottomLimit = box.bottom;
        if (r.bottom <= topLimit || r.top >= bottomLimit) {{ close(); return; }}
        const gap = 8;
        const margin = 12;
        const w = pop.offsetWidth;
        const h = pop.offsetHeight;
        const left = Math.min(Math.max(r.left + r.width / 2 - w / 2, box.left + margin), box.right - w - margin);
        let top = r.bottom + gap;
        if (top + h > bottomLimit - margin && r.top - gap - h >= topLimit + margin) top = r.top - gap - h;
        pop.style.left = Math.round(left) + 'px';
        pop.style.top = Math.round(top) + 'px';
      }}

      function schedule() {{
        if (current && !rafId) rafId = requestAnimationFrame(place);
      }}

      function open(el, pin) {{
        if (current && current !== el) close();
        current = el;
        pinned = pin;
        popTitle.textContent = el.dataset.term || el.textContent;
        popBody.textContent = el.dataset.tip || '';
        el.setAttribute('aria-expanded', 'true');
        el.setAttribute('aria-describedby', 'termPop');
        pop.hidden = false;
        place();
      }}

      terms.forEach(el => {{
        el.addEventListener('click', e => {{
          e.stopPropagation();
          if (current === el && pinned) close();
          else open(el, true);
        }});
        el.addEventListener('keydown', e => {{
          if (e.key === 'Enter' || e.key === ' ') {{
            e.preventDefault();
            el.click();
          }}
        }});
        if (canHover) {{
          el.addEventListener('mouseenter', () => {{ if (!pinned) open(el, false); }});
          el.addEventListener('mouseleave', () => {{ if (!pinned && current === el) close(); }});
        }}
      }});

      document.addEventListener('pointerdown', e => {{
        if (!current) return;
        const t = e.target;
        if (t && t.closest && (t.closest('.term') || t.closest('#termPop'))) return;
        close();
      }});
      document.addEventListener('keydown', e => {{
        if (e.key === 'Escape' && current) {{
          const el = current;
          close();
          el.focus();
        }}
      }});
      window.addEventListener('scroll', schedule, {{ passive: true }});
      window.addEventListener('resize', schedule);
      if (window.visualViewport) {{
        window.visualViewport.addEventListener('scroll', schedule);
        window.visualViewport.addEventListener('resize', schedule);
      }}
    }})();
  </script>
</body>
</html>
"""

    check = validate_glossary(GLOSSARY, _USED_TERMS)
    if not check["valid"]:
        raise SystemExit("术语注释校验未通过，blog.html 未改动：\n  " + "\n  ".join(check["errors"]))

    BLOG_HTML_PATH.write_text(full_html, encoding="utf-8")
    print(f"Generated blog HTML: {BLOG_HTML_PATH} ({len(full_html)} chars)")


if __name__ == "__main__":
    render_html()
