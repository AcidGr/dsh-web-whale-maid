window.__ModuleLoader__.load({
  id: "dsh-desktop-pet",
  factory: (require) => {
    var module = { exports: {} };
    var exports = module.exports;

    const React = require('react');

    async function petCall(method, args) {
      if (typeof host !== 'undefined' && host && typeof host.call === 'function') {
        return host.call(method, args);
      }
      const endpointMap = {
        'pet:get-assets': '/api/pet/assets',
        'pet:list-models': '/api/pet/models',
        'pet:load-durable-data': '/api/pet/data',
        'pet:save-durable-data': '/api/pet/data',
        'pet:speak': '/api/pet/speak',
      };
      const url = endpointMap[method] || `/api/pet/${method.replace('pet:', '')}`;
      const isPost = method === 'pet:save-durable-data' || method === 'pet:speak';
      const res = await fetch(url, {
        method: isPost ? 'POST' : 'GET',
        headers: isPost ? { 'Content-Type': 'application/json' } : {},
        body: isPost ? JSON.stringify(args) : undefined,
      });
      return res.json();
    }

    const pluginDef = (function() {
      return {
  name: 'desktop-pet-client',
  inject: ['slots'],
  apply(ctx) {
    const h = React.createElement;

    function getSatietyInfo(satiety, maxSatiety) {
      const cap = maxSatiety || 30000;
      const s = Math.max(0, typeof satiety === 'number' ? satiety : 0);
      let desc = '';
      if (s > 20000) {
        desc = '吃得有点撑了！';
      } else if (s >= 10000) {
        desc = '饱腹满足';
      } else if (s >= 5000) {
        desc = '不饿，但是不介意吃多点！';
      } else if (s >= 2000) {
        desc = '很饿！';
      } else {
        desc = '快要饿死了！';
      }
      const pct = Math.min(100, Math.round((s / cap) * 100));
      return { satiety: s, pct, desc };
    }

    const DEFAULT_MODEL = {
      provider: 'cliproxyapi',
      model: 'gemini-3.8-flash-high',
      name: 'gemini-3.8-flash-high',
      providerName: '谷歌大善人'
    };

    // 1. Store
    const store = {
      satiety: parseInt(localStorage.getItem('dsh_pet_satiety') || '5000', 10),
      maxSatiety: 30000,
      selectedModel: DEFAULT_MODEL,
      models: [DEFAULT_MODEL],
      memories: [],
      currentMood: 'idle',
      speechText: '',
      speechVisible: false,
      assets: null,
      cabinetOpen: false,
      isFeeding: false,
      position: { x: Math.max(20, window.innerWidth - 170), y: Math.max(20, window.innerHeight - 190) },
      subscribers: new Set(),
      recentTasksProvider: () => [],

      init() {
        try {
          const savedModel = localStorage.getItem('dsh_pet_model');
          if (savedModel) {
            const parsed = JSON.parse(savedModel);
            if (parsed && parsed.provider && parsed.model) this.selectedModel = parsed;
          }
          const savedMem = localStorage.getItem('dsh_pet_memories');
          if (savedMem) {
            this.memories = JSON.parse(savedMem).slice(0, 20);
          }
          const savedPos = localStorage.getItem('dsh_pet_pos');
          if (savedPos) {
            const parsed = JSON.parse(savedPos);
            if (parsed.x && parsed.y) this.position = parsed;
          }
        } catch (e) {
          console.error('store init error', e);
        }

        // Restore from durable disk storage
        petCall('pet:load-durable-data').then(data => {
          if (data && typeof data === 'object') {
            if (Array.isArray(data.memories) && data.memories.length > 0) {
              this.memories = data.memories.slice(0, 20);
              localStorage.setItem('dsh_pet_memories', JSON.stringify(this.memories));
            }
            if (typeof data.satiety === 'number') {
              this.satiety = data.satiety;
              localStorage.setItem('dsh_pet_satiety', String(this.satiety));
            }
            if (data.selectedModel && data.selectedModel.provider) {
              this.selectedModel = data.selectedModel;
              localStorage.setItem('dsh_pet_model', JSON.stringify(this.selectedModel));
            }
            this.notify();
          }
        }).catch(() => {});
      },

      subscribe(fn) {
        this.subscribers.add(fn);
        return () => this.subscribers.delete(fn);
      },

      notify() {
        this.subscribers.forEach(fn => {
          try { fn(); } catch (e) { console.error(e); }
        });
      },

      syncToDisk() {
        petCall('pet:save-durable-data', {
          satiety: this.satiety,
          selectedModel: this.selectedModel,
          memories: this.memories.slice(0, 20),
        }).catch(() => {});
      },

      setSelectedModel(model) {
        this.selectedModel = model;
        localStorage.setItem('dsh_pet_model', JSON.stringify(model));
        this.syncToDisk();
        this.notify();
      },

      setCabinetOpen(open) {
        this.cabinetOpen = open;
        this.notify();
      },

      setMood(mood) {
        this.currentMood = mood;
        this.notify();
      },

      // FEED: ONLY LLM changes mood (to thinking now, then to LLM mood result). NO tasting speech bubble!
      feed(tokens, foodName) {
        if (this.isFeeding) {
          return;
        }
        this.isFeeding = true;

        this.satiety = Math.min(this.maxSatiety, this.satiety + tokens);
        localStorage.setItem('dsh_pet_satiety', String(this.satiety));
        this.syncToDisk();

        // Switch to thinking mood when LLM call begins, speech bubble is hidden during thinking
        this.currentMood = 'thinking';
        this.speechVisible = false;
        this.notify();

        const activeModel = this.selectedModel || DEFAULT_MODEL;
        const recentTasks = this.recentTasksProvider();

        petCall('pet:speak', {
          provider: activeModel.provider,
          model: activeModel.model,
          eventType: 'feed',
          foodName: foodName,
          tokensGained: tokens,
          satiety: this.satiety,
          maxSatiety: this.maxSatiety,
          sessionTitle: '投喂' + foodName,
          memories: this.memories.slice(0, 5),
          recentTasks: recentTasks.slice(0, 8)
        }).then(res => {
          if (res && res.speech) {
            try {
              this.consume(res.tokensUsed || 50);
              this.recordMemory({
                sessionTitle: '投喂' + foodName,
                mood: res.mood,
                speech: res.speech,
                tokensUsed: res.tokensUsed || 50,
              });
            } catch (e) {
              console.error('consume/record error', e);
            }
            // Result arrives -> switch to LLM mood & speech, and PERMANENTLY KEEP IT!
            this.speak(res.speech, res.mood, res.tokensUsed || 50);
          }
        }).catch(err => {
          console.error('feed speak error', err);
          this.speak('好饱！吃下了' + foodName + '，多谢主人投喂。', 'eating', 0);
        }).finally(() => {
          this.isFeeding = false;
          this.notify();
        });
      },

      // Satiety deduction does NOT alter pet mood! ONLY LLM calls alter mood!
      consume(tokens) {
        this.satiety = Math.max(0, this.satiety - tokens);
        localStorage.setItem('dsh_pet_satiety', String(this.satiety));
        this.syncToDisk();
        this.notify();
      },

      recordMemory(item) {
        this.memories.unshift({
          id: Date.now().toString(36) + Math.random().toString(36).slice(2, 6),
          time: new Date().toLocaleTimeString(),
          sessionTitle: item.sessionTitle || '日常会话',
          mood: item.mood || 'happy',
          speech: item.speech || '',
          tokensUsed: item.tokensUsed || 0,
        });
        if (this.memories.length > 20) {
          this.memories = this.memories.slice(0, 20);
        }
        localStorage.setItem('dsh_pet_memories', JSON.stringify(this.memories));
        this.syncToDisk();
        this.notify();
      },

      clearMemories() {
        this.memories = [];
        localStorage.setItem('dsh_pet_memories', '[]');
        this.syncToDisk();
        this.notify();
      },

      // Speech & Mood: Persist continuously until the NEXT LLM invocation! Never auto-disappear!
      speak(text, mood, tokens) {
        this.speechText = text;
        if (mood) this.currentMood = mood;
        this.speechVisible = true;
        this.notify();
      },

      dismissSpeech() {
        this.speechVisible = false;
        this.speechText = '';
        this.currentMood = 'idle';
        this.notify();
      },

      savePosition(x, y) {
        this.position = { x, y };
        localStorage.setItem('dsh_pet_pos', JSON.stringify({ x, y }));
        this.notify();
      }
    };

    store.init();

    // 2. Fetch Assets & Models on startup
    petCall('pet:get-assets').then(res => {
      if (res && res.pet_sprite) {
        store.assets = res;
        injectDynamicStyles(res);
        store.notify();
      }
    }).catch(err => console.error('get-assets failed', err));

    petCall('pet:list-models').then(res => {
      if (res && res.models && res.models.length > 0) {
        store.models = res.models;
        if (!store.selectedModel || !res.models.some(m => m.provider === store.selectedModel.provider && m.model === store.selectedModel.model)) {
          store.setSelectedModel(res.models[0]);
        } else {
          store.notify();
        }
      }
    }).catch(err => console.error('list-models failed', err));

    // 3. Inject CSS Styles (Pixel-perfect cupboard alignment, 8 Moods, No Emojis)
    function injectDynamicStyles(assets) {
      const cssContent = `
        .dsh-pet-sprite {
          width: 128px;
          height: 128px;
          background-image: url("${assets.pet_sprite}");
          background-repeat: no-repeat;
          background-size: 512px 1024px;
          animation: dsh-pet-walk 0.75s steps(4) infinite;
          image-rendering: -webkit-optimize-contrast;
          image-rendering: pixelated;
          user-select: none;
          -webkit-user-drag: none;
        }
        @keyframes dsh-pet-walk {
          0% { background-position-x: 0px; }
          100% { background-position-x: -512px; }
        }
        .dsh-pet-mood-idle { background-position-y: 0px !important; }
        .dsh-pet-mood-hungry { background-position-y: -128px !important; }
        .dsh-pet-mood-happy { background-position-y: -256px !important; }
        .dsh-pet-mood-angry { background-position-y: -384px !important; }
        .dsh-pet-mood-eating { background-position-y: -512px !important; }
        .dsh-pet-mood-scared { background-position-y: -640px !important; }
        .dsh-pet-mood-sad { background-position-y: -768px !important; }
        .dsh-pet-mood-thinking { background-position-y: -896px !important; }

        .dsh-pet-overlay-wrap {
          position: fixed;
          inset: 0;
          pointer-events: none;
          z-index: 9999;
          overflow: hidden;
        }
        .dsh-pet-body {
          position: absolute;
          display: flex;
          flex-direction: column;
          align-items: center;
          pointer-events: auto;
          cursor: grab;
          user-select: none;
          touch-action: none;
          transition: filter 0.2s ease;
        }
        .dsh-pet-body:hover {
          filter: drop-shadow(0 4px 12px rgba(59, 130, 246, 0.5));
        }
        .dsh-pet-body:active {
          cursor: grabbing;
        }
        .dsh-pet-bubble {
          position: absolute;
          bottom: 124px;
          background: #ffffff;
          color: #1e293b;
          border: 2px solid #3b82f6;
          border-radius: 12px;
          padding: 8px 12px;
          font-size: 13px;
          line-height: 1.45;
          min-width: 130px;
          max-width: 230px;
          box-shadow: 0 4px 16px rgba(0, 0, 0, 0.2);
          pointer-events: auto;
          cursor: pointer;
          -webkit-tap-highlight-color: transparent;
          touch-action: manipulation;
          animation: dsh-bubble-in 0.25s cubic-bezier(0.16, 1, 0.3, 1);
          font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
          font-weight: 500;
          transition: transform 0.12s ease, box-shadow 0.12s ease;
        }
        .dsh-pet-bubble:hover {
          transform: translateY(-2px);
          box-shadow: 0 6px 20px rgba(59, 130, 246, 0.35);
        }
        .dsh-pet-bubble:active {
          transform: translateY(0);
        }
        .dsh-pet-bubble::after {
          content: '';
          position: absolute;
          bottom: -7px;
          left: 50%;
          transform: translateX(-50%);
          border-left: 6px solid transparent;
          border-right: 6px solid transparent;
          border-top: 7px solid #3b82f6;
        }
        @keyframes dsh-bubble-in {
          0% { opacity: 0; transform: scale(0.8) translateY(8px); }
          100% { opacity: 1; transform: scale(1) translateY(0); }
        }

        /* Cupboard Modal Overlay Backdrop */
        .dsh-cabinet-backdrop {
          position: fixed;
          inset: 0;
          background: rgba(15, 23, 42, 0.68);
          backdrop-filter: blur(4px);
          display: flex;
          align-items: center;
          justify-content: center;
          pointer-events: auto;
          z-index: 10000;
          animation: dsh-fade-in 0.2s ease-out;
          overflow: hidden;
          padding: 12px;
          box-sizing: border-box;
          touch-action: none;
        }
        @keyframes dsh-fade-in {
          from { opacity: 0; }
          to { opacity: 1; }
        }

        /* Cabinet Responsive Scaler Wrapper */
        .dsh-cabinet-wrapper {
          position: relative;
          flex-shrink: 0;
          animation: dsh-pop-in 0.25s cubic-bezier(0.16, 1, 0.3, 1);
        }
        @keyframes dsh-pop-in {
          from { transform: scale(0.92); opacity: 0; }
          to { transform: scale(1); opacity: 1; }
        }

        /* Cupboard Main Box: 640px x 580px, strictly clipped */
        .dsh-cabinet-box {
          position: absolute;
          top: 0;
          left: 0;
          width: 640px;
          height: 580px;
          background-image: url("${assets['cupboard_bg']}");
          background-size: 100% 100%;
          background-repeat: no-repeat;
          box-shadow: 0 24px 60px rgba(0, 0, 0, 0.65);
          border-radius: 20px;
          box-sizing: border-box;
          overflow: hidden;
          color: #3e2415;
          font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
        }

        /* Header: y: 24px to 66px */
        .dsh-cabinet-header {
          position: absolute;
          top: 24px;
          left: 32px;
          right: 32px;
          height: 42px;
          display: flex;
          justify-content: space-between;
          align-items: center;
          z-index: 2;
        }
        .dsh-cabinet-title {
          font-size: 17px;
          font-weight: 700;
          color: #fef8f0;
          letter-spacing: 0.06em;
          text-shadow: 0 1px 4px rgba(0, 0, 0, 0.6);
        }
        .dsh-cabinet-close {
          background: #462512;
          color: #fef8f0;
          border: 1px solid #8e542c;
          border-radius: 6px;
          padding: 4px 14px;
          font-size: 12px;
          font-weight: 600;
          cursor: pointer;
          transition: background 0.15s, border-color 0.15s;
          box-shadow: 0 2px 5px rgba(0,0,0,0.3);
          -webkit-tap-highlight-color: transparent;
          touch-action: manipulation;
        }
        .dsh-cabinet-close:hover {
          background: #68381b;
          border-color: #bd733e;
        }

        /* Top Shelf (Satiety): y: 86px to 186px */
        .dsh-shelf-satiety {
          position: absolute;
          top: 86px;
          left: 36px;
          right: 36px;
          height: 100px;
          display: flex;
          flex-direction: column;
          justify-content: space-between;
          padding: 2px 8px;
          box-sizing: border-box;
          z-index: 2;
        }
        .dsh-satiety-row {
          display: flex;
          justify-content: space-between;
          align-items: center;
          font-size: 13px;
          font-weight: 700;
          color: #4a2812;
        }
        .dsh-bar-outer {
          width: 100%;
          height: 18px;
          background: #e2ceba;
          border: 2px solid #86522c;
          border-radius: 9px;
          overflow: hidden;
          box-shadow: inset 0 2px 4px rgba(0, 0, 0, 0.18);
        }
        .dsh-bar-inner {
          height: 100%;
          border-radius: 6px;
          transition: width 0.3s ease;
        }
        .dsh-satiety-desc {
          font-size: 12px;
          color: #643b1c;
          font-weight: 600;
          display: flex;
          justify-content: space-between;
          align-items: center;
        }

        /* Middle Shelf (Foods): y: 206px to 366px, standing firmly on Shelf 2 */
        .dsh-shelf-foods {
          position: absolute;
          top: 206px;
          left: 36px;
          right: 36px;
          height: 160px;
          display: flex;
          align-items: flex-end;
          justify-content: space-around;
          padding-bottom: 2px;
          box-sizing: border-box;
          z-index: 2;
        }
        .dsh-food-item {
          width: 120px;
          height: 148px;
          display: flex;
          flex-direction: column;
          align-items: center;
          justify-content: center;
          background: rgba(255, 255, 255, 0.9);
          border: 1.5px solid #bd885b;
          border-radius: 12px;
          padding: 6px 8px;
          box-sizing: border-box;
          box-shadow: 0 4px 10px rgba(90, 50, 20, 0.18);
          cursor: pointer;
          transition: transform 0.15s ease, box-shadow 0.15s ease, background 0.15s ease;
          user-select: none;
          -webkit-tap-highlight-color: transparent;
          touch-action: manipulation;
        }
        .dsh-food-item:hover {
          transform: translateY(-6px);
          background: #ffffff;
          box-shadow: 0 10px 20px rgba(90, 50, 20, 0.28);
          border-color: #8c522b;
        }
        .dsh-food-item:active {
          transform: translateY(-2px);
        }
        .dsh-food-item.dsh-food-loading {
          opacity: 0.6;
          cursor: wait;
          pointer-events: none;
        }
        .dsh-food-icon {
          width: 62px;
          height: 62px;
          object-fit: contain;
          margin-bottom: 4px;
        }
        .dsh-food-name {
          font-size: 13px;
          font-weight: 700;
          color: #3b2010;
          margin-bottom: 2px;
        }
        .dsh-food-tokens {
          font-size: 11px;
          font-weight: 700;
          color: #1d4ed8;
        }

        /* Bottom Section (Model & Drawer): y: 404px to 532px - strictly no overlap with beam or bottom border! */
        .dsh-shelf-drawer {
          position: absolute;
          top: 404px;
          left: 36px;
          right: 36px;
          height: 128px;
          display: grid;
          grid-template-columns: 240px minmax(0, 1fr);
          gap: 18px;
          box-sizing: border-box;
          z-index: 2;
        }
        .dsh-drawer-col {
          min-width: 0;
          display: flex;
          flex-direction: column;
          overflow: hidden;
        }
        .dsh-drawer-label {
          font-size: 12px;
          font-weight: 700;
          color: #4a2812;
          margin-bottom: 5px;
          line-height: 1.2;
        }
        .dsh-model-select {
          width: 100%;
          box-sizing: border-box;
          padding: 6px 10px;
          border-radius: 6px;
          background: #ffffff;
          border: 1.5px solid #8a532e;
          font-size: 12px;
          font-weight: 600;
          color: #1e293b;
          outline: none;
          cursor: pointer;
        }

        /* Ledger: Compact, strictly bounded, height 96px, touch scroll */
        .dsh-mem-list {
          flex: 1;
          height: 96px;
          max-height: 96px;
          overflow-y: auto;
          overflow-x: hidden;
          background: rgba(255, 255, 255, 0.92);
          border: 1.5px solid #b68054;
          border-radius: 8px;
          padding: 3px 8px;
          box-sizing: border-box;
          min-width: 0;
          -webkit-overflow-scrolling: touch;
          touch-action: pan-y;
        }
        .dsh-mem-list::-webkit-scrollbar {
          width: 4px;
        }
        .dsh-mem-list::-webkit-scrollbar-thumb {
          background: #bd885b;
          border-radius: 2px;
        }
        .dsh-mem-row {
          display: flex;
          justify-content: space-between;
          align-items: center;
          padding: 2.5px 0;
          border-bottom: 1px dashed #dec7b4;
          font-size: 11px;
          min-width: 0;
        }
        .dsh-mem-row:last-child {
          border-bottom: none;
        }
        .dsh-mem-text {
          flex: 1;
          min-width: 0;
          overflow: hidden;
          text-overflow: ellipsis;
          white-space: nowrap;
          color: #3d2314;
        }
        .dsh-mem-tag {
          display: inline-block;
          font-weight: 700;
          color: #78350f;
          margin-right: 4px;
        }
        .dsh-mem-tokens {
          margin-left: 6px;
          color: #2563eb;
          font-weight: 700;
          font-size: 10px;
          flex-shrink: 0;
        }
      `;
      const stylesService = ctx.get('styles') || (typeof styles !== 'undefined' ? styles : null);
      if (stylesService && typeof stylesService.insert === 'function') {
        stylesService.insert(cssContent);
      } else if (typeof document !== 'undefined') {
        let tag = document.querySelector('style[data-plugin="dsh-desktop-pet"]');
        if (!tag) {
          tag = document.createElement('style');
          tag.dataset.plugin = 'dsh-desktop-pet';
          document.head.appendChild(tag);
        }
        tag.textContent = cssContent;
      }
    }

    // 4. Cabinet Modal Component with Responsive Mobile Scaling
    function CabinetModal() {
      const [state, setState] = React.useState({ ...store });
      const [scale, setScale] = React.useState(1);

      React.useEffect(() => {
        return store.subscribe(() => setState({ ...store }));
      }, []);

      // Dynamic responsive scale calculation for mobile screens
      React.useEffect(() => {
        const updateScale = () => {
          const w = window.innerWidth;
          const h = window.innerHeight;
          // Scale down smoothly on mobile screens with comfortable padding
          const maxW = Math.min(640, w * 0.92);
          const maxH = Math.min(580, h * 0.88);
          const sW = maxW / 640;
          const sH = maxH / 580;
          const s = Math.min(1, sW, sH);
          setScale(Number(s.toFixed(3)));
        };
        updateScale();
        window.addEventListener('resize', updateScale);
        return () => window.removeEventListener('resize', updateScale);
      }, []);

      if (!state.cabinetOpen || !state.assets) return null;

      // Food items with updated token values
      const foods = [
        { id: 'grain', name: '一粒米饭', tokens: 1, icon: state.assets.rice_grain },
        { id: 'spoon', name: '一勺米饭', tokens: 1000, icon: state.assets.rice_spoon },
        { id: 'bowl', name: '一碗米饭', tokens: 3000, icon: state.assets.rice_bowl },
        { id: 'pot', name: '一锅米饭', tokens: 10000, icon: state.assets.rice_pot },
      ];

      const satInfo = getSatietyInfo(state.satiety, state.maxSatiety);
      const barColor = state.satiety < 2000 ? '#dc2626' : state.satiety < 5000 ? '#ea580c' : state.satiety > 20000 ? '#3b82f6' : '#16a34a';

      const currentVal = (state.selectedModel && state.selectedModel.provider && state.selectedModel.model)
        ? `${state.selectedModel.provider}:${state.selectedModel.model}`
        : (state.models.length > 0 ? `${state.models[0].provider}:${state.models[0].model}` : `${DEFAULT_MODEL.provider}:${DEFAULT_MODEL.model}`);

      return h('div', {
        className: 'dsh-cabinet-backdrop',
        onClick: (e) => {
          if (e.target === e.currentTarget) store.setCabinetOpen(false);
        }
      },
        h('div', {
          className: 'dsh-cabinet-wrapper',
          style: {
            width: Math.round(640 * scale) + 'px',
            height: Math.round(580 * scale) + 'px',
          }
        },
          h('div', {
            className: 'dsh-cabinet-box',
            style: {
              transform: `scale(${scale})`,
              transformOrigin: 'top left',
            }
          },
            // Header
            h('div', { className: 'dsh-cabinet-header' },
              h('span', { className: 'dsh-cabinet-title' }, '女仆储物橱柜'),
              h('button', {
                type: 'button',
                className: 'dsh-cabinet-close',
                onClick: () => store.setCabinetOpen(false)
              }, '关闭')
            ),

            // Top Shelf: Satiety (y: 86px)
            h('div', { className: 'dsh-shelf-satiety' },
              h('div', { className: 'dsh-satiety-row' },
                h('span', null, '饱腹度储备池 (Token)'),
                h('span', { style: { color: barColor } }, `${state.satiety.toLocaleString()} / ${state.maxSatiety.toLocaleString()} (${satInfo.pct}%)`)
              ),
              h('div', { className: 'dsh-bar-outer' },
                h('div', {
                  className: 'dsh-bar-inner',
                  style: { width: `${satInfo.pct}%`, backgroundColor: barColor }
                })
              ),
              h('div', { className: 'dsh-satiety-desc' },
                h('span', { style: { color: state.satiety < 2000 ? '#dc2626' : state.satiety < 5000 ? '#ea580c' : '#4a2812' } }, `饱腹状态：${satInfo.desc}`),
                h('span', { style: { color: '#784421', fontSize: 11 } }, state.isFeeding ? '思考中，请稍候……' : '点击下方货架米饭直接投喂')
              )
            ),

            // Middle Shelf: Rice Foods List (y: 206px)
            // Immediately closes cabinet modal upon feed click!
            h('div', { className: 'dsh-shelf-foods' },
              foods.map(food =>
                h('div', {
                  key: food.id,
                  className: 'dsh-food-item' + (state.isFeeding ? ' dsh-food-loading' : ''),
                  onClick: () => {
                    if (!state.isFeeding) {
                      store.feed(food.tokens, food.name);
                      store.setCabinetOpen(false);
                    }
                  }
                },
                  h('img', { className: 'dsh-food-icon', src: food.icon, alt: food.name }),
                  h('span', { className: 'dsh-food-name' }, food.name),
                  h('span', { className: 'dsh-food-tokens' }, `+${food.tokens.toLocaleString()} Token`)
                )
              )
            ),

            // Bottom Shelf: Drawer (Model & Memories, y: 404px)
            h('div', { className: 'dsh-shelf-drawer' },
              // Left: Model select
              h('div', { className: 'dsh-drawer-col' },
                h('span', { className: 'dsh-drawer-label' }, '配置投喂模型：'),
                h('select', {
                  className: 'dsh-model-select',
                  value: currentVal,
                  onChange: (e) => {
                    const val = e.target.value;
                    const found = state.models.find(m => `${m.provider}:${m.model}` === val);
                    if (found) {
                      store.setSelectedModel(found);
                    }
                  }
                },
                  state.models.map(m =>
                    h('option', {
                      key: `${m.provider}:${m.model}`,
                      value: `${m.provider}:${m.model}`
                    }, `${m.name} (${m.providerName || m.provider})`)
                  )
                ),
                h('div', { style: { fontSize: 11, color: '#1d4ed8', fontWeight: 600, marginTop: 6 } },
                  '已选定：' + (state.selectedModel ? (state.selectedModel.name + ' (' + (state.selectedModel.providerName || state.selectedModel.provider) + ')') : '未选择')
                )
              ),

              // Right: Memories (Compact, strictly 20 max, strictly bounded inside box)
              h('div', { className: 'dsh-drawer-col' },
                h('div', { style: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 5 } },
                  h('span', { className: 'dsh-drawer-label', style: { marginBottom: 0 } }, `发言手账 (${state.memories.length}/20)：`),
                  h('button', {
                    type: 'button',
                    onClick: () => store.clearMemories(),
                    style: {
                      background: 'none',
                      border: 'none',
                      color: '#991b1b',
                      fontSize: 11,
                      cursor: 'pointer',
                      textDecoration: 'underline',
                      padding: 0
                    }
                  }, '清空')
                ),
                h('div', { className: 'dsh-mem-list' },
                  state.memories.length === 0
                    ? h('div', { style: { padding: '24px 0', textAlign: 'center', opacity: 0.6, fontSize: 12 } }, '暂无发言手账记录')
                    : state.memories.map(mem =>
                        h('div', { key: mem.id, className: 'dsh-mem-row' },
                          h('div', { className: 'dsh-mem-text' },
                            h('span', { className: 'dsh-mem-tag' }, `[${mem.mood}]`),
                            h('span', null, mem.speech)
                          ),
                          h('span', { className: 'dsh-mem-tokens' }, `${mem.tokensUsed}T`)
                        )
                      )
                )
              )
            )
          )
        )
      );
    }

    // 5. Floating Overlay Pet Component
    function PetOverlay(props) {
      const [state, setState] = React.useState({ ...store });
      const dragRef = React.useRef({
        isInteracting: false,
        hasMoved: false,
        startTime: 0,
        startX: 0,
        startY: 0,
        originX: 0,
        originY: 0
      });
      const prevRunningRef = React.useRef(null);

      React.useEffect(() => {
        return store.subscribe(() => setState({ ...store }));
      }, []);

      // Work completion tracking & 5-hour task gathering
      const sessionsState = props.useSessions ? props.useSessions(s => ({
        currentId: s.current,
        current: s.current ? s.byId[s.current] : null,
        byId: s.byId || {}
      })) : null;

      React.useEffect(() => {
        store.recentTasksProvider = () => {
          const fiveHoursAgo = Date.now() - 5 * 3600 * 1000;
          const tasks = [];
          if (sessionsState && sessionsState.byId) {
            Object.values(sessionsState.byId).forEach(sess => {
              if (sess && sess.updatedAt && sess.updatedAt >= fiveHoursAgo) {
                const title = sess.displayTitle || sess.title;
                if (title && !tasks.includes(title)) {
                  tasks.push(title);
                }
              }
            });
          }
          return tasks;
        };
      }, [sessionsState]);

      const currentSummary = sessionsState ? sessionsState.current : null;
      const isRunning = currentSummary ? currentSummary.running : false;

      React.useEffect(() => {
        if (!currentSummary) return;
        const prev = prevRunningRef.current;
        prevRunningRef.current = isRunning;

        if (prev === true && isRunning === false) {
          // Do not call LLM if satiety is completely 0, but DO NOT alter pet mood!
          if (store.satiety <= 0) {
            return;
          }

          if (store.isFeeding) return;

          // Switch to thinking mood when LLM call begins! Bubble stays hidden during thinking
          store.setMood('thinking');
          store.speechVisible = false;
          store.notify();

          const activeModel = store.selectedModel || DEFAULT_MODEL;
          const recentTasks = store.recentTasksProvider();
          if (currentSummary.displayTitle && !recentTasks.includes(currentSummary.displayTitle)) {
            recentTasks.unshift(currentSummary.displayTitle);
          }

          petCall('pet:speak', {
            provider: activeModel.provider,
            model: activeModel.model,
            eventType: 'work_done',
            satiety: store.satiety,
            maxSatiety: store.maxSatiety,
            sessionTitle: currentSummary.displayTitle || '代码生成任务',
            memories: store.memories.slice(0, 5),
            recentTasks: recentTasks.slice(0, 8)
          }).then(res => {
            if (res && res.speech) {
              try {
                store.consume(res.tokensUsed || 50);
                store.recordMemory({
                  sessionTitle: currentSummary.displayTitle || '日常会话',
                  eventType: 'work_done',
                  mood: res.mood,
                  speech: res.speech,
                  tokensUsed: res.tokensUsed || 50,
                });
              } catch (e) {
                console.error('work_done memory record error', e);
              }
              // LLM result arrives -> speak and switch mood! Stays permanently!
              store.speak(res.speech, res.mood, res.tokensUsed || 50);
            }
          }).catch(err => {
            console.error('[PetOverlay] speak call error', err);
          });
        }
      }, [isRunning, currentSummary]);

      // Pointer Event Handlers
      const onPointerDown = (e) => {
        dragRef.current = {
          isInteracting: true,
          hasMoved: false,
          startTime: Date.now(),
          startX: e.clientX,
          startY: e.clientY,
          originX: state.position.x,
          originY: state.position.y
        };
        e.currentTarget.setPointerCapture(e.pointerId);
      };

      const onPointerMove = (e) => {
        if (!dragRef.current.isInteracting) return;
        const dx = e.clientX - dragRef.current.startX;
        const dy = e.clientY - dragRef.current.startY;
        if (!dragRef.current.hasMoved && Math.hypot(dx, dy) > 5) {
          dragRef.current.hasMoved = true;
        }
        if (dragRef.current.hasMoved) {
          const newX = Math.max(10, Math.min(window.innerWidth - 140, dragRef.current.originX + dx));
          const newY = Math.max(10, Math.min(window.innerHeight - 150, dragRef.current.originY + dy));
          store.savePosition(newX, newY);
        }
      };

      const onPointerUp = (e) => {
        if (!dragRef.current.isInteracting) return;
        const wasMoved = dragRef.current.hasMoved;
        const duration = Date.now() - dragRef.current.startTime;
        dragRef.current.isInteracting = false;
        try { e.currentTarget.releasePointerCapture(e.pointerId); } catch (err) {}

        if (!wasMoved && duration < 350) {
          store.setCabinetOpen(true);
        }
      };

      return h(React.Fragment, null,
        h(CabinetModal),

        h('div', { className: 'dsh-pet-overlay-wrap' },
          h('div', {
            className: 'dsh-pet-body',
            style: { left: `${state.position.x}px`, top: `${state.position.y}px` },
            onPointerDown,
            onPointerMove,
            onPointerUp
          },
            state.speechVisible && h('div', {
              className: 'dsh-pet-bubble',
              title: '点击关闭气泡并恢复待机',
              onPointerDown: (e) => { e.stopPropagation(); },
              onPointerMove: (e) => { e.stopPropagation(); },
              onPointerUp: (e) => {
                e.stopPropagation();
                store.dismissSpeech();
              },
              onClick: (e) => {
                e.stopPropagation();
                store.dismissSpeech();
              }
            }, state.speechText),
            h('div', { className: 'dsh-pet-sprite dsh-pet-mood-' + state.currentMood })
          )
        )
      );
    }

    // 6. Register ONLY in shell.overlay
    const slots = ctx.get('slots');
    if (slots) {
      slots.inject('shell.overlay', () => slots.register(
        {
          name: 'shell.overlay',
          id: 'desktop-pet-overlay',
          order: 100,
        },
        PetOverlay
      ));
    }
  }
};

    })();

    exports.apply = pluginDef.apply;
    exports.inject = pluginDef.inject;
    return module.exports;
  }
});
