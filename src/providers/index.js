const config = require('../config');
const { generateGeminiReply } = require('./gemini');
const { generateMockReply } = require('./mock');

function getProvider(overrideProvider = null) {
  const providerName = overrideProvider || config.PROVIDER;

  if (providerName === 'mock' || config.NODE_ENV === 'test') {
    return {
      name: 'mock',
      generate: generateMockReply
    };
  }

  if (providerName === 'gemini') {
    return {
      name: 'gemini',
      generate: generateGeminiReply
    };
  }

  throw new Error(`Nhà cung cấp AI không hợp lệ: '${providerName}'. Chỉ hỗ trợ 'gemini' hoặc 'mock'.`);
}

module.exports = {
  getProvider
};
