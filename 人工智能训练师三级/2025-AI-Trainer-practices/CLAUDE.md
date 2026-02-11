# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

This repository contains practice materials for the 2025 Shanghai Jiao Tong University AI Trainer (Level 3) certification exam. It includes 6 complete practice problems with Jupyter Notebook solutions and mock datasets covering data processing, machine learning model development, and system optimization.

**Exam Structure**: 120-minute operation skills test with 6 problems worth 100 points total
- 1.1.1: Medical data processing (30min, 25pts) - pandas data analysis
- 2.1.1: Traffic fuel efficiency model (20min, 15pts) - data cleaning & preprocessing
- 2.2.1: Credit scoring model (20min, 20pts) - Logistic regression with SMOTE
- 3.1.1: Smart speaker analysis (20min, 15pts) - data analysis & optimization
- 3.2.1: Image recognition system (20min, 20pts) - ONNX model inference
- 4.2.1: Retail data collection (10min, 5pts) - data acquisition planning

## Environment Setup

```bash
# Install dependencies
pip install -r requirements.txt

# Key packages
# pandas>=1.3.0 - Data manipulation
# numpy>=1.21.0 - Numerical computing
# scikit-learn>=1.0.0 - ML models (LogisticRegression, StandardScaler, train_test_split)
# onnxruntime>=1.8.0 - ONNX model inference
# imbalanced-learn>=0.8.0 - SMOTE for imbalanced data
# scipy>=1.7.0 - Softmax for probability calculation
# Pillow>=8.3.0 - Image processing
# matplotlib/seaborn - Visualization
```

## Running the Notebooks

Each practice directory contains:
- `example.ipynb` - Complete solution with detailed comments
- `data/` - Mock dataset (20+ rows for realistic testing)

```bash
# Navigate to any practice directory
cd practices/1.1.1_智能医疗系统中的业务数据处理流程设计

# Launch Jupyter
jupyter notebook example.ipynb
```

## Code Architecture Patterns

### Problem 1.1.1 - Medical Data Analysis
**Pattern**: Statistical analysis with interval classification
- Read CSV with pandas
- Create risk categories using `np.where()`
- Interval binning with `pd.cut()` for BMI/age ranges
- Groupby aggregation for risk rate calculation
- Output: Statistical results saved as screenshots (JPG format)

### Problem 2.1.1 - Data Cleaning Pipeline
**Pattern**: End-to-end preprocessing workflow
```python
# Standard workflow
data = pd.read_csv()
data.isnull().sum()  # Check missing values
data = data.dropna()
data['col'] = pd.to_numeric(data['col'], errors='coerce')
scaler = StandardScaler()
data[numerical_features] = scaler.fit_transform()
X_train, X_test, y_train, y_test = train_test_split(X, y, test_size=0.2, random_state=42)
cleaned_data.to_csv('output.csv')
```

### Problem 2.2.1 - Classification with Imbalanced Data
**Pattern**: Model training → evaluation → improvement with SMOTE
```python
# Core workflow
X = data.drop(['target', 'id_col'], axis=1)
y = data['target']
model = LogisticRegression(max_iter=1000)
model.fit(X_train, y_train)

# Save model
with open('model.pkl', 'wb') as f:
    pickle.dump(model, f)

# Handle imbalance
smote = SMOTE(random_state=42)
X_resampled, y_resampled = smote.fit_resample(X_train, y_train)
```

**Output files**: model.pkl, results.txt, report.txt, results_xg.txt (after SMOTE)

### Problem 3.2.1 - ONNX Model Inference
**Pattern**: Image preprocessing → ONNX inference → Top-K results
```python
session = ort.InferenceSession('model.onnx')
input_name = session.get_inputs()[0].name
output_name = session.get_outputs()[0].name

# Preprocess: resize → center crop → normalize → HWC→CHW
processed_image = preprocess_image(image)  # Custom function
output = session.run([output_name], {input_name: processed_image})[0]
probabilities = scipy.special.softmax(output, axis=-1)
top5_idx = np.argsort(probabilities[0])[-5:][::-1]
```

## Key Technical Points

### Data Binning Syntax
```python
# Left-closed, right-open intervals
pd.cut(data['col'], bins=[0, 18.5, 24, 28, np.inf],
       labels=['label1', 'label2', 'label3', 'label4'], right=False)
```

### File Naming Convention (Exam Requirements)
- Screenshots: `{problem_code}-{number}.jpg` (e.g., `1.1.1-1.jpg`)
- Cleaned data: `{problem_code}_cleaned_data.csv`
- Models: `{problem_code}_model.pkl`
- Results: `{problem_code}_results.txt`
- Reports: `{problem_code}_report.txt`
- Improved results: `{problem_code}_results_xg.txt`
- Exam folder: `{准考证号}+{身份证号后六位}`

### Model Evaluation
```python
from sklearn.metrics import classification_report
report = classification_report(y_test, y_pred, zero_division=1)
# zero_division=1 prevents warnings for undefined metrics
```

## Exam Reference Materials

Located in parent directory `人工智能训练师三级指导手册_20250701 (1)/`:
- `第3部分-人工智能训练师_3级_理论知识复习题.docx` - Theory review questions
- `第4部分_人工智能训练师_3级_操作技能复习题.doc` - Operation skills practice
- `第5部分_人工智能训练师_3级_理论知识模拟试卷.docx` - Theory mock exam
- `第6部分_人工智能训练师_3级_操作技能模拟试卷.doc` - **Complete operation skills exam with reference answers**

The `第6部分` document contains all 6 exam problems with detailed scoring rubrics and complete reference code - this is the authoritative source for expected solutions.

## Mock Online Exam Platform

Parent directory contains 40 HTML files (`人工智能训练师三级考试平台模拟界面/`) simulating the actual exam platform interface for practice familiarity.
