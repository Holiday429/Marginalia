/* ==========================================================================
   Marginalia · AI Settings panel
   --------------------------------------------------------------------------
   Injects a floating settings button (gear icon) visible on book detail pages.
   Opens a modal where the user can enter/remove their DeepSeek API key.
   Key is stored in localStorage only.
   ========================================================================== */

(function initAISettings() {

  function mount() {
    if (document.getElementById('aiSettingsBtn')) return;

    // Floating gear button
    const btn = document.createElement('button');
    btn.id = 'aiSettingsBtn';
    btn.className = 'ai-settings-trigger';
    btn.setAttribute('aria-label', 'AI settings');
    btn.innerHTML = `<svg viewBox="0 0 16 16" width="16" height="16" fill="none" stroke="currentColor" stroke-width="1.4">
      <circle cx="8" cy="8" r="2.8"/>
      <path d="M8 1v1.5M8 13.5V15M1 8h1.5M13.5 8H15M3.05 3.05l1.06 1.06M11.89 11.89l1.06 1.06M3.05 12.95l1.06-1.06M11.89 4.11l1.06-1.06"/>
    </svg>`;
    btn.addEventListener('click', openModal);
    document.body.appendChild(btn);

    // Modal
    const modal = document.createElement('div');
    modal.id = 'aiSettingsModal';
    modal.className = 'ai-settings-modal';
    modal.setAttribute('aria-modal', 'true');
    modal.setAttribute('role', 'dialog');
    modal.innerHTML = `
      <div class="ai-settings-shell">
        <div class="ai-settings-head">
          <span class="ai-settings-title">AI Settings</span>
          <button class="ai-settings-close" id="aiSettingsClose" aria-label="Close">×</button>
        </div>
        <div class="ai-settings-body">
          <label class="ai-settings-label">
            DeepSeek API Key
            <div class="ai-key-row">
              <input
                type="password"
                id="aiKeyInput"
                class="ai-settings-input"
                placeholder="sk-…"
                autocomplete="off"
                spellcheck="false"
              >
              <button class="ai-key-toggle" id="aiKeyToggle" type="button">Show</button>
            </div>
          </label>
          <div class="ai-key-status" id="aiKeyStatus"></div>

          <label class="ai-settings-label" style="margin-top:16px">
            Model
            <select class="ai-settings-select" id="aiModelSelect">
              <option value="deepseek-chat">deepseek-chat (recommended)</option>
              <option value="deepseek-reasoner">deepseek-reasoner</option>
            </select>
          </label>

          <div class="ai-settings-actions">
            <button class="ai-settings-save" id="aiKeySave">Save key</button>
            <button class="ai-settings-remove" id="aiKeyRemove">Remove key</button>
          </div>

          <p class="ai-settings-note">
            Your key is stored in this browser only. It is sent directly to DeepSeek — never to Marginalia servers.
            Get a key at <span class="ai-settings-link">platform.deepseek.com</span>.
          </p>
        </div>
      </div>
    `;
    document.body.appendChild(modal);

    // Close
    document.getElementById('aiSettingsClose').addEventListener('click', closeModal);
    modal.addEventListener('click', e => { if (e.target === modal) closeModal(); });

    // Show/hide key
    const keyInput = document.getElementById('aiKeyInput');
    document.getElementById('aiKeyToggle').addEventListener('click', () => {
      const isPassword = keyInput.type === 'password';
      keyInput.type = isPassword ? 'text' : 'password';
      document.getElementById('aiKeyToggle').textContent = isPassword ? 'Hide' : 'Show';
    });

    // Save
    document.getElementById('aiKeySave').addEventListener('click', () => {
      const val = keyInput.value.trim();
      if (!val) return;
      window.MarginaliaAI.setKey(val);
      keyInput.value = '';
      keyInput.type = 'password';
      document.getElementById('aiKeyToggle').textContent = 'Show';
      showStatus('Key saved.');
    });

    // Remove
    document.getElementById('aiKeyRemove').addEventListener('click', () => {
      window.MarginaliaAI.clearKey();
      showStatus('Key removed.');
    });

    // Model
    const modelSelect = document.getElementById('aiModelSelect');
    modelSelect.value = window.MarginaliaAI.getModel();
    modelSelect.addEventListener('change', () => {
      window.MarginaliaAI.setModel(modelSelect.value);
    });
  }

  function showStatus(msg) {
    const el = document.getElementById('aiKeyStatus');
    if (!el) return;
    el.textContent = msg;
    setTimeout(() => { el.textContent = ''; }, 3000);
  }

  function openModal() {
    const modal = document.getElementById('aiSettingsModal');
    if (!modal) return;
    modal.classList.add('open');
    const hasKey = window.MarginaliaAI.hasKey();
    showStatus(hasKey ? 'A key is currently saved.' : 'No key saved yet.');
    document.getElementById('aiModelSelect').value = window.MarginaliaAI.getModel();
  }

  function closeModal() {
    document.getElementById('aiSettingsModal')?.classList.remove('open');
  }

  // Mount when book view is active
  window.addEventListener('marginalia:ui-refresh', () => {
    if (document.body.dataset.view === 'book') mount();
  });

  // Also mount on DOMContentLoaded in case we land directly on book view
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => {
      if (document.body.dataset.view === 'book') mount();
    });
  } else {
    if (document.body.dataset.view === 'book') mount();
  }

})();
