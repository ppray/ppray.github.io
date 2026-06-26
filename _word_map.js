const fs = require('fs');
const content = fs.readFileSync('quiz-questions.js', 'utf8');
const questions = new Function(content + '; return questions;')();

// 核心词列表
const coreWords = [
  '社会主义', '政治', '发展', '中国', '经济', '国际', '制度',
  '国家', '阶级', '民主', '参与', '时代', '人民', '坚持',
  '思想', '理论', '革命', '世界', '关系', '领导', '历史',
  '统治', '必须', '意识', '文化', '利益', '政府', '建设',
  '合作', '和平', '权力', '组织', '改革', '民族', '格局',
  '政党', '资本', '科学', '模式', '外交', '秩序', '合法',
  '能力', '核心', '道路', '目标', '监督', '管理', '战略',
  '全面', '共同', '创新', '形态', '体系'
];

// 为每个核心词找相关题目
const result = {};
coreWords.forEach(word => {
  const related = questions.filter(q => {
    const txt = q.question + q.answer + (q.explanation || '');
    return txt.includes(word);
  }).map(q => ({
    id: q.id,
    category: q.category,
    question: q.question.substring(0, 30)
  }));
  if (related.length >= 3) {
    result[word] = related;
  }
});

console.log(JSON.stringify(result, null, 2));
