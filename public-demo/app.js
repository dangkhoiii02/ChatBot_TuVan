// MINH PIANO STUDIO — SENIOR FRONT-END CLIENT ENGINE

document.addEventListener('DOMContentLoaded', () => {
  // --- STATE ---
  let samplesCache = [];
  let currentReplies = [];
  let selectedReplyIdx = 0;
  let cachedDocs = {};
  let currentDocFile = 'persona.md';

  // --- DOM NODES ---
  // Masthead & Drawer
  const openSettingsDrawerBtn = document.getElementById('openSettingsDrawerBtn');
  const closeDrawerBtn = document.getElementById('closeDrawerBtn');
  const drawerBackdrop = document.getElementById('drawerBackdrop');
  const headerKeyStatusDot = document.getElementById('headerKeyStatusDot');

  // Composer Nodes
  const studentMessageInput = document.getElementById('studentMessageInput');
  const samplesPills = document.getElementById('samplesPills');
  const toggleContextBtn = document.getElementById('toggleContextBtn');
  const contextBody = document.getElementById('contextBody');
  const ctxPronoun = document.getElementById('ctxPronoun');
  const ctxAudience = document.getElementById('ctxAudience');
  const ctxCurrentIssue = document.getElementById('ctxCurrentIssue');
  const ctxCurrentPrescription = document.getElementById('ctxCurrentPrescription');
  const clearInputBtn = document.getElementById('clearInputBtn');
  const generateRepliesBtn = document.getElementById('generateRepliesBtn');
  const loadingSpinner = document.getElementById('loadingSpinner');
  const generateBtnText = document.getElementById('generateBtnText');

  // Results Desk Nodes
  const resultsDesk = document.getElementById('resultsDesk');
  const emptyWelcome = document.getElementById('emptyWelcome');
  const sensitivityBanner = document.getElementById('sensitivityBanner');
  const bannerTag = document.getElementById('bannerTag');
  const bannerTitle = document.getElementById('bannerTitle');
  const bannerDesc = document.getElementById('bannerDesc');
  const suggestionsStack = document.getElementById('suggestionsStack');
  const activeToneChip = document.getElementById('activeToneChip');
  const finalEditorTextarea = document.getElementById('finalEditorTextarea');
  const copyToClipboardBtn = document.getElementById('copyToClipboardBtn');
  const confirmSendBtn = document.getElementById('confirmSendBtn');

  // Drawer Nodes
  const drawerApiKeyInput = document.getElementById('drawerApiKeyInput');
  const toggleApiKeyViewBtn = document.getElementById('toggleApiKeyViewBtn');
  const saveApiKeyBtn = document.getElementById('saveApiKeyBtn');
  const drawerModelSelect = document.getElementById('drawerModelSelect');
  const keyStatusIndicator = document.getElementById('keyStatusIndicator');
  const docTabsList = document.getElementById('docTabsList');
  const drawerDocEditor = document.getElementById('drawerDocEditor');
  const docSaveIndicator = document.getElementById('docSaveIndicator');
  const saveDocumentBtn = document.getElementById('saveDocumentBtn');
  const historyMiniList = document.getElementById('historyMiniList');

  // Toast
  const toastBubble = document.getElementById('toastBubble');
  const toastSymbol = document.getElementById('toastSymbol');
  const toastMessage = document.getElementById('toastMessage');

  // --- INIT ---
  initApiKey();
  initSamples();
  bindInteractions();

  // --- API KEY & SETTINGS ---
  function initApiKey() {
    for (const [oldKey, newKey] of [['gemini_api_key', 'ai_api_key'], ['gemini_model', 'ai_model']]) {
      const oldValue = localStorage.getItem(oldKey);
      if (oldValue && localStorage.getItem(newKey) === null) localStorage.setItem(newKey, oldValue);
      localStorage.removeItem(oldKey);
    }
    const key = localStorage.getItem('ai_api_key') || '';
    let model = localStorage.getItem('ai_model') || '';

    for (const [id, key] of [['aiProvider', 'ai_provider'], ['aiBaseUrl', 'ai_base_url']]) {
      const field = document.getElementById(id);
      field.value = localStorage.getItem(key) || (id === 'aiProvider' ? 'auto' : '');
      field.addEventListener('change', () => localStorage.setItem(key, field.value));
    }

    drawerApiKeyInput.value = key;
    drawerModelSelect.value = model;
    updateKeyStatusDisplay(Boolean(key));

    toggleApiKeyViewBtn.addEventListener('click', () => {
      if (drawerApiKeyInput.type === 'password') {
        drawerApiKeyInput.type = 'text';
        toggleApiKeyViewBtn.textContent = 'Ẩn';
      } else {
        drawerApiKeyInput.type = 'password';
        toggleApiKeyViewBtn.textContent = 'Hiện';
      }
    });

    saveApiKeyBtn.addEventListener('click', () => {
      const val = drawerApiKeyInput.value.trim();
      if (val) {
        localStorage.setItem('ai_api_key', val);
        updateKeyStatusDisplay(true);
        showToast('Đã lưu AI API Key!', '✓');
      } else {
        localStorage.removeItem('ai_api_key');
        updateKeyStatusDisplay(false);
        showToast('Đã gỡ bỏ API Key.', 'ℹ');
      }
    });

    drawerModelSelect.addEventListener('change', () => {
      localStorage.setItem('ai_model', drawerModelSelect.value);
      showToast(`Mô hình: ${drawerModelSelect.value}`, '✓');
    });
  }

  function updateKeyStatusDisplay(hasKey) {
    if (hasKey) {
      headerKeyStatusDot.classList.add('active');
      keyStatusIndicator.className = 'key-status-indicator ready';
      keyStatusIndicator.textContent = '✓ Sẵn sàng';
    } else {
      headerKeyStatusDot.classList.remove('active');
      keyStatusIndicator.className = 'key-status-indicator';
      keyStatusIndicator.textContent = 'Chưa có Key';
    }
  }

  function getApiKey() {
    return drawerApiKeyInput.value.trim() || localStorage.getItem('ai_api_key') || '';
  }

  function getModel() {
    return drawerModelSelect.value || localStorage.getItem('ai_model') || '';
  }

  // --- SAMPLES ---
  async function initSamples() {
    try {
      const res = await fetch('/api/samples');
      const data = await res.json();
      if (data.success && data.samples) {
        samplesCache = data.samples;
      }
    } catch (e) {
      console.warn('Samples load note:', e);
    }

    document.querySelectorAll('.sample-pill').forEach(pill => {
      pill.addEventListener('click', () => {
        const id = pill.dataset.sampleId;
        const s = samplesCache.find(item => item.id === id);
        if (!s) return;

        studentMessageInput.value = s.input_message || '';
        
        if (s.context) {
          if (s.context.pronoun) ctxPronoun.value = s.context.pronoun;
          if (s.context.audience) ctxAudience.value = s.context.audience;
          if (s.context.topic) ctxCurrentIssue.value = s.context.topic;
        }

        showToast(`Đã nạp mẫu: ${s.student_name || s.title || ''}`, '♩');
      });
    });
  }

  // --- INTERACTIONS & GENERATE ---
  function bindInteractions() {
    // Drawer open/close
    openSettingsDrawerBtn.addEventListener('click', () => {
      drawerBackdrop.classList.remove('hidden');
      loadDrawerDocuments();
      loadDrawerHistory();
    });

    closeDrawerBtn.addEventListener('click', () => {
      drawerBackdrop.classList.add('hidden');
    });

    drawerBackdrop.addEventListener('click', (e) => {
      if (e.target === drawerBackdrop) {
        drawerBackdrop.classList.add('hidden');
      }
    });

    // Context Accordion
    toggleContextBtn.addEventListener('click', () => {
      const isHidden = contextBody.classList.toggle('hidden');
      toggleContextBtn.querySelector('.toggle-glyph').textContent = isHidden ? '+' : '−';
    });

    // Clear input
    clearInputBtn.addEventListener('click', () => {
      studentMessageInput.value = '';
      ctxAudience.value = '';
      ctxCurrentIssue.value = '';
      ctxCurrentPrescription.value = '';
      resultsDesk.classList.add('hidden');
      emptyWelcome.classList.remove('hidden');
      studentMessageInput.focus();
    });

    // Generate replies
    generateRepliesBtn.addEventListener('click', handleGenerate);

    // Keyboard shortcut Enter in textarea (Cmd/Ctrl + Enter)
    studentMessageInput.addEventListener('keydown', (e) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') {
        e.preventDefault();
        handleGenerate();
      }
    });

    // Copy to clipboard
    copyToClipboardBtn.addEventListener('click', () => {
      const text = finalEditorTextarea.value;
      if (!text.trim()) return;
      if (navigator.clipboard) {
        navigator.clipboard.writeText(text);
      } else {
        const ta = document.createElement('textarea');
        ta.value = text;
        document.body.appendChild(ta);
        ta.select();
        document.execCommand('copy');
        ta.remove();
      }
      showToast('Đã sao chép phản hồi vào bộ nhớ!', '✓');
    });

    // Confirm Send
    confirmSendBtn.addEventListener('click', async () => {
      const chosenText = finalEditorTextarea.value.trim();
      if (!chosenText) {
        showToast('Nội dung không được để trống!', '⚠');
        return;
      }

      const activeTone = currentReplies[selectedReplyIdx]?.tone || 'Phong cách chuẩn';

      try {
        fetch('/api/history', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            student_message: studentMessageInput.value.trim(),
            chosen_reply: chosenText,
            tone: activeTone,
            sent_at: new Date().toISOString()
          })
        });
      } catch (e) {}

      showToast('Đã ghi nhận phản hồi vào sổ tay!', '✓');
    });
  }

  // --- CORE GENERATION ENGINE ---
  async function handleGenerate() {
    const msg = studentMessageInput.value.trim();
    if (!msg) {
      showToast('Vui lòng nhập tin nhắn học viên trước!', '⚠');
      studentMessageInput.focus();
      return;
    }

    const apiKey = getApiKey();
    setLoading(true);

    try {
      const context = {
        pronoun: ctxPronoun.value,
        audience: ctxAudience.value.trim(),
        current_issue: ctxCurrentIssue.value.trim(),
        current_prescription: ctxCurrentPrescription.value.trim()
      };

      const res = await fetch('/api/generate', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          message: msg,
          context: context,
          apiKey,
          model: getModel(),
          provider: document.getElementById('aiProvider').value,
          baseUrl: document.getElementById('aiProvider').value === 'custom' ? document.getElementById('aiBaseUrl').value : undefined
        })
      });

      const json = await res.json();
      if (!json.success) {
        throw new Error(json.error || 'Lỗi xử lý phản hồi');
      }

      renderResults(json.data);
    } catch (err) {
      showToast(err.message, '⚠');
    } finally {
      setLoading(false);
    }
  }

  function setLoading(isLoading) {
    if (isLoading) {
      loadingSpinner.classList.remove('hidden');
      generateBtnText.textContent = 'Đang lắng nghe & soạn bài...';
      generateRepliesBtn.disabled = true;
      generateRepliesBtn.style.opacity = '0.75';
    } else {
      loadingSpinner.classList.add('hidden');
      generateBtnText.textContent = 'Lắng nghe & Soạn 5 phương án';
      generateRepliesBtn.disabled = false;
      generateRepliesBtn.style.opacity = '1';
    }
  }

  // --- RENDER RESULTS ---
  function renderResults(data) {
    emptyWelcome.classList.add('hidden');
    resultsDesk.classList.remove('hidden');

    // 1. Sensitivity Banner (Subtle, dignified)
    const sens = (data.sensitivity || 'xanh').toLowerCase();
    sensitivityBanner.className = `sensitivity-banner banner-${sens}`;

    if (sens === 'do') {
      bannerTag.textContent = 'Lưu tâm đặc biệt';
      bannerTitle.textContent = 'Biến cố sức khỏe hoặc gia đình';
      bannerDesc.textContent = data.flag_reason || 'Học viên đang đối diện với nghịch cảnh. Thầy vui lòng đọc chậm, thấu cảm, không thúc ép tiến độ bài vở và tôn trọng quyền lợi hoàn phí.';
    } else if (sens === 'vang') {
      bannerTag.textContent = 'Xem lại bài tập';
      bannerTitle.textContent = 'Kỹ thuật ngón hoặc Quy định';
      bannerDesc.textContent = data.flag_reason || 'Nhận xét cần độ chính xác sư phạm cao. Thầy kiểm tra lại mốc thời gian clip hoặc đối chiếu điều kiện bảo lưu 90 ngày.';
    } else {
      bannerTag.textContent = 'Thường nhật';
      bannerTitle.textContent = 'Tâm sự & Thói quen luyện tập';
      bannerDesc.textContent = data.flag_reason || 'Tin nhắn học tập thông thường, khích lệ học viên duy trì 10-15 phút chạm phím nhẹ nhàng.';
    }

    // 2. Suggestions Deck (5 Options)
    currentReplies = data.replies || [];
    selectedReplyIdx = 0;

    suggestionsStack.innerHTML = currentReplies.map((r, idx) => `
      <div class="suggestion-card ${idx === 0 ? 'active-option' : ''}" data-idx="${idx}">
        <div class="suggestion-card-top">
          <span class="tone-badge">Phương án ${idx + 1}: ${escapeHtml(r.tone || 'Góc nhìn')}</span>
          <span class="option-select-cue">${idx === 0 ? 'Đang chọn' : 'Bấm để chọn'}</span>
        </div>
        <div class="suggestion-content">${escapeHtml(r.content || '')}</div>
      </div>
    `).join('');

    suggestionsStack.querySelectorAll('.suggestion-card').forEach(card => {
      card.addEventListener('click', () => {
        const idx = parseInt(card.dataset.idx, 10);
        selectOption(idx);
      });
    });

    // Populate active editor
    if (currentReplies.length > 0) {
      selectOption(0);
    }

    // Smooth scroll into results
    resultsDesk.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  }

  function selectOption(index) {
    selectedReplyIdx = index;
    const r = currentReplies[index];
    if (!r) return;

    suggestionsStack.querySelectorAll('.suggestion-card').forEach((c, i) => {
      if (i === index) {
        c.classList.add('active-option');
        c.querySelector('.option-select-cue').textContent = 'Đang chọn';
      } else {
        c.classList.remove('active-option');
        c.querySelector('.option-select-cue').textContent = 'Bấm để chọn';
      }
    });

    activeToneChip.textContent = `Phương án ${index + 1}: ${r.tone || 'Gợi ý'}`;
    finalEditorTextarea.value = r.content || '';
  }

  // --- DRAWER KNOWLEDGE BASE & HISTORY ---
  async function loadDrawerDocuments() {
    try {
      docSaveIndicator.textContent = 'Đang tải...';
      const res = await fetch('/api/documents');
      const data = await res.json();
      if (data.success && data.documents) {
        cachedDocs = data.documents;
        switchDocTab(currentDocFile);
        docSaveIndicator.textContent = 'Đã đồng bộ';
      }
    } catch (e) {
      docSaveIndicator.textContent = 'Lỗi tải dữ liệu';
    }
  }

  function switchDocTab(filename) {
    currentDocFile = filename;
    drawerDocEditor.value = cachedDocs[filename] || '';

    docTabsList.querySelectorAll('.doc-pill').forEach(pill => {
      if (pill.dataset.file === filename) pill.classList.add('active');
      else pill.classList.remove('active');
    });
  }

  docTabsList.querySelectorAll('.doc-pill').forEach(pill => {
    pill.addEventListener('click', () => switchDocTab(pill.dataset.file));
  });

  saveDocumentBtn.addEventListener('click', async () => {
    const content = drawerDocEditor.value;
    docSaveIndicator.textContent = 'Đang lưu...';
    try {
      const res = await fetch('/api/documents', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          filename: currentDocFile,
          content: content
        })
      });
      const data = await res.json();
      if (data.success) {
        cachedDocs[currentDocFile] = content;
        docSaveIndicator.textContent = '✓ Đã lưu thành công';
        showToast(`Đã lưu "${currentDocFile}" vào AI!`, '✓');
      } else {
        throw new Error(data.error);
      }
    } catch (err) {
      docSaveIndicator.textContent = 'Lỗi lưu';
      showToast(err.message, '⚠');
    }
  });

  async function loadDrawerHistory() {
    try {
      const res = await fetch('/api/history');
      const data = await res.json();
      if (data.success && data.history && data.history.length > 0) {
        historyMiniList.innerHTML = data.history.slice(0, 5).map(item => `
          <div class="history-item-mini">
            <div style="font-weight: 600; color: var(--ink); margin-bottom: 2px;">
              ${escapeHtml(item.tone || 'Gợi ý')} • <span style="font-size: 11px; color: var(--ink-muted);">${new Date(item.timestamp || item.sent_at).toLocaleDateString('vi-VN')}</span>
            </div>
            <div style="color: var(--ink-secondary); font-size: 11.5px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;">
              ${escapeHtml(item.chosen_reply || '')}
            </div>
          </div>
        `).join('');
      } else {
        historyMiniList.innerHTML = '<div class="history-empty-note">Chưa có phản hồi nào được ghi nhận.</div>';
      }
    } catch (e) {}
  }

  // --- TOAST NOTIFICATION ---
  let toastTimer = null;
  function showToast(msg, sym = '✓') {
    toastSymbol.textContent = sym;
    toastMessage.textContent = msg;
    toastBubble.classList.remove('hidden');

    if (toastTimer) clearTimeout(toastTimer);
    toastTimer = setTimeout(() => {
      toastBubble.classList.add('hidden');
    }, 2500);
  }

  function escapeHtml(str) {
    if (!str) return '';
    return String(str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');
  }
});
