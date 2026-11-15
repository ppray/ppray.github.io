#!/usr/bin/env python3
"""
Generate MP3 audio podcasts and per-question narration for AI Trainer (Level 3) practical exam questions.

Source: games/ai-trainer/bank.json
Pipeline:
  1. Extract practical questions (24 questions across papers 01, 09, 07)
  2. Format spoken Chinese narration script (scoring points, prompt, standard answer, code explanation)
  3. Chunk text if necessary, call Xiaomi MiMo TTS to generate WAVs in cache
  4. Merge into per-question MP3s (ai-trainer-01-1.mp3 ... ai-trainer-07-8.mp3)
  5. Merge into 3 full-paper podcast episodes (ai-trainer-paper-01.mp3, 09, 07)
  6. Output manifest.json (for blog.html inline player) and episodes.json (for podcast.html)
"""

from __future__ import annotations

import argparse
import json
import os
import re
import sys
import time
from concurrent.futures import ThreadPoolExecutor, as_completed
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
from podcast_common import (  # noqa: E402
    ROOT,
    MIMO_ENDPOINT,
    STYLE,
    VOICE_DEFAULT,
    run,
    load_env_file,
    synthesize_wav,
    probe_duration,
    make_silence,
    merge_wavs_to_mp3,
)

BANK_JSON = ROOT / "games" / "ai-trainer" / "bank.json"
OUT_DIR = ROOT / "podcasts" / "ai-trainer"
CACHE_DIR = OUT_DIR / ".cache"
MANIFEST_FILE = OUT_DIR / "manifest.json"
EPISODES_FILE = OUT_DIR / "episodes.json"

VOICE = VOICE_DEFAULT
BITRATE = "40k"
TTS_TIMEOUT = 120

PAPER_NAMES = {
    "01": "01卷 · 自动化营销与客户体验质检",
    "09": "09卷 · 验证码识别与RPA自动化",
    "07": "07卷 · 自然场景吸烟检测与视觉安全",
}

QUESTION_TYPE_NAMES = {
    "1": "业务流程设计",
    "2": "业务模块效果优化",
    "3": "数据处理规范制定",
    "4": "算法训练与测试（代码实操）",
    "5": "系统监控和优化",
    "6": "人机交互流程设计",
    "7": "数据培训能力考核",
    "8": "数据指导能力考核",
}


def clean_text_for_speech(text: str) -> str:
    """Clean markdown, punctuation, and abbreviations for natural Chinese speech."""
    s = text
    # Remove scores in parentheses e.g. (5分), （15分）
    s = re.sub(r"[（\(][\d\.]+\s*分[）\)]", "", s)
    s = re.sub(r"[（\(][^）\)]*?分[）\)]", "", s)
    # Remove HTML tags
    s = re.sub(r"<[^>]+>", "", s)
    # Symbols
    s = s.replace(">=", "大于等于").replace("≥", "大于等于")
    s = s.replace("<=", "小于等于").replace("≤", "小于等于")
    s = s.replace(">", "大于").replace("<", "小于")
    s = s.replace("≠", "不等于").replace("=", "等于")
    s = s.replace("×", "乘").replace("*", "乘")
    s = s.replace("~", "至").replace("～", "至")
    s = s.replace("【", "").replace("】", "")
    s = s.replace("`", "")
    s = s.replace("#", "")
    # Acronyms spaced out for natural reading
    acronyms = {
        "RFM": "R F M",
        "CRM": "C R M",
        "API": "A P I",
        "AES": "A E S",
        "OCR": "O C R",
        "RPA": "R P A",
        "CNN": "C N N",
        "KNN": "K N N",
        "SVM": "S V M",
        "NLP": "N L P",
        "CV": "计算机视觉",
        "SOP": "S O P",
        "IoU": "I o U",
        "mAP": "m A P",
        "AUC": "A U C",
        "ROC": "R O C",
        "TF-IDF": "T F - I D F",
        "PIL": "P I L",
        "CSV": "C S V",
        "JSON": "J S O N",
        "HTML": "H T M L",
        "URL": "U R L",
        "IP": "I P",
        "TP": "T P",
        "FP": "F P",
        "FN": "F N",
        "TN": "T N",
        "F1": "F 1",
        "BERT": "B E R T",
        "N-gram": "N gram",
        "N-Gram": "N gram",
    }
    for k, v in acronyms.items():
        s = re.sub(r"\b" + k + r"\b", v, s)

    # Normalize whitespace & punctuation
    s = re.sub(r"[\r\n]+", "。", s)
    s = re.sub(r"[ \t]+", " ", s)
    s = re.sub(r"[，,]{2,}", "，", s)
    s = re.sub(r"[。\.]{2,}", "。", s)
    return s.strip("。， ")


# Handcrafted spoken scripts for coding questions so they sound professional, concise,
# avoid reading syntax, and state all functions/parameters clearly.
SPECIAL_QUESTION_SPOKEN_ANSWERS = {
    "prac-01-4": (
        "第一部分，数据划分与保存：采用8比2比例将原始数据划分为训练集80%和测试集20%。"
        "使用sklearn中的train_test_split函数，设置参数test_size等于0.2，random_state等于42保证实验结果可复现；"
        "调用to_csv方法将结果分别保存为train.csv和test.csv。"
        "第二部分，模型训练方案说明与关键实现：采用TF-IDF词频逆文档频率进行文本特征提取，"
        "使用TfidfVectorizer提取文本特征，调用fit_transform方法拟合转换训练集；"
        "分类算法使用LogisticRegression逻辑回归分类器，设置参数max_iter等于1000，调用fit方法完成模型训练拟合。"
        "第三部分，模型测试与性能指标评测：测试阶段调用vectorizer的transform方法转换测试集特征，"
        "调用模型的predict方法进行情感预测；调用sklearn.metrics模块中的accuracy_score计算准确率、"
        "precision_score计算精确率、recall_score计算召回率、f1_score计算F1分数，以及confusion_matrix计算混淆矩阵。"
        "根据已知数据TP等于150、FP等于30、FN等于20、TN等于200，总样本400条进行指标计算："
        "准确率Accuracy为150加200除以400，等于87.5%；"
        "精确率Precision为150除以150加30，约等于83.3%；"
        "召回率Recall为150除以150加20，约等于88.2%；"
        "F1分数为2乘精确率乘召回率除以两者之和，约等于85.7%。"
        "第四部分，五段式测试报告：第一，项目背景，说明电商平台顾客评价情感识别任务与TF-IDF加逻辑回归算法方案；"
        "第二，测试目的，评估模型分类性能，期望准确率达到85%以上，F1分数达到0.80以上；"
        "第三，测试方法，说明8比2数据切分、TF-IDF特征提取与LogisticRegression训练评测流程；"
        "第四，测试结果及分析，汇报四项关键指标与混淆矩阵，分析FP假正例偏多反映出的过度乐观倾向，容易将部分含蓄消极差评误判为好评；"
        "第五，改进建议，定向补充含蓄差评与反讽样本，在特征层面引入否定词、情感词典及N-gram特征，并尝试对比支持向量机SVM或朴素贝叶斯模型。"
        "第五部分，错误案例分析：案例一，评价描述包装太用心了盒子破了大洞，真实为消极，模型预测为积极。"
        "原因在于模型仅识别到用心的正面词义，未能理解引号与上下文构成的讽刺反语；"
        "纠正措施为扩充讽刺反语样本，在特征层面增加反语标记和引号特征，或引入BERT上下文语义模型。"
        "案例二，评价描述还好吧没有想象中那么惊艳，真实为消极，模型预测为积极。"
        "原因在于模型未能识别没有想象中表达的委婉失望；"
        "纠正措施为补充委婉差评样本，增加短语和N-gram特征提升隐含情感识别能力。"
    ),
    "prac-09-4": (
        "第一部分，数据划分与保存：将8比2划分好的训练集和测试集分别保存为train.csv和test.csv。"
        "第二部分，模型训练与测试方案：图像预处理使用PIL库中的Image.open打开验证码图片，"
        "调用convert方法转换为L单通道灰度图，调用resize方法统一缩放为32乘32像素尺寸，"
        "通过getdata方法提取像素值序列作为输入特征；"
        "模型训练使用sklearn中的LogisticRegression逻辑回归分类器，设置参数max_iter等于1000，"
        "调用fit方法在训练特征集上拟合；测试阶段调用模型的predict方法预测测试集标签；"
        "评估阶段调用accuracy_score计算准确率，调用precision_score、recall_score、f1_score并设置参数average等于macro计算多分类宏平均指标。"
        "第三部分，性能指标计算：已知TP等于80，FP等于20，FN等于20，TN等于80，总数200条。"
        "准确率Accuracy为80加80除以200，等于80%；"
        "精确率Precision为80除以80加20，等于80%；"
        "召回率Recall为80除以80加20，等于80%；"
        "F1分数为2乘0.8乘0.8除以0.8加0.8，等于80%。"
        "第四部分，五段式测试报告：第一，项目背景，说明RPA网页表单自动填写的验证码识别任务；"
        "第二，测试目的，评估验证码分类性能，检验是否达到准确率80%以上的业务达标要求；"
        "第三，测试方法，说明8比2数据划分、32乘32灰度特征提取与LogisticRegression建模过程；"
        "第四，测试结果及分析，汇报四项80%指标及对称混淆矩阵，指出模型对强干扰线、模糊扭曲的复杂验证码识别能力仍显不足；"
        "第五，改进建议，扩充多样字体、干扰线和扭曲变形样本库，增加图像去噪与二值化预处理，并尝试卷积神经网络CNN等视觉模型。"
        "第五部分，错误案例分析：案例一，真实标签为1有效验证码，模型预测为0无效验证码。"
        "原因在于干扰线与噪点破坏了字符特征；纠正措施为扩充带干扰线样本，并在图像预处理中增加去噪与边缘增强算法。"
        "案例二，真实标签为0无效验证码，模型预测为1有效验证码。"
        "原因在于无效样本量不足且特征重叠；纠正措施为增加模糊争议负样本，重新训练并结合置信度阈值和人工复核兜底。"
    ),
    "prac-07-4": (
        "第一部分，模型训练与持久化保存：图像预处理使用PIL图像处理库的Image.open读取图片，"
        "调用convert方法转换为L单通道灰度图，调用resize方法统一缩放为32乘32像素尺寸，"
        "提取像素值列表作为模型特征；分类模型使用LogisticRegression逻辑回归分类器，设置参数max_iter等于1000，"
        "调用fit方法在训练集上完成模型训练；导入joblib库，调用dump方法将训练好的模型持久化保存为smoking_model.pkl文件。"
        "第二部分，模型测试与性能评估：测试阶段使用joblib的load方法加载已保存的smoking_model.pkl模型文件，"
        "调用模型的predict方法在测试集特征上进行吸烟二分类预测；"
        "调用sklearn.metrics模块中的accuracy_score计算准确率、precision_score计算精确率、"
        "recall_score计算召回率、f1_score计算F1分数。"
        "第三部分，性能指标计算与测试报告：已知TP等于120，FP等于30，FN等于20，TN等于130，样本总数300条。"
        "准确率Accuracy为120加130除以300，约等于83.3%；"
        "精确率Precision为120除以120加30，等于80.0%；"
        "召回率Recall为120除以120加20，约等于85.7%；"
        "F1分数为2乘0.80乘0.857除以两者之和，约等于82.8%。"
        "五段式测试报告规范：第一，项目背景，说明公共场所自然场景吸烟视觉检测任务背景与技术路线；"
        "第二，测试目的，评估吸烟二分类模型在实际场景中的识别效果，要求准确率与F1分数均达到80%以上；"
        "第三，测试方法，说明32乘32灰度特征与LogisticRegression模型训练及评测方案；"
        "第四，测试结果及分析，汇报四项达标指标与混淆矩阵，分析弱光、远距离及遮挡情况下的漏检和误检成因；"
        "第五，改进建议，针对性扩充逆光、夜间弱光、手部严重遮挡及远景吸烟样本。"
        "第四部分，典型错误案例分析：针对吸烟漏检案例，即真实有吸烟行为但模型预测为未吸烟。"
        "深层原因归因：手部遮挡导致香烟露出特征微弱，且监控弱光环境下对比度不足；"
        "针对性纠正措施：在数据采集层面补充遮挡与弱光吸烟样本；在预处理层面增加直方图均衡化提高对比度，并引入边缘检测算子强化微小目标轮廓。"
    ),
}


def strip_code_for_speech(raw_text: str) -> str:
    """
    Remove raw programming syntax lines, code fences, imports, and variable assignments
    from spoken audio narration, leaving descriptive natural text.
    """
    lines = raw_text.splitlines()
    clean_lines = []
    in_code_fence = False
    for line in lines:
        stripped = line.strip()
        if stripped.startswith("```"):
            in_code_fence = not in_code_fence
            continue
        if in_code_fence:
            continue
        # Skip import statements or python code lines
        if re.match(
            r"^(?:import\s+|from\s+\w+\s+import|def\s+\w+|class\s+\w+|return\b|print\(|#\s*)",
            stripped,
        ):
            continue
        # Skip variable assignment lines e.g. df = pd.read_csv...
        if re.match(r"^[A-Za-z_][A-Za-z0-9_]*\s*=\s*", stripped) and any(
            kw in stripped for kw in ["pd.", "np.", "Image.", "load_image", "read_csv", "DataFrame", "score", "dump", "load", "model.", "vectorizer."]
        ):
            continue
        clean_lines.append(line)
    return "\n".join(clean_lines)


def build_question_narration(q: dict) -> tuple[str, str, str]:
    """
    Build spoken narration for a practical question.
    Returns: (full_speech_text, prompt_summary, takeaway_summary)
    """
    qid = q["id"]
    title = q["title"]
    paper_key = q["paperKey"]
    paper_name = PAPER_NAMES.get(paper_key, q.get("paperName", ""))
    sub_no = qid.split("-")[-1]
    qtype_name = QUESTION_TYPE_NAMES.get(sub_no, "实操技能题")

    # If handcrafted spoken answer exists (e.g. coding questions where raw code must not be read)
    if qid in SPECIAL_QUESTION_SPOKEN_ANSWERS:
        raw_answer = SPECIAL_QUESTION_SPOKEN_ANSWERS[qid]
    else:
        # Reconstruct standard answer
        ans_parts = []
        for it in q["p"]:
            if isinstance(it, int):
                ans_parts.append(q["b"][it])
            else:
                ans_parts.append(it)
        raw_answer = "".join(ans_parts)
        raw_answer = strip_code_for_speech(raw_answer)

    # Summarize prompt
    prompt_lines = [l.strip() for l in q["prompt"].splitlines() if l.strip()]
    prompt_brief = prompt_lines[0] if prompt_lines else "根据业务场景完成实操设计"
    if len(prompt_brief) > 120:
        prompt_brief = prompt_brief[:115] + "等业务需求"

    answer_spoken = clean_text_for_speech(raw_answer)

    # Takeaway summaries based on question type
    takeaways = {
        "1": "业务流程设计通关口诀：需求明确定指标，来源清晰查真实，方式合理保时效，安全合规做备份，定期更新维生命周期。",
        "2": "业务效果优化通关口诀：三层归因查瓶颈，数据清洗补缺失，模型调优重验证，线上业务加兜底。",
        "3": "数据处理规范通关口诀：入库清洗排脏污，标注统一设质检，三率指标卡阈值，异常复盘建台账。",
        "4": "算法实操代码通关口诀：数据切分八比二，灰度缩放三十二，逻辑回归fit拟合，四维指标写报告。",
        "5": "系统监控优化通关口诀：性能业务双监控，阈值报警防漂移，熔断降级保可用，数据回流促闭环。",
        "6": "人机交互设计通关口诀：人机协同分边界，高低置信设分流，机器主攻高效率，人工托底控风险。",
        "7": "培训考核通关口诀：明确目标分层次，理论实操相结合，SOP动作要规范，考评验收建闭环。",
        "8": "指导考核通关口诀：找准痛点析成因，示范纠错手把手，案例复盘提认知，长效追踪促改进。",
    }
    takeaway = takeaways.get(sub_no, "实操通关法则：紧扣采分点，规范分步骤作答。")

    speech = (
        f"人工智能训练师高级实操精讲。"
        f"{paper_name}，第{sub_no}题：{title}。考核题型：{qtype_name}。"
        f"业务背景与核心任务：{prompt_brief}。"
        f"标准作答与采分重点如下：{answer_spoken}。"
        f"通关要点与记忆口诀：{takeaway}"
    )
    speech = re.sub(r"[。\.]{2,}", "。", speech)
    return speech, prompt_brief, takeaway


def chunk_text(text: str, max_chunk: int = 750) -> list[str]:
    """Split speech text into manageable chunks at sentence boundaries."""
    if len(text) <= max_chunk:
        return [text]

    sentences = re.split(r"(?<=[。；！？])", text)
    chunks = []
    cur = ""
    for s in sentences:
        if not s:
            continue
        if len(cur) + len(s) <= max_chunk:
            cur += s
        else:
            if cur:
                chunks.append(cur)
            if len(s) > max_chunk:
                # Sub-split long sentence by comma
                sub_parts = re.split(r"(?<=[，,])", s)
                sub_cur = ""
                for p in sub_parts:
                    if len(sub_cur) + len(p) <= max_chunk:
                        sub_cur += p
                    else:
                        if sub_cur:
                            chunks.append(sub_cur)
                        sub_cur = p
                if sub_cur:
                    cur = sub_cur
                else:
                    cur = ""
            else:
                cur = s
    if cur:
        chunks.append(cur)
    return chunks


def synthesize_question_audio(
    q: dict,
    api_key: str,
    *,
    voice: str = VOICE,
    endpoint: str = MIMO_ENDPOINT,
    force: bool = False,
) -> dict:
    """Synthesize audio for a single practical question."""
    qid = q["id"]
    paper_key = q["paperKey"]
    sub_no = qid.split("-")[-1]
    slug = f"ai-trainer-{paper_key}-{sub_no}"
    mp3_path = OUT_DIR / f"{slug}.mp3"

    speech_text, prompt_brief, takeaway = build_question_narration(q)
    chunks = chunk_text(speech_text, max_chunk=750)

    chunk_wavs = []
    for idx, chunk in enumerate(chunks):
        c_slug = f"{slug}-c{idx+1}"
        wav_path = CACHE_DIR / f"{c_slug}.wav"
        if not wav_path.exists() or wav_path.stat().st_size < 1024 or force:
            print(f"  [{slug}] TTS chunk {idx+1}/{len(chunks)} ({len(chunk)} chars)...")
            synthesize_wav(
                chunk,
                wav_path,
                api_key=api_key,
                voice=voice,
                endpoint=endpoint,
                timeout=TTS_TIMEOUT,
            )
        chunk_wavs.append(wav_path)

    # Concat chunk wavs into single MP3
    silence_05 = CACHE_DIR / "silence_0_5s.wav"
    silence_10 = CACHE_DIR / "silence_1_0s.wav"
    make_silence(silence_05, 0.5)
    make_silence(silence_10, 1.0)

    concat_file = CACHE_DIR / f"{slug}.concat.txt"
    with concat_file.open("w", encoding="utf-8") as f:
        for w in chunk_wavs:
            f.write(f"file '{w}'\n")
            f.write(f"file '{silence_05}'\n")
        f.write(f"file '{silence_10}'\n")

    if not mp3_path.exists() or mp3_path.stat().st_size < 1024 or force:
        proc = run([
            "ffmpeg", "-y",
            "-f", "concat", "-safe", "0", "-i", str(concat_file),
            "-ar", "24000", "-ac", "1",
            "-codec:a", "libmp3lame", "-b:a", BITRATE,
            str(mp3_path),
        ])
        if proc.returncode != 0:
            raise RuntimeError(f"ffmpeg failed for {slug}: {proc.stderr}")

    dur = probe_duration(mp3_path)
    sz = mp3_path.stat().st_size if mp3_path.exists() else 0

    return {
        "id": qid,
        "index": q.get("index", 1),
        "slug": slug,
        "title": q["title"],
        "paperKey": paper_key,
        "paperName": PAPER_NAMES.get(paper_key, q.get("paperName", "")),
        "subNo": int(sub_no),
        "qtypeName": QUESTION_TYPE_NAMES.get(sub_no, "实操技能"),
        "file": f"podcasts/ai-trainer/{slug}.mp3",
        "duration": round(dur, 1),
        "size": sz,
        "promptBrief": prompt_brief,
        "takeaway": takeaway,
        "charCount": len(speech_text),
    }


def merge_paper_podcast(
    paper_key: str,
    paper_name: str,
    question_items: list[dict],
    api_key: str,
    *,
    voice: str = VOICE,
    endpoint: str = MIMO_ENDPOINT,
    force: bool = False,
) -> dict:
    """Merge 8 questions of a paper into one full-paper podcast episode."""
    slug = f"ai-trainer-paper-{paper_key}"
    mp3_path = OUT_DIR / f"{slug}.mp3"

    intro_wav = CACHE_DIR / f"{slug}-intro.wav"
    if not intro_wav.exists() or intro_wav.stat().st_size < 1024 or force:
        intro_text = (
            f"欢迎收听人工智能训练师高级实操全真试卷带背。"
            f"本期节目为{paper_name}，全卷共8道实操大题，涵盖业务流程设计、效果优化、"
            f"数据规范、算法实操、系统监控、人机交互、培训考核与指导考核。"
            f"现在，让我们开始第1题。"
        )
        synthesize_wav(intro_text, intro_wav, api_key=api_key, voice=voice, endpoint=endpoint)

    outro_wav = CACHE_DIR / f"{slug}-outro.wav"
    if not outro_wav.exists() or outro_wav.stat().st_size < 1024 or force:
        outro_text = (
            f"{paper_name}实操全部8道大题带背完毕。"
            f"建议结合通关博客与挖空连击系统反复强化练习。祝您顺利通过考试！"
        )
        synthesize_wav(outro_text, outro_wav, api_key=api_key, voice=voice, endpoint=endpoint)

    silence_2s = CACHE_DIR / "silence_2s.wav"
    make_silence(silence_2s, 2.0)

    concat_file = CACHE_DIR / f"{slug}.concat.txt"
    with concat_file.open("w", encoding="utf-8") as f:
        f.write(f"file '{intro_wav}'\n")
        f.write(f"file '{silence_2s}'\n")
        for item in question_items:
            # We can use the individual mp3 or chunk wavs
            sub_slug = item["slug"]
            # Find chunk wavs
            c_wavs = sorted(CACHE_DIR.glob(f"{sub_slug}-c*.wav"))
            for cw in c_wavs:
                f.write(f"file '{cw}'\n")
            f.write(f"file '{silence_2s}'\n")
        f.write(f"file '{outro_wav}'\n")

    if not mp3_path.exists() or mp3_path.stat().st_size < 1024 or force:
        proc = run([
            "ffmpeg", "-y",
            "-f", "concat", "-safe", "0", "-i", str(concat_file),
            "-ar", "24000", "-ac", "1",
            "-codec:a", "libmp3lame", "-b:a", BITRATE,
            str(mp3_path),
        ])
        if proc.returncode != 0:
            raise RuntimeError(f"ffmpeg failed for episode {slug}: {proc.stderr}")

    dur = probe_duration(mp3_path)
    sz = mp3_path.stat().st_size if mp3_path.exists() else 0

    return {
        "slug": slug,
        "title": f"人工智能训练师（高级）实操 · {paper_name}",
        "paperKey": paper_key,
        "file": f"podcasts/ai-trainer/{slug}.mp3",
        "duration_seconds": round(dur),
        "size_bytes": sz,
        "question_count": len(question_items),
        "desc": f"涵盖{paper_name}全部8道实操大题的标准作答与核心采分点，采用MiMo TTS茉莉原声带背。",
    }


def main() -> int:
    parser = argparse.ArgumentParser(description="Generate AI Trainer practical audio using MiMo TTS")
    parser.add_argument("--dry-run", action="store_true", help="Print scripts without calling TTS")
    parser.add_argument("--force", action="store_true", help="Force re-synthesis even if cached")
    parser.add_argument("--paper", help="Filter by paper: 01, 09, or 07")
    parser.add_argument("--question", help="Filter by question ID e.g. prac-01-1")
    parser.add_argument("--voice", default=VOICE, help="TTS voice name")
    parser.add_argument("--workers", type=int, default=3, help="Concurrent worker count")
    args = parser.parse_args()

    load_env_file(Path.home() / ".hermes" / ".env", override=True)
    api_key = os.environ.get("MIMO_KEY")
    if not api_key and not args.dry_run:
        print("ERROR: MIMO_KEY not found in ~/.hermes/.env", file=sys.stderr)
        return 1

    with BANK_JSON.open("r", encoding="utf-8") as f:
        bank = json.load(f)

    questions = bank.get("practical", [])
    if args.paper:
        questions = [q for q in questions if q["paperKey"] == args.paper]
    if args.question:
        questions = [q for q in questions if q["id"] == args.question]

    print(f"Loaded {len(questions)} practical questions.")

    if args.dry_run:
        print("\n=== DRY RUN MODE: PREVIEWING NARRATION SCRIPTS ===")
        total_chars = 0
        for i, q in enumerate(questions, 1):
            text, brief, takeaway = build_question_narration(q)
            chunks = chunk_text(text)
            total_chars += len(text)
            print(f"\n[{i:02d}] {q['id']} - {q['title']}")
            print(f"     Length: {len(text)} chars | Chunks: {len(chunks)} | Brief: {brief[:50]}...")
            print(f"     Takeaway: {takeaway}")
            print(f"     Preview: {text[:160]}...")
        print(f"\nTotal characters across {len(questions)} questions: {total_chars} chars.")
        est_minutes = round(total_chars / 3.5 / 60, 1)
        print(f"Estimated total audio duration: ~{est_minutes} minutes.")
        return 0

    OUT_DIR.mkdir(parents=True, exist_ok=True)
    CACHE_DIR.mkdir(parents=True, exist_ok=True)

    print(f"\nSynthesizing {len(questions)} practical questions using MiMo TTS ({args.voice})...")

    # Generate each question
    manifest_items = [None] * len(questions)
    t0 = time.time()

    def process_one(idx_q):
        idx, q = idx_q
        print(f"--> [{idx+1}/{len(questions)}] Starting {q['id']} - {q['title']}")
        try:
            item = synthesize_question_audio(
                q,
                api_key=api_key,
                voice=args.voice,
                endpoint=MIMO_ENDPOINT,
                force=args.force,
            )
            print(f"    ✓ Done [{idx+1}/{len(questions)}] {item['slug']}.mp3 ({item['duration']}s)")
            return idx, item
        except Exception as e:
            print(f"    ✗ Failed [{idx+1}/{len(questions)}] {q['id']}: {e}", file=sys.stderr)
            raise

    with ThreadPoolExecutor(max_workers=args.workers) as executor:
        futures = [executor.submit(process_one, (i, q)) for i, q in enumerate(questions)]
        for f in as_completed(futures):
            idx, item = f.result()
            manifest_items[idx] = item

    # Merge with existing manifest if filtered
    if args.paper or args.question:
        existing_manifest = []
        if MANIFEST_FILE.exists():
            with MANIFEST_FILE.open("r", encoding="utf-8") as f:
                existing_manifest = json.load(f)
        manifest_dict = {item["id"]: item for item in existing_manifest}
        for item in manifest_items:
            manifest_dict[item["id"]] = item
        manifest_items_to_save = list(manifest_dict.values())
        manifest_items_to_save.sort(key=lambda x: (x.get("paperKey", ""), x.get("subNo", 0)))
    else:
        manifest_items_to_save = manifest_items

    # Save manifest.json
    with MANIFEST_FILE.open("w", encoding="utf-8") as f:
        json.dump(manifest_items_to_save, f, ensure_ascii=False, indent=2)
    print(f"\nWrote manifest with {len(manifest_items_to_save)} items to {MANIFEST_FILE}")

    # Re-merge paper episodes for affected papers
    paper_groups = {}
    for item in manifest_items_to_save:
        paper_groups.setdefault(item["paperKey"], []).append(item)

    affected_papers = set(item["paperKey"] for item in manifest_items)
    existing_episodes = []
    if EPISODES_FILE.exists():
        with EPISODES_FILE.open("r", encoding="utf-8") as f:
            existing_episodes = json.load(f)
    episodes_dict = {ep["paperKey"]: ep for ep in existing_episodes}

    for p_key in sorted(affected_papers):
        p_items = sorted(paper_groups.get(p_key, []), key=lambda x: x["subNo"])
        if len(p_items) < 8:
            print(f"Skipping episode merge for {p_key}: only {len(p_items)} questions found in manifest.")
            continue
        p_name = PAPER_NAMES.get(p_key, f"试卷{p_key}")
        print(f"\n--> Merging paper episode for {p_name} ({len(p_items)} questions)...")
        ep = merge_paper_podcast(
            p_key,
            p_name,
            p_items,
            api_key=api_key,
            voice=args.voice,
            endpoint=MIMO_ENDPOINT,
            force=True,
        )
        print(f"    ✓ Generated episode {ep['slug']}.mp3 ({ep['duration_seconds']}s, {round(ep['size_bytes']/1024/1024, 2)}MB)")
        episodes_dict[p_key] = ep

    episodes = [episodes_dict[k] for k in sorted(episodes_dict.keys())]
    # Save episodes.json
    with EPISODES_FILE.open("w", encoding="utf-8") as f:
        json.dump(episodes, f, ensure_ascii=False, indent=2)
    print(f"Wrote episodes with {len(episodes)} items to {EPISODES_FILE}")

    elapsed = round(time.time() - t0, 1)
    print(f"\nAll done in {elapsed}s!")
    return 0


if __name__ == "__main__":
    sys.exit(main())
