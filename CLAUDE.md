# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Repository Overview

This is a personal knowledge base and study material repository with two main focus areas:

1. **AI Trainer Certification**: Study materials and practice problems for the 2025 Shanghai Jiao Tong University Artificial Intelligence Trainer (Level 3) certification exam
2. **Political Science/International Relations**: Review materials for graduate-level courses
3. **SwiftBar Plugin**: A macOS menu bar plugin for monitoring GLM API token usage

## Repository Structure

```
ppray.github.io/
├── 人工智能训练师三级/                          # AI Trainer Level 3 materials
│   ├── 2025-AI-Trainer-practices/            # Practice problems with Jupyter solutions
│   ├── 人工智能训练师三级上网素材/              # Web-based study materials
│   ├── 人工智能训练师三级考试平台模拟界面/      # Mock exam platform (HTML)
│   └── 人工智能训练师三级指导手册_20250701 (1)/ # Official reference manuals
├── 国关复习/                               # Political Science / IR review materials (HTML, PDF)
├── 国关复习题/                             # International Relations practice questions
├── index.html                             # Main landing page
├── mindmap.html                           # Review mindmap
├── review_ppt.html                        # Review slides (H5 PPT)
├── quiz.html                              # Quiz tool
├── quiz-questions.js                      # Quiz questions data
├── swiftbar-glm-usage.10m.sh             # SwiftBar plugin script
├── glm-usage.config.sh                   # Plugin configuration template
├── README-SWIFTBAR.md                    # Plugin documentation
├── GLM-USAGE-PLUGIN.md                   # Plugin usage guide
├── test.10s.sh                           # Test SwiftBar plugin
└── assets/                               # Image assets for HTML pages
```

## AI Trainer Practice Materials

### Exam Structure
- 120-minute operation skills test with 6 problems worth 100 points total
- Practice problems located in `人工智能训练师三级/2025-AI-Trainer-practices/practices/`

| Problem | Time | Points | Topic |
|---------|------|--------|-------|
| 1.1.1 | 30min | 25pts | Medical data processing with pandas |
| 2.1.1 | 20min | 15pts | Traffic fuel efficiency - data cleaning |
| 2.2.1 | 20min | 20pts | Credit scoring - Logistic regression with SMOTE |
| 3.1.1 | 20min | 15pts | Smart speaker product data analysis |
| 3.2.1 | 20min | 20pts | Image recognition with ONNX model inference |
| 4.2.1 | 10min | 5pts | Retail data collection planning |

### Python Environment Setup

```bash
# Install AI Trainer practice dependencies
cd 人工智能训练师三级/2025-AI-Trainer-practices/
pip install -r requirements.txt

# Launch Jupyter notebooks for any practice problem
cd practices/1.1.1_智能医疗系统中的业务数据处理流程设计
jupyter notebook example.ipynb
```

### Key Python Dependencies
- `pandas>=1.3.0` - Data manipulation
- `numpy>=1.21.0` - Numerical computing
- `scikit-learn>=1.0.0` - Machine learning models
- `onnxruntime>=1.8.0` - ONNX model inference
- `imbalanced-learn>=0.8.0` - SMOTE for imbalanced data
- `Pillow>=8.3.0` - Image processing
- `matplotlib>=3.4.0`, `seaborn>=0.11.0` - Visualization

### Exam File Naming Convention
- Screenshots: `{problem_code}-{number}.jpg`
- Cleaned data: `{problem_code}_cleaned_data.csv`
- Models: `{problem_code}_model.pkl`
- Results: `{problem_code}_results.txt`
- Reports: `{problem_code}_report.txt`

## SwiftBar Plugin Development

The SwiftBar plugin (`swiftbar-glm-usage.10m.sh`) monitors GLM API token usage in the macOS menu bar.

```bash
# Plugin dependencies
brew install jq  # JSON processing

# Install/update plugin
ln -s /Users/guoruidong/ppray.github.io/swiftbar-glm-usage.10m.sh \
  ~/Library/Application\ Support/SwiftBar/plugins/
```

**Plugin Features**:
- Real-time Token Monitoring (5-hour window)
- Color-coded indicators (Green <30%, Yellow 30-60%, Orange 60-85%, Red ≥85%)
- CPU and memory usage display
- 5-minute cache with manual refresh option

## Common Tasks

### Working with AI Trainer Notebooks
1. Navigate to the specific practice directory
2. Open `example.ipynb` for complete solutions
3. Use the `data/` folder for mock datasets

### Updating Review Materials
- Review entry pages in root (`index.html`, `mindmap.html`, `review_ppt.html`, `quiz.html`) are frequently updated
- Course-specific HTML/PDF review files in `国关复习/` are also frequently updated
- Commit changes with meaningful messages

### Modifying the SwiftBar Plugin
- Edit `swiftbar-glm-usage.10m.sh` - the filename suffix controls update frequency
- Test changes by refreshing SwiftBar
- Configuration file template: `glm-usage.config.sh`

## Key Notes from Git History
- Large ONNX model files (~230MB) are excluded from git tracking
- Recent commits focus on AI Trainer practice materials and Political Science exam updates
- The repository is well-organized for study and reference purposes

## Subdirectory CLAUDE.md

For AI Trainer-specific development, also refer to:
- `人工智能训练师三级/2025-AI-Trainer-practices/CLAUDE.md` - Detailed coding patterns and exam guidance
