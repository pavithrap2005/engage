interface IndiquerConfig {
  appId: string;
  apiHost?: string;
}

interface Customization {
  name?: string;
  color: string;
  gradient?: string | null;
  shape: string;
  logoUrl?: string | null;
  position: string;
  welcomeMessage: string;
  offlineMessage: string;
  autoOpen: boolean;
  delayTimer: number;
  isDarkMode: boolean;
  customCss?: string | null;
}

class IndiquerWidget {
  private config!: IndiquerConfig;
  private container!: HTMLDivElement;
  private shadow!: ShadowRoot;
  private isOpen = false;
  private customization!: Customization;
  private visitorId!: string;
  private sessionId!: string;
  private workspaceId!: string;
  private roomId!: string;
  private socket: any = null;
  private preChatSubmitted = false;
  private visitorName = '';
  private visitorEmail = '';
  private isChatClosed = false;

  public async init(config: IndiquerConfig) {
    this.config = {
      apiHost: window.location.hostname === 'localhost' ? 'http://localhost:3001' : 'https://api-engage.indiquer.in',
      ...config
    };

    // Restore saved pre-chat info if present
    try {
      const savedInfo = sessionStorage.getItem('indiquer_prechat');
      if (savedInfo) {
        const parsed = JSON.parse(savedInfo);
        this.visitorName = parsed.name || '';
        this.visitorEmail = parsed.email || '';
        this.preChatSubmitted = true;
      }
    } catch (e) {
      // Ignore storage error
    }

    // Prevent duplicate initializations
    if (document.getElementById('indiquer-widget-root')) {
      return;
    }

    let savedVisitorId = '';
    try {
      savedVisitorId = localStorage.getItem('indiquer_visitor_id') || '';
    } catch (e) {}

    let data: any = null;
    try {
      // 1. Fetch widget configurations & register visitor
      const res = await fetch(`${this.config.apiHost}/api/widget-delivery/init`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ appId: this.config.appId, visitorId: savedVisitorId }),
      });

      if (res.ok) {
        data = await res.json();
      } else if (this.config.apiHost !== 'http://localhost:3001') {
        const localRes = await fetch(`http://localhost:3001/api/widget-delivery/init`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ appId: this.config.appId, visitorId: savedVisitorId }),
        });
        if (localRes.ok) {
          data = await localRes.json();
          this.config.apiHost = 'http://localhost:3001';
        }
      }
    } catch (err) {
      if (this.config.apiHost !== 'http://localhost:3001') {
        try {
          const localRes = await fetch(`http://localhost:3001/api/widget-delivery/init`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ appId: this.config.appId, visitorId: savedVisitorId }),
          });
          if (localRes.ok) {
            data = await localRes.json();
            this.config.apiHost = 'http://localhost:3001';
          }
        } catch (e) {
          // Ignore
        }
      }
    }

    this.customization = data?.customization || {
      color: '#4F46E5',
      shape: 'ROUND',
      position: 'BOTTOM_RIGHT',
      welcomeMessage: 'Hello! How can we help you today?',
      offlineMessage: 'We are currently offline.',
      autoOpen: false,
      delayTimer: 3,
      isDarkMode: false
    };
    this.visitorId = data?.visitorId || 'guest-' + Math.random().toString(36).substring(2, 9);
    this.sessionId = data?.sessionId || 'sess-' + Math.random().toString(36).substring(2, 9);
    this.workspaceId = data?.workspaceId || '';

    try {
      if (this.visitorId && !this.visitorId.startsWith('guest-')) {
        localStorage.setItem('indiquer_visitor_id', this.visitorId);
      }
    } catch (e) {}

    // 2. Build DOM
    this.createDom();

    // 3. Load Socket.IO client script dynamically
    this.loadSocketIo(() => {
      this.setupSocket();
    });

    // 4. Handle autoOpen / delayTimer
    if (this.customization.autoOpen) {
      setTimeout(() => {
        if (!this.isOpen) {
          this.toggleChat(true);
        }
      }, (this.customization.delayTimer || 3) * 1000);
    }
  }

  private loadSocketIo(callback: () => void) {
    if ((window as any).io) {
      callback();
      return;
    }
    const script = document.createElement('script');
    script.src = `${this.config.apiHost}/socket.io/socket.io.js`;
    script.onload = () => callback();
    document.head.appendChild(script);
  }

  private setupSocket() {
    const io = (window as any).io;
    if (!io) return;

    // Connect to backend websocket server
    this.socket = io(this.config.apiHost);

    // Initialize visitor room mapping
    this.socket.emit('visitorInit', {
      workspaceId: this.workspaceId || this.visitorId,
      visitorId: this.visitorId
    });

    // Handle initialization success response
    this.socket.on('visitorInitSuccess', (data: { room: any }) => {
      this.roomId = data.room.id;
      if (data.room.status === 'CLOSED') {
        this.isChatClosed = true;
      }
      // Fetch historical messages if room already exists
      this.loadMessageHistory();
    });

    // Listen to real-time incoming messages
    this.socket.on('message', (message: any) => {
      this.appendMsgBubble(message);
    });

    // Listen to status changes (e.g. agent closing chat room)
    this.socket.on('roomStatusChange', (data: { status: string }) => {
      if (data.status === 'CLOSED') {
        this.isChatClosed = true;
        this.showCsatScreen();
      }
    });

    // Handle typing events (coming from agent)
    this.socket.on('typing', (data: { isTyping: boolean; senderName: string }) => {
      const typingEl = this.shadow.querySelector('#indiquer-typing-indicator') as HTMLDivElement;
      if (typingEl) {
        if (data.isTyping) {
          typingEl.textContent = `${data.senderName} is typing...`;
          typingEl.style.display = 'block';
        } else {
          typingEl.style.display = 'none';
        }
      }
    });
  }

  private async loadMessageHistory() {
    try {
      const res = await fetch(`${this.config.apiHost}/api/chat/rooms/${this.roomId}/messages`, {
        headers: {
          'Authorization': `Bearer guest`
        }
      });
      if (!res.ok) return;
      const messages = await res.json();
      const msgList = this.shadow.querySelector('#indiquer-msg-list') as HTMLDivElement;
      if (!msgList) return;

      if (messages.length > 0) {
        msgList.innerHTML = '';
      }

      messages.forEach((msg: any) => {
        this.appendMsgBubble(msg);
      });
    } catch (e) {
      console.error('Failed to load chat history:', e);
    }
  }

  private appendMsgBubble(message: any) {
    // Hide agent internal whisper notes from visitor
    if (message.senderType === 'AGENT_INTERNAL') return;

    const msgList = this.shadow.querySelector('#indiquer-msg-list') as HTMLDivElement;
    if (!msgList) return;

    // Avoid duplicating bubbles
    const bubbleId = `msg-${message.id}`;
    if (this.shadow.getElementById(bubbleId)) return;

    const isUser = message.senderType === 'VISITOR';
    const bubble = document.createElement('div');
    bubble.id = bubbleId;
    bubble.className = `message ${isUser ? 'user' : 'bot'}`;
    bubble.textContent = message.content;
    msgList.appendChild(bubble);
    msgList.scrollTop = msgList.scrollHeight;
  }

  private createDom() {
    this.container = document.createElement('div');
    this.container.id = 'indiquer-widget-root';
    this.container.style.position = 'fixed';
    this.container.style.bottom = '20px';

    if (this.customization.position === 'BOTTOM_LEFT') {
      this.container.style.left = '20px';
    } else {
      this.container.style.right = '20px';
    }

    this.container.style.zIndex = '999999';
    this.container.style.fontFamily = 'Outfit, system-ui, -apple-system, sans-serif';

    this.shadow = this.container.attachShadow({ mode: 'open' });
    document.body.appendChild(this.container);

    this.injectStyles();
    this.render();
  }

  private injectStyles() {
    const primaryColor = this.customization.color || '#4f46e5';
    const isLeft = this.customization.position === 'BOTTOM_LEFT';
    const borderRadius = this.customization.shape === 'SQUARE' ? '4px' : '30px';
    const windowBorderRadius = this.customization.shape === 'SQUARE' ? '8px' : '20px';

    const style = document.createElement('style');
    style.textContent = `
      @import url('https://fonts.googleapis.com/css2?family=Outfit:wght@300;400;500;600;700&display=swap');

      .launcher {
        width: 60px;
        height: 60px;
        border-radius: ${borderRadius};
        background: ${this.customization.gradient || `linear-gradient(135deg, ${primaryColor} 0%, ${primaryColor}dd 100%)`};
        box-shadow: 0 4px 16px rgba(79, 70, 229, 0.3);
        cursor: pointer;
        display: flex;
        align-items: center;
        justify-content: center;
        transition: transform 0.2s cubic-bezier(0.16, 1, 0.3, 1), box-shadow 0.2s;
        border: none;
        outline: none;
      }
      .launcher:hover {
        transform: scale(1.05);
        box-shadow: 0 6px 20px rgba(79, 70, 229, 0.4);
      }
      .launcher:active {
        transform: scale(0.95);
      }
      .launcher svg {
        width: 28px;
        height: 28px;
        fill: none;
        stroke: white;
        stroke-width: 2;
        stroke-linecap: round;
        stroke-linejoin: round;
        transition: transform 0.3s;
      }
      .launcher.open svg {
        transform: rotate(90deg);
      }

      .chat-window {
        position: absolute;
        bottom: 80px;
        ${isLeft ? 'left: 0;' : 'right: 0;'}
        width: 370px;
        height: 520px;
        border-radius: ${windowBorderRadius};
        background: ${this.customization.isDarkMode ? '#0b0f19' : 'white'};
        box-shadow: 0 8px 32px rgba(15, 23, 42, 0.15);
        border: 1px solid ${this.customization.isDarkMode ? 'rgba(255, 255, 255, 0.05)' : 'rgba(241, 245, 249, 0.8)'};
        display: flex;
        flex-direction: column;
        overflow: hidden;
        opacity: 0;
        transform: translateY(20px) scale(0.95);
        pointer-events: none;
        transition: opacity 0.3s cubic-bezier(0.16, 1, 0.3, 1), transform 0.3s cubic-bezier(0.16, 1, 0.3, 1);
      }
      .chat-window.open {
        opacity: 1;
        transform: translateY(0) scale(1);
        pointer-events: auto;
      }

      .header {
        background: ${this.customization.gradient || `linear-gradient(135deg, ${primaryColor} 0%, ${primaryColor}dd 100%)`};
        padding: 20px;
        color: white;
        display: flex;
        align-items: center;
        gap: 12px;
      }
      .header-logo {
        width: 40px;
        height: 40px;
        border-radius: 12px;
        background: rgba(255, 255, 255, 0.2);
        display: flex;
        align-items: center;
        justify-content: center;
        font-weight: bold;
        font-size: 18px;
        border: 1px solid rgba(255, 255, 255, 0.3);
      }
      .header-info h4 {
        margin: 0;
        font-size: 15px;
        font-weight: 600;
        letter-spacing: -0.2px;
      }
      .header-info p {
        margin: 2px 0 0 0;
        font-size: 11px;
        opacity: 0.85;
      }

      .message-list {
        flex: 1;
        padding: 16px;
        overflow-y: auto;
        display: flex;
        flex-direction: column;
        gap: 12px;
        background: ${this.customization.isDarkMode ? '#151b2c' : '#f8fafc'};
      }
      .message {
        max-width: 80%;
        padding: 10px 14px;
        border-radius: 14px;
        font-size: 13.5px;
        line-height: 1.4;
      }
      .message.bot {
        background: ${this.customization.isDarkMode ? '#1e293b' : 'white'};
        color: ${this.customization.isDarkMode ? '#f8fafc' : '#1e293b'};
        align-self: flex-start;
        border-bottom-left-radius: 4px;
        box-shadow: 0 1px 2px rgba(15, 23, 42, 0.05);
      }
      .message.user {
        background: ${primaryColor};
        color: white;
        align-self: flex-end;
        border-bottom-right-radius: 4px;
      }

      .typing-indicator {
        font-size: 11px;
        color: #94a3b8;
        padding: 4px 16px;
        background: ${this.customization.isDarkMode ? '#0b0f19' : 'white'};
        display: none;
      }

      .input-area {
        padding: 14px;
        border-top: 1px solid ${this.customization.isDarkMode ? 'rgba(255, 255, 255, 0.05)' : '#f1f5f9'};
        display: flex;
        gap: 8px;
        background: ${this.customization.isDarkMode ? '#0b0f19' : 'white'};
      }
      .input-area input {
        flex: 1;
        border: 1px solid ${this.customization.isDarkMode ? 'rgba(255, 255, 255, 0.1)' : '#e2e8f0'};
        border-radius: 10px;
        padding: 8px 12px;
        font-size: 13px;
        outline: none;
        transition: border-color 0.2s;
        font-family: inherit;
        background: ${this.customization.isDarkMode ? '#151b2c' : 'white'};
        color: ${this.customization.isDarkMode ? 'white' : 'inherit'};
      }
      .input-area input:focus {
        border-color: ${primaryColor};
      }
      .input-area button {
        background: ${primaryColor};
        color: white;
        border: none;
        border-radius: 10px;
        padding: 8px 14px;
        font-size: 13px;
        font-weight: 500;
        cursor: pointer;
        transition: background 0.2s;
        font-family: inherit;
      }
      .input-area button:hover {
        opacity: 0.9;
      }

      /* Pre-chat & CSAT view styling */
      .form-container {
        flex: 1;
        padding: 24px;
        display: flex;
        flex-direction: column;
        justify-content: center;
        gap: 16px;
        background: ${this.customization.isDarkMode ? '#151b2c' : '#f8fafc'};
      }
      .form-title {
        font-size: 16px;
        font-weight: 600;
        color: ${this.customization.isDarkMode ? '#f8fafc' : '#0f172a'};
        margin: 0 0 4px 0;
      }
      .form-subtitle {
        font-size: 12px;
        color: #94a3b8;
        margin: 0 0 12px 0;
        line-height: 1.4;
      }
      .form-group {
        display: flex;
        flex-direction: column;
        gap: 6px;
      }
      .form-group label {
        font-size: 12px;
        font-weight: 500;
        color: ${this.customization.isDarkMode ? '#cbd5e1' : '#475569'};
      }
      .form-group input, .form-group textarea {
        border: 1px solid ${this.customization.isDarkMode ? 'rgba(255, 255, 255, 0.1)' : '#e2e8f0'};
        border-radius: 10px;
        padding: 10px 12px;
        font-size: 13px;
        font-family: inherit;
        background: ${this.customization.isDarkMode ? '#0b0f19' : 'white'};
        color: ${this.customization.isDarkMode ? 'white' : 'inherit'};
        outline: none;
      }
      .form-group input:focus, .form-group textarea:focus {
        border-color: ${primaryColor};
      }
      .form-submit-btn {
        background: ${primaryColor};
        color: white;
        border: none;
        border-radius: 10px;
        padding: 12px;
        font-size: 13.5px;
        font-weight: 600;
        cursor: pointer;
        transition: opacity 0.2s;
        margin-top: 8px;
        font-family: inherit;
      }
      .form-submit-btn:hover {
        opacity: 0.9;
      }

      .star-rating {
        display: flex;
        justify-content: center;
        gap: 10px;
        margin: 10px 0;
      }
      .star-btn {
        background: none;
        border: none;
        font-size: 28px;
        cursor: pointer;
        color: #cbd5e1;
        transition: transform 0.15s, color 0.15s;
        padding: 0;
      }
      .star-btn.active, .star-btn:hover {
        color: #f59e0b;
        transform: scale(1.2);
      }

      ${this.customization.customCss || ''}
    `;
    this.shadow.appendChild(style);
  }

  private toggleChat(forceState?: boolean) {
    this.isOpen = forceState !== undefined ? forceState : !this.isOpen;
    const launcher = this.shadow.querySelector('.launcher') as HTMLButtonElement;
    const chatWindow = this.shadow.querySelector('.chat-window') as HTMLDivElement;

    if (this.isOpen) {
      launcher.classList.add('open');
      launcher.innerHTML = `
        <svg viewBox="0 0 24 24">
          <line x1="18" y1="6" x2="6" y2="18"></line>
          <line x1="6" y1="6" x2="18" y2="18"></line>
        </svg>
      `;
    } else {
      launcher.classList.remove('open');
      chatWindow.classList.remove('open');
      const emojiIcon = this.customization?.logoUrl;
      if (emojiIcon && emojiIcon.length <= 4) {
        launcher.innerHTML = `<span style="font-size: 26px; line-height: 1; display: flex; align-items: center; justify-content: center;">${emojiIcon}</span>`;
      } else {
        launcher.innerHTML = `
          <svg viewBox="0 0 24 24">
            <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"></path>
          </svg>
        `;
      }
    }
  }

  private showCsatScreen() {
    const chatWindow = this.shadow.querySelector('.chat-window') as HTMLDivElement;
    if (!chatWindow) return;

    let selectedRating = 5;

    chatWindow.innerHTML = `
      <div class="header">
        <div class="header-logo">I</div>
        <div class="header-info">
          <h4>Chat Ended</h4>
          <p>Rate your experience</p>
        </div>
      </div>
      <div class="form-container" id="csat-view">
        <h3 class="form-title">How did we do?</h3>
        <p class="form-subtitle">Please rate your conversation with our support team.</p>

        <div class="star-rating" id="star-rating">
          <button class="star-btn active" data-star="1">★</button>
          <button class="star-btn active" data-star="2">★</button>
          <button class="star-btn active" data-star="3">★</button>
          <button class="star-btn active" data-star="4">★</button>
          <button class="star-btn active" data-star="5">★</button>
        </div>

        <div class="form-group">
          <label>Additional Feedback (Optional)</label>
          <textarea id="csat-feedback" rows="3" placeholder="Tell us how we can improve..."></textarea>
        </div>

        <button class="form-submit-btn" id="csat-submit">Submit Rating</button>
      </div>
    `;

    const starBtns = chatWindow.querySelectorAll('.star-btn');
    starBtns.forEach((btn) => {
      btn.addEventListener('click', (e) => {
        const star = parseInt((e.target as HTMLElement).getAttribute('data-star') || '5', 10);
        selectedRating = star;
        starBtns.forEach((sBtn, idx) => {
          if (idx < star) {
            sBtn.classList.add('active');
          } else {
            sBtn.classList.remove('active');
          }
        });
      });
    });

    const submitBtn = chatWindow.querySelector('#csat-submit') as HTMLButtonElement;
    submitBtn.addEventListener('click', () => {
      const feedback = (chatWindow.querySelector('#csat-feedback') as HTMLTextAreaElement).value.trim();

      if (this.socket && this.roomId) {
        this.socket.emit('submitCsat', {
          roomId: this.roomId,
          rating: selectedRating,
          feedback: feedback
        });
      }

      const csatView = chatWindow.querySelector('#csat-view') as HTMLDivElement;
      csatView.innerHTML = `
        <div style="text-align: center;">
          <h3 class="form-title" style="font-size: 20px; color: #10b981;">✓ Thank You!</h3>
          <p class="form-subtitle">Your feedback has been submitted successfully.</p>
        </div>
      `;
    });
  }

  private render() {
    const launcher = document.createElement('button');
    launcher.className = 'launcher';
    launcher.innerHTML = `
      <svg viewBox="0 0 24 24">
        <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"></path>
      </svg>
    `;

    const chatWindow = document.createElement('div');
    chatWindow.className = 'chat-window';

    if (!this.preChatSubmitted) {
      chatWindow.innerHTML = `
        <div class="header">
          <div class="header-logo">I</div>
          <div class="header-info">
            <h4>Welcome to Indiquer</h4>
            <p>Start a conversation with us</p>
          </div>
        </div>
        <form class="form-container" id="indiquer-prechat-form">
          <h3 class="form-title">Introduce Yourself</h3>
          <p class="form-subtitle">Please share your contact details to connect with an agent.</p>

          <div class="form-group">
            <label for="prechat-name">Your Name</label>
            <input type="text" id="prechat-name" required placeholder="John Doe" value="${this.visitorName}" />
          </div>

          <div class="form-group">
            <label for="prechat-email">Your Email</label>
            <input type="email" id="prechat-email" required placeholder="john@example.com" value="${this.visitorEmail}" />
          </div>

          <button type="submit" class="form-submit-btn">Start Chat</button>
        </form>
      `;
    } else {
      chatWindow.innerHTML = `
        <div class="header">
          <div class="header-logo">I</div>
          <div class="header-info">
            <h4>Indiquer Chatbot</h4>
            <p>AI Customer Assistant</p>
          </div>
        </div>
        <div class="message-list" id="indiquer-msg-list">
          <div class="message bot">
            ${this.customization.welcomeMessage || 'Hello! How can we help you today?'}
          </div>
        </div>
        <div class="typing-indicator" id="indiquer-typing-indicator">Agent is typing...</div>
        <form class="input-area" id="indiquer-input-form">
          <input type="text" placeholder="Type your message..." required id="indiquer-input-field" />
          <button type="submit">Send</button>
        </form>
      `;
    }

    launcher.addEventListener('click', () => this.toggleChat());

    this.shadow.appendChild(chatWindow);
    this.shadow.appendChild(launcher);

    this.attachFormEvents();
  }

  private attachFormEvents() {
    const prechatForm = this.shadow.querySelector('#indiquer-prechat-form') as HTMLFormElement;
    if (prechatForm) {
      prechatForm.addEventListener('submit', (e) => {
        e.preventDefault();
        const nameInput = this.shadow.querySelector('#prechat-name') as HTMLInputElement;
        const emailInput = this.shadow.querySelector('#prechat-email') as HTMLInputElement;

        this.visitorName = nameInput.value.trim();
        this.visitorEmail = emailInput.value.trim();
        this.preChatSubmitted = true;

        try {
          sessionStorage.setItem('indiquer_prechat', JSON.stringify({
            name: this.visitorName,
            email: this.visitorEmail
          }));
        } catch (err) {}

        // Re-render chat UI
        const chatWindow = this.shadow.querySelector('.chat-window') as HTMLDivElement;
        chatWindow.innerHTML = `
          <div class="header">
            <div class="header-logo" style="display:flex;align-items:center;justify-content:center;font-size:20px;">${this.customization.logoUrl && this.customization.logoUrl.length <= 4 ? this.customization.logoUrl : 'I'}</div>
            <div class="header-info">
              <h4>${this.customization.name || 'Indiquer Assistant'}</h4>
              <p>AI Customer Assistant</p>
            </div>
          </div>
          <div class="message-list" id="indiquer-msg-list">
            <div class="message bot">
              ${this.customization.welcomeMessage || 'Hello! How can we help you today?'}
            </div>
          </div>
          <div class="typing-indicator" id="indiquer-typing-indicator">Agent is typing...</div>
          <form class="input-area" id="indiquer-input-form">
            <input type="text" placeholder="Type your message..." required id="indiquer-input-field" />
            <button type="submit">Send</button>
          </form>
        `;

        this.attachFormEvents();
        this.loadMessageHistory();

        // Inform backend of visitor details via message
        if (this.socket && this.roomId) {
          this.socket.emit('sendMessage', {
            roomId: this.roomId,
            senderType: 'VISITOR',
            senderId: this.visitorId,
            content: `[System Info] Visitor introduced as ${this.visitorName} (${this.visitorEmail})`
          });
        }
      });
      return;
    }

    const form = this.shadow.querySelector('#indiquer-input-form') as HTMLFormElement;
    const input = this.shadow.querySelector('#indiquer-input-field') as HTMLInputElement;

    if (form && input) {
      form.addEventListener('submit', (e) => {
        e.preventDefault();
        const text = input.value.trim();
        if (!text) return;

        // Render message bubble immediately in chat UI
        const tempMsg = {
          id: 'temp-' + Date.now(),
          senderType: 'VISITOR',
          content: text
        };
        this.appendMsgBubble(tempMsg);
        input.value = '';

        if (this.socket) {
          if (this.roomId) {
            this.socket.emit('sendMessage', {
              roomId: this.roomId,
              senderType: 'VISITOR',
              senderId: this.visitorId,
              content: text
            });
          } else {
            this.socket.emit('visitorInit', {
              workspaceId: this.workspaceId || this.visitorId,
              visitorId: this.visitorId
            });
            this.socket.once('visitorInitSuccess', (data: any) => {
              this.roomId = data?.room?.id;
              if (this.roomId) {
                this.socket.emit('sendMessage', {
                  roomId: this.roomId,
                  senderType: 'VISITOR',
                  senderId: this.visitorId,
                  content: text
                });
              }
            });
          }
        }
      });
    }
  }
}

const Indiquer = new IndiquerWidget();
(window as any).Indiquer = Indiquer;

export default Indiquer;
export { IndiquerConfig, Customization };
