// Client App Logic cho Bot Trợ Lý "Thầy Minh Piano"

document.addEventListener('DOMContentLoaded', () => {
  // --- STATE MANAGEMENT ---
  let documentsCache = {};
  let currentEditingFile = 'persona.md';
  let samplesCache = [];
  let currentReplies = [];
  let selectedReplyIndex = -1;

  // --- DOM ELEMENTS ---
  const apiKeyInput = document.getElementById('apiKeyInput');
  const toggleApiKeyBtn = document.getElementById('toggleApiKeyBtn');
  const saveApiKeyBtn = document.getElementById('saveApiKeyBtn');
  const apiKeyStatusBadge = document.getElementById('apiKeyStatusBadge');
  const modelSelect = document.getElementById('modelSelect');

  const navTabs = document.querySelectorAll('.nav-tab');
  const tabContents = document.querySelectorAll('.tab-content');

  // Tab 1 Elements
  const samplesContainer = document.getElementById('samplesContainer');
  const studentMessage = document.getElementById('studentMessage');
  const clearInputBtn = document.getElementById('clearInputBtn');
  const accordionToggle = document.getElementById('accordionToggle');
  const contextAccordion = document.querySelector('.context-accordion');
  
  const ctxAudience = document.getElementById('ctxAudience');
  const ctxPronoun = document.getElementById('ctxPronoun');
  const ctxOldIssue = document.getElementById('ctxOldIssue');
  const ctxOldPrescription = document.getElementById('ctxOldPrescription');
  const ctxCurrentIssue = document.getElementById('ctxCurrentIssue');
  const ctxCurrentPrescription = document.getElementById('ctxCurrentPrescription');
  const ctxAppointmentDays = document.getElementById('ctxAppointmentDays');

  const analyzeBtn = document.getElementById('analyzeBtn');
  const emptyPlaceholder = document.getElementById('emptyPlaceholder');
  const sensitivityAlert = document.getElementById('sensitivityAlert');
  const alertIcon = document.getElementById('alertIcon');
  const alertTitle = document.getElementById('alertTitle');
  const alertBadge = document.getElementById('alertBadge');
  const alertReason = document.getElementById('alertReason');
  const redFlagWarning = document.getElementById('redFlagWarning');

  const analysisCard = document.getElementById('analysisCard');
  const analysisText = document.getElementById('analysisText');

  const repliesSection = document.getElementById('repliesSection');
  const repliesList = document.getElementById('repliesList');

  const finalEditorCard = document.getElementById('finalEditorCard');
  const selectedToneBadge = document.getElementById('selectedToneBadge');
  const finalMessageText = document.getElementById('finalMessageText');
  const copyFinalBtn = document.getElementById('copyFinalBtn');
  const approveSendBtn = document.getElementById('approveSendBtn');
  const sendStatusMsg = document.getElementById('sendStatusMsg');

  // Tab 2 Elements (Docs)
  const docFileList = document.getElementById('docFileList');
  const currentEditingFilename = document.getElementById('currentEditingFilename');
  const docSaveStatus = document.getElementById('docSaveStatus');
  const docContentTextarea = document.getElementById('docContentTextarea');
  const saveCurrentDocBtn = document.getElementById('saveCurrentDocBtn');
  const reloadDocsBtn = document.getElementById('reloadDocsBtn');

  // Tab 3 Elements (History)
  const historyTableBody = document.getElementById('historyTableBody');
  const refreshHistoryBtn = document.getElementById('refreshHistoryBtn');

  // Toast Container
  const toastContainer = document.getElementById('toastContainer');

  // --- INITIALIZATION ---
  initApiKey();
  initNavigation();
  initSamples();
  initAccordion();
  loadDocuments();
  loadHistory();

  // --- API KEY FUNCTIONS ---
  function initApiKey() {
    const savedKey = localStorage.getItem('gemini_api_key') || '';
    const savedModel = localStorage.getItem('gemini_model') || 'gemini-2.0-flash';
    
    if (savedKey) {
      apiKeyInput.value = savedKey;
      updateApiKeyStatus(true);
    } else {
      updateApiKeyStatus(false);
    }

    modelSelect.value = savedModel;

    toggleApiKeyBtn.addEventListener('click', () => {
      if (apiKeyInput.type === 'password') {
        apiKeyInput.type = 'text';
        toggleApiKeyBtn.textContent = '🔒';
      } else {
        apiKeyInput.type = 'password';
        toggleApiKeyBtn.textContent = '👁️';
      }
    });

    saveApiKeyBtn.addEventListener('click', () => {
      const key = apiKeyInput.value.trim();
      if (key) {
        localStorage.setItem('gemini_api_key', key);
        updateApiKeyStatus(true);
        showToast('Đã lưu Gemini API Key thành công!', 'success');
      } else {
        localStorage.removeItem('gemini_api_key');
        updateApiKeyStatus(false);
        showToast('Đã xóa API Key.', 'info');
      }
    });

    modelSelect.addEventListener('change', () => {
      localStorage.setItem('gemini_model', modelSelect.value);
      showToast(`Đã chuyển sang model: ${modelSelect.value}`, 'info');
    });
  }

  function updateApiKeyStatus(hasKey) {
    if (hasKey) {
      apiKeyStatusBadge.className = 'badge badge-green';
      apiKeyStatusBadge.textContent = 'Đã cấu hình Key';
    } else {
      apiKeyStatusBadge.className = 'badge badge-yellow';
      apiKeyStatusBadge.textContent = 'Chưa có Key';
    }
  }

  function getApiKey() {
    return apiKeyInput.value.trim() || localStorage.getItem('gemini_api_key') || '';
  }

  // --- NAVIGATION ---
  function initNavigation() {
    navTabs.forEach(tab => {
      tab.addEventListener('click', () => {
        const targetTab = tab.dataset.tab;
        navTabs.forEach(t => t.classList.remove('active'));
        tabContents.forEach(c => c.classList.remove('active'));

        tab.classList.add('active');
        document.getElementById(targetTab).classList.add('active');

        if (targetTab === 'tab-docs') {
          if (Object.keys(documentsCache).length === 0) loadDocuments();
        } else if (targetTab === 'tab-history') {
          loadHistory();
        }
      });
    });
  }

  // --- ACCORDION ---
  function initAccordion() {
    accordionToggle.addEventListener('click', () => {
      contextAccordion.classList.toggle('open');
    });

    clearInputBtn.addEventListener('click', () => {
      studentMessage.value = '';
      ctxAudience.value = '';
      ctxPronoun.value = 'thầy - em';
      ctxOldIssue.value = '';
      ctxOldPrescription.value = '';
      ctxCurrentIssue.value = '';
      ctxCurrentPrescription.value = '';
      ctxAppointmentDays.value = '';
      resetOutputView();
      showToast('Đã xóa trắng thông tin nhập.', 'info');
    });
  }

  // --- SAMPLES LOADER & 1-CLICK TEST ---
  async function initSamples() {
    try {
      const res = await fetch('/api/samples');
      const data = await res.json();
      if (data.success && data.samples) {
        samplesCache = data.samples;
      }
    } catch (e) {
      console.warn('Lỗi khi tải samples:', e);
    }

    // Gắn sự kiện click vào các nút mẫu
    document.querySelectorAll('.sample-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        const sampleId = btn.dataset.sampleId;
        const sample = samplesCache.find(s => s.id === sampleId);
        if (!sample) return;

        // Điền tin nhắn học viên
        studentMessage.value = sample.input_message;

        // Điền context nếu có
        if (sample.context) {
          if (sample.context.audience) ctxAudience.value = sample.context.audience;
          if (sample.context.pronoun) ctxPronoun.value = sample.context.pronoun;
          if (sample.context.topic) ctxCurrentIssue.value = sample.context.topic;
          contextAccordion.classList.add('open');
        }

        // Tự động cuộn nhẹ đến khung phân tích
        showToast(`Đã nạp mẫu: "${sample.title}"`, 'info');
      });
    });
  }

  // --- TAB 1: PHÂN TÍCH & SINH GỢI Ý ---
  analyzeBtn.addEventListener('click', async () => {
    const message = studentMessage.value.trim();
    if (!message) {
      showToast('Vui lòng nhập tin nhắn của học viên trước khi bấm phân tích!', 'error');
      studentMessage.focus();
      return;
    }

    const apiKey = getApiKey();
    if (!apiKey) {
      showToast('Vui lòng nhập Gemini API Key ở góc trên màn hình!', 'error');
      apiKeyInput.focus();
      return;
    }

    const context = {
      audience: ctxAudience.value.trim(),
      pronoun: ctxPronoun.value.trim(),
      old_issue: ctxOldIssue.value.trim(),
      old_prescription: ctxOldPrescription.value.trim(),
      current_issue: ctxCurrentIssue.value.trim(),
      current_prescription: ctxCurrentPrescription.value.trim(),
      appointment_days: ctxAppointmentDays.value.trim()
    };

    setLoading(true);

    try {
      const response = await fetch('/api/generate', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-gemini-api-key': apiKey
        },
        body: JSON.stringify({
          message,
          context,
          model: modelSelect.value
        })
      });

      const result = await response.json();

      if (!result.success) {
        throw new Error(result.error || 'Đã xảy ra lỗi trong quá trình xử lý');
      }

      renderResults(result.data, message, context);
      showToast('Đã phân loại và sinh thành công 5 phương án!', 'success');
    } catch (err) {
      console.error(err);
      showToast(err.message, 'error');
    } finally {
      setLoading(false);
    }
  });

  function setLoading(isLoading) {
    if (isLoading) {
      analyzeBtn.classList.add('loading');
      analyzeBtn.disabled = true;
      document.getElementById('btnText').textContent = 'Đang phân tích & sinh 5 phương án...';
    } else {
      analyzeBtn.classList.remove('loading');
      analyzeBtn.disabled = false;
      document.getElementById('btnText').textContent = '✨ Phân Tích & Sinh 5 Gợi Ý Trả Lời';
    }
  }

  function renderResults(data, originalMessage, context) {
    emptyPlaceholder.classList.add('hidden');

    // 1. Hiển thị cờ nhạy cảm (Sensitivity)
    const sensitivity = (data.sensitivity || 'xanh').toLowerCase();
    sensitivityAlert.className = `sensitivity-card ${sensitivity}`;
    sensitivityAlert.classList.remove('hidden');

    if (sensitivity === 'do') {
      alertIcon.textContent = '🔴';
      alertTitle.textContent = 'PHÁT HIỆN CA CỜ ĐỎ: BẮT BUỘC NGƯỜI THẬT DUYỆT';
      alertBadge.className = 'badge badge-red';
      alertBadge.textContent = 'CỜ ĐỎ';
      redFlagWarning.classList.remove('hidden');
    } else if (sensitivity === 'vang') {
      alertIcon.textContent = '🟡';
      alertTitle.textContent = 'PHÂN LOẠI: CỜ VÀNG (CẦN KIỂM TRA CHUYÊN MÔN / QUY ĐỊNH)';
      alertBadge.className = 'badge badge-yellow';
      alertBadge.textContent = 'CỜ VÀNG';
      redFlagWarning.classList.add('hidden');
    } else {
      alertIcon.textContent = '🟢';
      alertTitle.textContent = 'PHÂN LOẠI: CỜ XANH (AN TOÀN / CHÀO HỎI / ĐỘNG VIÊN)';
      alertBadge.className = 'badge badge-green';
      alertBadge.textContent = 'CỜ XANH';
      redFlagWarning.classList.add('hidden');
    }

    alertReason.textContent = data.flag_reason || 'Được phân loại theo tiêu chuẩn quy định.';

    // 2. Nhận định tình huống
    if (data.analysis) {
      analysisText.textContent = data.analysis;
      analysisCard.classList.remove('hidden');
    } else {
      analysisCard.classList.add('hidden');
    }

    // 3. Render 5 replies
    currentReplies = data.replies || [];
    repliesList.innerHTML = '';

    currentReplies.forEach((replyObj, idx) => {
      const card = document.createElement('div');
      card.className = 'reply-card';
      card.dataset.index = idx;

      card.innerHTML = `
        <div class="reply-card-header">
          <span class="reply-tone-badge">Phương án ${idx + 1}: ${escapeHtml(replyObj.tone || 'Phong cách chuẩn')}</span>
          <div class="reply-card-actions">
            <button type="button" class="btn btn-secondary btn-sm copy-btn" data-index="${idx}">📋 Sao chép</button>
            <button type="button" class="btn btn-primary btn-sm select-btn" data-index="${idx}">✏️ Chọn & Sửa</button>
          </div>
        </div>
        <div class="reply-content">${escapeHtml(replyObj.content || '')}</div>
      `;

      repliesList.appendChild(card);
    });

    repliesSection.classList.remove('hidden');

    // Gắn sự kiện cho các nút trong reply cards
    document.querySelectorAll('.copy-btn').forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        const index = parseInt(btn.dataset.index, 10);
        if (currentReplies[index]) {
          copyToClipboard(currentReplies[index].content);
          showToast(`Đã sao chép Phương án ${index + 1}!`, 'success');
        }
      });
    });

    document.querySelectorAll('.select-btn').forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        const index = parseInt(btn.dataset.index, 10);
        selectReply(index);
      });
    });

    // Mặc định chọn phương án 1
    if (currentReplies.length > 0) {
      selectReply(0);
    }

    // Cuộn mượt đến kết quả
    sensitivityAlert.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  }

  function selectReply(index) {
    selectedReplyIndex = index;
    const reply = currentReplies[index];
    if (!reply) return;

    // Highlight card được chọn
    document.querySelectorAll('.reply-card').forEach((card, i) => {
      if (i === index) card.classList.add('selected');
      else card.classList.remove('selected');
    });

    // Hiển thị khung soạn thảo duyệt cuối cùng
    finalEditorCard.classList.remove('hidden');
    selectedToneBadge.textContent = `Phương án ${index + 1}: ${reply.tone || 'Gợi ý'}`;
    finalMessageText.value = reply.content;
    sendStatusMsg.classList.add('hidden');

    finalEditorCard.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  }

  copyFinalBtn.addEventListener('click', () => {
    const text = finalMessageText.value;
    if (!text.trim()) {
      showToast('Khung tin nhắn đang trống!', 'error');
      return;
    }
    copyToClipboard(text);
    showToast('Đã sao chép tin nhắn vào clipboard thành công!', 'success');
  });

  approveSendBtn.addEventListener('click', async () => {
    const text = finalMessageText.value.trim();
    if (!text) {
      showToast('Tin nhắn gửi không được để trống!', 'error');
      return;
    }

    const currentSample = currentReplies[selectedReplyIndex] || {};
    const payload = {
      student_message: studentMessage.value.trim(),
      chosen_reply: text,
      tone: currentSample.tone || 'Tự soạn / Chỉnh sửa',
      sensitivity: alertBadge.textContent.toLowerCase(),
      sent_at: new Date().toISOString()
    };

    try {
      const res = await fetch('/api/history', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });
      const data = await res.json();
      if (data.success) {
        sendStatusMsg.className = 'status-msg success';
        sendStatusMsg.textContent = '🎉 Đã ghi nhận phản hồi thành công vào lịch sử học tập của Thầy Minh!';
        sendStatusMsg.classList.remove('hidden');
        showToast('Đã lưu phản hồi thành công!', 'success');
      }
    } catch (e) {
      showToast('Lỗi khi lưu phản hồi vào lịch sử', 'error');
    }
  });

  function resetOutputView() {
    emptyPlaceholder.classList.remove('hidden');
    sensitivityAlert.classList.add('hidden');
    analysisCard.classList.add('hidden');
    repliesSection.classList.add('hidden');
    finalEditorCard.classList.add('hidden');
  }

  // --- TAB 2: QUẢN LÝ TÀI LIỆU (KNOWLEDGE BASE) ---
  async function loadDocuments() {
    try {
      docSaveStatus.textContent = 'Đang tải...';
      const res = await fetch('/api/documents');
      const data = await res.json();
      if (data.success && data.documents) {
        documentsCache = data.documents;
        switchEditingFile(currentEditingFile);
        docSaveStatus.textContent = 'Đã đồng bộ';
      }
    } catch (e) {
      console.error(e);
      showToast('Lỗi khi tải tài liệu', 'error');
      docSaveStatus.textContent = 'Lỗi tải dữ liệu';
    }
  }

  function switchEditingFile(filename) {
    currentEditingFile = filename;
    currentEditingFilename.textContent = filename;
    docContentTextarea.value = documentsCache[filename] || '';

    // Cập nhật trạng thái active sidebar
    document.querySelectorAll('.file-item').forEach(item => {
      if (item.dataset.filename === filename) item.classList.add('active');
      else item.classList.remove('active');
    });

    docSaveStatus.textContent = 'Sẵn sàng chỉnh sửa';
  }

  // Bắt sự kiện chọn file bên sidebar
  document.querySelectorAll('.file-item').forEach(item => {
    item.addEventListener('click', () => {
      const filename = item.dataset.filename;
      switchEditingFile(filename);
    });
  });

  // Lưu tài liệu vào server
  saveCurrentDocBtn.addEventListener('click', async () => {
    const content = docContentTextarea.value;
    docSaveStatus.textContent = 'Đang lưu...';
    try {
      const res = await fetch('/api/documents', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          filename: currentEditingFile,
          content: content
        })
      });

      const data = await res.json();
      if (data.success) {
        documentsCache[currentEditingFile] = content;
        docSaveStatus.textContent = '✅ Đã lưu vào bộ nhớ AI';
        showToast(`Đã lưu "${currentEditingFile}" vào bộ nhớ AI!`, 'success');
      } else {
        throw new Error(data.error);
      }
    } catch (err) {
      docSaveStatus.textContent = '❌ Lỗi lưu file';
      showToast(`Lỗi: ${err.message}`, 'error');
    }
  });

  reloadDocsBtn.addEventListener('click', () => {
    loadDocuments();
    showToast('Đã tải lại toàn bộ tài liệu từ đĩa.', 'info');
  });

  // --- TAB 3: LỊCH SỬ DUYỆT TIN NHẮN ---
  async function loadHistory() {
    try {
      const res = await fetch('/api/history');
      const data = await res.json();
      if (data.success && data.history) {
        renderHistoryTable(data.history);
      }
    } catch (e) {
      console.error(e);
    }
  }

  refreshHistoryBtn.addEventListener('click', () => {
    loadHistory();
    showToast('Đã làm mới nhật ký!', 'info');
  });

  function renderHistoryTable(historyList) {
    if (!historyList || historyList.length === 0) {
      historyTableBody.innerHTML = '<tr><td colspan="5" class="text-center">Chưa có lịch sử duyệt tin nhắn nào.</td></tr>';
      return;
    }

    historyTableBody.innerHTML = historyList.map(item => {
      const dateStr = item.timestamp ? new Date(item.timestamp).toLocaleString('vi-VN') : 'Vừa xong';
      const badgeClass = item.sensitivity === 'do' ? 'badge-red' : (item.sensitivity === 'vang' ? 'badge-yellow' : 'badge-green');
      return `
        <tr>
          <td style="white-space: nowrap; font-size: 11.5px; color: #64748b;">${dateStr}</td>
          <td><span class="badge ${badgeClass}">${escapeHtml(item.sensitivity || 'XANH')}</span></td>
          <td style="max-width: 260px; word-break: break-word;">${escapeHtml(item.student_message || '')}</td>
          <td style="max-width: 320px; word-break: break-word; font-weight: 500;">${escapeHtml(item.chosen_reply || '')}</td>
          <td><span class="badge badge-blue">${escapeHtml(item.tone || 'Gợi ý')}</span></td>
        </tr>
      `;
    }).join('');
  }

  // --- UTILITIES ---
  function showToast(message, type = 'info') {
    const toast = document.createElement('div');
    toast.className = `toast ${type}`;
    
    let icon = 'ℹ️';
    if (type === 'success') icon = '✅';
    if (type === 'error') icon = '❌';

    toast.innerHTML = `<span>${icon}</span> <span>${escapeHtml(message)}</span>`;
    toastContainer.appendChild(toast);

    setTimeout(() => {
      toast.style.opacity = '0';
      toast.style.transform = 'translateY(12px)';
      toast.style.transition = 'all 0.3s ease';
      setTimeout(() => toast.remove(), 300);
    }, 3500);
  }

  function copyToClipboard(text) {
    if (navigator.clipboard && window.isSecureContext) {
      navigator.clipboard.writeText(text);
    } else {
      const textArea = document.createElement('textarea');
      textArea.value = text;
      document.body.appendChild(textArea);
      textArea.select();
      document.execCommand('copy');
      textArea.remove();
    }
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
