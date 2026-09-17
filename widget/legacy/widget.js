// Widget Thầy Minh Piano - Basic version
// Test iframe/widget nhúng vào Pancake

console.log('%c🎹 Widget Thầy Minh Piano - Đang khởi động...', 'color:#2563eb;font-weight:600');

class ThayMinhWidget {
    constructor() {
        this.conversationId = null;
        this.init();
    }
    
    init() {
        // Lấy conversation ID từ Pancake (nếu nhúng iframe)
        this.getConversationId();
        
        // Gửi message test
        this.sendTestMessage();
        
        // Lắng nghe reply từ Pancake
        this.listenForPancake();
    }
    
    getConversationId() {
        // Trong iframe: window.parent.document.querySelector('selector')
        // Trong content script: document.querySelector('selector')
        const selector = '.conversation-header .conversation-title';
        
        const el = document.querySelector(selector);
        if (el) {
            this.conversationId = 'pancake-conv-' + Math.random().toString(36).substr(2, 9);
            console.log('%c✅ Đã lấy conversation ID:', 'color:#10b981', this.conversationId);
        } else {
            this.conversationId = 'standalone-demo';
            console.log('%c⚠️ Chạy standalone (không có Pancake)', 'color:#f59e0b');
        }
    }
    
    sendTestMessage() {
        const event = new CustomEvent('pancake-ai-ready', {
            detail: { 
                conversationId: this.conversationId,
                message: 'Chào em, em muốn học bài nào hôm nay?',
                widget: 'thay-minh-piano'
            }
        });
        window.dispatchEvent(event);
    }
    
    listenForPancake() {
        window.addEventListener('pancake-ai-reply', (e) => {
            console.log('%c📩 Đã nhận reply từ Pancake:', 'color:#8b5cf6', e.detail);
        });
    }
}

// Khởi động
new ThayMinhWidget();

// Expose cho iframe
if (window.parent !== window) {
    window.parent.postMessage({ type: 'widget-loaded', name: 'Thầy Minh Piano' }, '*');
}