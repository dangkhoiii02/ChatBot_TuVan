// Normalize Vietnamese string for robust matching
function removeVietnameseTones(str) {
  if (!str || typeof str !== 'string') return '';
  str = str.normalize('NFD').replace(/[\u0300-\u036f]/g, '');
  str = str.replace(/đ/g, 'd').replace(/Đ/g, 'D');
  return str;
}

function normalizeForSearch(str) {
  if (!str || typeof str !== 'string') return '';
  return str
    .toLowerCase()
    .trim()
    .replace(/\s+/g, ' ');
}

// Tokenize text into words / n-grams for matching
function extractKeywords(str) {
  if (!str) return [];
  const normalized = normalizeForSearch(str);
  // Split on punctuation and spaces
  const words = normalized
    .replace(/[.,/#!$%^&*;:{}=\-_`~()?"'<>]/g, ' ')
    .split(/\s+/)
    .filter(w => w.length > 1);
  return Array.from(new Set(words));
}

// Check if any keyword in list exists in text (both exact with tone and tone-insensitive)
function containsKeyword(text, keyword) {
  if (!text || !keyword) return false;
  const normText = normalizeForSearch(text);
  const normKw = normalizeForSearch(keyword);
  if (normText.includes(normKw)) return true;

  // Check accent-stripped version as fallback
  const strippedText = removeVietnameseTones(normText);
  const strippedKw = removeVietnameseTones(normKw);
  if (strippedText.includes(strippedKw)) return true;

  return false;
}

module.exports = {
  removeVietnameseTones,
  normalizeForSearch,
  extractKeywords,
  containsKeyword
};
