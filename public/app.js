// MINH PIANO STUDIO — CLIENT WIDGET ENGINE (API v1)

document.addEventListener('DOMContentLoaded', () => {
  // 1. Clean legacy storage keys safely without logging values
  try {
    localStorage.removeItem('gemini_api_key');
    localStorage.removeItem('gemini_model');
  } catch (e) {}

  // 2. Pre-defined test situations
  const SAMPLE_SCENARIOS = {
    red: {
      message: 'Dạ thầy ơi, em vừa nhận kết quả xét nghiệm từ bệnh viện Ung Bướu, bác sĩ báo em có khối u ác tính phải nhập viện xạ trị gấp tuần sau. Chắc em không thể tiếp tục theo học đàn cùng thầy được nữa rồi, buồn quá thầy ơi...',
      context: { pronoun: 'thầy - em', audience: 'Học viên thanh niên', current_issue: 'Ung thư / Xạ trị', current_prescription: '' }
    },
    fingering: {
      message: 'Thầy ơi đoạn chuyển ngón tay từ phím trắng sang phím đen ở câu 2 em hay bị vấp với cứng khớp ngón 4-5 quá, thầy chỉ giúp em cách xếp ngón với ạ!',
      context: { pronoun: 'thầy - em', audience: 'Học viên trẻ', current_issue: 'Vướng phím đen ngón 4-5', current_prescription: 'Tập bài ngón lặp lại' }
    },
    reservation: {
      message: 'Thầy ơi tuần tới công ty em cử đi công tác nước ngoài 2 tháng, em muốn xin bảo lưu khóa học 20 tuần này thì có được không và thủ tục như thế nào ạ?',
      context: { pronoun: 'thầy - em', audience: 'Người đi làm', current_issue: 'Xin bảo lưu công tác', current_prescription: '' }
    },
    motivation: {
      message: 'Dạo này việc công ty nhiều quá nên tối về em mệt không tập được đàn phút nào hết thầy ơi, em thấy nản quá...',
      context: { pronoun: 'thầy - em', audience: 'Người đi làm', current_issue: 'Bận rộn, mất động lực', current_prescription: '15 phút mỗi ngày' }
    }
  };

  // State
  let currentReplies = [];
  let selectedReplyIdx = 0;
  let activeJobId = null;
  let activeJobToken = null;
  let pollTimer = null;
  let pollStartTime = 0;

  // DOM Elements
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
  const confirmFeedbackBtn = document.getElementById('confirmFeedbackBtn');
  const outdatedVersionNotice = document.getElementById('outdatedVersionNotice');
  const statusLabelText = document.getElementById('statusLabelText');

  const toastBubble = document.getElementById('toastBubble');
  const toastSymbol = document.getElementById('toastSymbol');
  const toastMessage = document.getElementById('toastMessage');

  // Helper: Secure Random Hex
  function generateRandomHex(length = 24) {
    const arr = new Uint8Array(length);
    crypto.getRandomValues(arr);
    return Array.from(arr).map(b => b.toString(16).padStart(2, '0')).join('');
  }

  // Helper: Escape HTML
  function escapeHtml(str) {
    if (!str) return '';
    return String(str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');
  }

  // Init Health Check
  checkServerHealth();

  // Restore Session If Available
  restoreSession();

  // Bind Events
  bindEvents();

  async function checkServerHealth() {
    try {
      const res = await fetch('/api/v1/health/ready');
      if (res.ok) {
        statusLabelText.textContent = 'Hệ thống sẵn sàng';
      } else {
        const data = await res.json().catch(() => ({}));
        statusLabelText.textContent = data.error || 'Đang bảo trì tri thức';
      }
    } catch (e) {
      statusLabelText.textContent = 'Mất kết nối máy chủ';
    }
  }

  function bindEvents() {
    // Sample clicks
    samplesPills.querySelectorAll('.sample-pill').forEach(btn => {
      btn.addEventListener('click', () => {
        const key = btn.dataset.sample;
        const sample = SAMPLE_SCENARIOS[key];
        if (!sample) return;

        studentMessageInput.value = sample.message;
        if (sample.context.pronoun) ctxPronoun.value = sample.context.pronoun;
        if (sample.context.audience) ctxAudience.value = sample.context.audience;
        if (sample.context.current_issue) ctxCurrentIssue.value = sample.context.current_issue;
        if (sample.context.current_prescription) ctxCurrentPrescription.value = sample.context.current_prescription;

        showToast('Đã nạp tình huống mẫu!', '♩');
      });
    });

    // Accordion Toggle
    toggleContextBtn.addEventListener('click', () => {
      const isHidden = contextBody.classList.toggle('hidden');
      toggleContextBtn.querySelector('.toggle-glyph').textContent = isHidden ? '+' : '−';
    });

    // Clear Input
    clearInputBtn.addEventListener('click', () => {
      studentMessageInput.value = '';
      ctxAudience.value = '';
      ctxCurrentIssue.value = '';
      ctxCurrentPrescription.value = '';
      resultsDesk.classList.add('hidden');
      emptyWelcome.classList.remove('hidden');
      outdatedVersionNotice.classList.add('hidden');
      studentMessageInput.focus();
      sessionStorage.removeItem('active_job_id');
      sessionStorage.removeItem('active_job_token');
    });

    // Generate Button & Keyboard shortcut
    generateRepliesBtn.addEventListener('click', handleGenerate);
    studentMessageInput.addEventListener('keydown', (e) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') {
        e.preventDefault();
        handleGenerate();
      }
    });

    // Copy to Clipboard
    copyToClipboardBtn.addEventListener('click', async () => {
      const text = finalEditorTextarea.value;
      if (!text.trim()) {
        showToast('Nội dung đang trống!', '⚠');
        return;
      }

      let copied = false;
      if (navigator.clipboard && navigator.clipboard.writeText) {
        try {
          await navigator.clipboard.writeText(text);
          copied = true;
        } catch (e) {}
      }

      if (!copied) {
        const ta = document.createElement('textarea');
        ta.value = text;
        ta.style.position = 'fixed';
        ta.style.opacity = '0';
        document.body.appendChild(ta);
        ta.select();
        try {
          copied = document.execCommand('copy');
        } catch (e) {}
        document.body.removeChild(ta);
      }

      if (copied) {
        showToast('Đã sao chép vào bộ nhớ!', '✓');
      } else {
        showToast('Không thể sao chép tự động, bạn hãy bôi đen để copy nhé.', 'ℹ');
      }
    });

    // Confirm Feedback
    confirmFeedbackBtn.addEventListener('click', handleFeedback);
  }

  async function handleGenerate() {
    const msg = studentMessageInput.value.trim();
    if (!msg) {
      showToast('Vui lòng nhập nội dung tin nhắn học viên trước.', '⚠');
      studentMessageInput.focus();
      return;
    }

    setLoading(true, 'Đang tiếp nhận yêu cầu...');

    // Generate or get existing token and idempotency key
    activeJobToken = generateRandomHex(32);
    const idempotencyKey = 'req_' + generateRandomHex(16);

    const context = {
      pronoun: ctxPronoun.value,
      audience: ctxAudience.value.trim(),
      current_issue: ctxCurrentIssue.value.trim(),
      current_prescription: ctxCurrentPrescription.value.trim()
    };

    try {
      const response = await fetch('/api/v1/generate', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Idempotency-Key': idempotencyKey,
          'X-Job-Token': activeJobToken
        },
        body: JSON.stringify({
          message: msg,
          context: context
        })
      });

      const data = await response.json();
      if (!response.ok) {
        throw new Error(data.error?.message || `Lỗi yêu cầu (${response.status})`);
      }

      activeJobId = data.job_id;

      // Save to sessionStorage for refresh tolerance
      sessionStorage.setItem('active_job_id', activeJobId);
      sessionStorage.setItem('active_job_token', activeJobToken);

      // Start polling for result
      startPollingJob(activeJobId, activeJobToken);
    } catch (err) {
      setLoading(false);
      showToast(err.message, '⚠');
    }
  }

  function startPollingJob(jobId, jobToken) {
    pollStartTime = Date.now();
    let delay = 500;

    const poll = async () => {
      try {
        const res = await fetch(`/api/v1/jobs/${encodeURIComponent(jobId)}`, {
          headers: { 'X-Job-Token': jobToken }
        });

        if (res.status === 403) {
          throw new Error('Mã bảo mật công việc không khớp hoặc đã hết hạn.');
        }

        const data = await res.json();
        if (data.state === 'succeeded' && data.result) {
          setLoading(false);
          renderResults(data.result, data.is_outdated_version);
          return;
        }

        if (data.state === 'failed') {
          setLoading(false);
          showToast(`Lỗi tạo gợi ý: ${data.error_message || 'Không thành công'}`, '⚠');
          // Allow manual composition
          resultsDesk.classList.remove('hidden');
          emptyWelcome.classList.add('hidden');
          activeToneChip.textContent = 'Soạn thủ công';
          finalEditorTextarea.focus();
          return;
        }

        // Still queued or running
        const elapsed = Date.now() - pollStartTime;
        if (elapsed > 120000) {
          setLoading(false);
          showToast('Hết thời gian chờ phản hồi (120s). Vui lòng thử lại.', '⚠');
          return;
        }

        const statusMsg = data.state === 'running' 
          ? `Đang lắng nghe & phân tích (Lần ${data.attempt || 1})...`
          : 'Đang xếp hàng chờ xử lý...';
        setLoading(true, statusMsg);

        // Exponential backoff capped at 2500ms
        delay = Math.min(2500, delay * 1.25);
        pollTimer = setTimeout(poll, delay);
      } catch (err) {
        setLoading(false);
        showToast(err.message, '⚠');
      }
    };

    pollTimer = setTimeout(poll, delay);
  }

  async function restoreSession() {
    const savedJobId = sessionStorage.getItem('active_job_id');
    const savedJobToken = sessionStorage.getItem('active_job_token');

    if (savedJobId && savedJobToken) {
      activeJobId = savedJobId;
      activeJobToken = savedJobToken;
      try {
        const res = await fetch(`/api/v1/jobs/${encodeURIComponent(activeJobId)}`, {
          headers: { 'X-Job-Token': activeJobToken }
        });
        if (res.ok) {
          const data = await res.json();
          if (data.state === 'succeeded' && data.result) {
            renderResults(data.result, data.is_outdated_version);
          } else if (data.state === 'queued' || data.state === 'running') {
            startPollingJob(activeJobId, activeJobToken);
          }
        }
      } catch (e) {}
    }
  }

  function renderResults(result, isOutdatedVersion = false) {
    emptyWelcome.classList.add('hidden');
    resultsDesk.classList.remove('hidden');

    if (isOutdatedVersion) {
      outdatedVersionNotice.classList.remove('hidden');
    } else {
      outdatedVersionNotice.classList.add('hidden');
    }

    // 1. Sensitivity Banner
    const sens = (result.sensitivity || 'xanh').toLowerCase();
    sensitivityBanner.className = `sensitivity-banner banner-${sens}`;

    if (sens === 'do') {
      bannerTag.textContent = 'CỜ ĐỎ — Lưu tâm đặc biệt';
      bannerTitle.textContent = 'Biến cố sức khỏe / Gia đình';
      bannerDesc.textContent = result.flag_reason || 'Học viên gặp khó khăn/bệnh nan y. Tuyệt đối không níu kéo, chỉ an ủi và tôn trọng quyền lợi của học viên.';
    } else if (sens === 'vang') {
      bannerTag.textContent = 'CỜ VÀNG — Học vụ / Kỹ thuật';
      bannerTitle.textContent = 'Kỹ thuật ngón hoặc Quy định';
      bannerDesc.textContent = result.flag_reason || 'Nhận xét cần độ chuẩn xác sư phạm hoặc đối chiếu chính sách bảo lưu.';
    } else {
      bannerTag.textContent = 'CỜ XANH — Thường nhật';
      bannerTitle.textContent = 'Tâm sự & Luyện tập';
      bannerDesc.textContent = result.flag_reason || 'Trao đổi tích cực, động viên học viên duy trì 15 phút tập đàn.';
    }

    // 2. Suggestions Deck
    currentReplies = result.replies || [];
    selectedReplyIdx = 0;

    suggestionsStack.innerHTML = currentReplies.map((r, idx) => `
      <div class="suggestion-card ${idx === 0 ? 'active-option' : ''}" data-idx="${idx}">
        <div class="suggestion-card-top">
          <span class="tone-badge">${escapeHtml(r.tone || `Phương án ${idx + 1}`)}</span>
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

    if (currentReplies.length > 0) {
      selectOption(0);
    }

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

    activeToneChip.textContent = r.tone || `Phương án ${index + 1}`;
    finalEditorTextarea.value = r.content || '';
  }

  async function handleFeedback() {
    const chosenText = finalEditorTextarea.value.trim();
    if (!chosenText) {
      showToast('Nội dung phản hồi không được để trống!', '⚠');
      return;
    }

    if (!activeJobId || !activeJobToken) {
      showToast('Không có phiên làm việc để lưu phản hồi.', '⚠');
      return;
    }

    const selectedReply = currentReplies[selectedReplyIdx]?.content || '';

    try {
      const res = await fetch(`/api/v1/jobs/${encodeURIComponent(activeJobId)}/feedback`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Job-Token': activeJobToken
        },
        body: JSON.stringify({
          selected_reply: selectedReply,
          edited_reply: chosenText
        })
      });

      const data = await res.json();
      if (res.ok) {
        showToast('Đã lưu phản hồi vào hệ thống!', '✓');
      } else {
        showToast(data.error?.message || 'Không thể lưu phản hồi', '⚠');
      }
    } catch (err) {
      showToast('Lỗi kết nối khi gửi phản hồi.', '⚠');
    }
  }

  function setLoading(isLoading, text = 'Đang lắng nghe & soạn phương án...') {
    if (isLoading) {
      loadingSpinner.classList.remove('hidden');
      generateBtnText.textContent = text;
      generateRepliesBtn.disabled = true;
      generateRepliesBtn.style.opacity = '0.75';
    } else {
      loadingSpinner.classList.add('hidden');
      generateBtnText.textContent = 'Lắng nghe & Soạn phương án';
      generateRepliesBtn.disabled = false;
      generateRepliesBtn.style.opacity = '1';
    }
  }

  let toastTimer = null;
  function showToast(msg, sym = '✓') {
    toastSymbol.textContent = sym;
    toastMessage.textContent = msg;
    toastBubble.classList.remove('hidden');

    if (toastTimer) clearTimeout(toastTimer);
    toastTimer = setTimeout(() => {
      toastBubble.classList.add('hidden');
    }, 2800);
  }
});
