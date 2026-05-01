/* ==========================================================================
   Marginalia · AI Settings
   --------------------------------------------------------------------------
   The gear button is rendered by renderPrimaryHeader() in app.js and appears
   in the nav on every view. This script mounts the modal once and wires
   click events to any #aiSettingsBtn in the DOM.
   Key is stored in localStorage only — never sent to Marginalia servers.
   ========================================================================== */

(function initAISettings() {

  function mountModal() {
    if (document.getElementById('aiSettingsModal')) {
      wireGearBtn();
      return;
    }

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

    document.getElementById('aiSettingsClose').addEventListener('click', closeModal);
    modal.addEventListener('click', e => { if (e.target === modal) closeModal(); });

    const keyInput = document.getElementById('aiKeyInput');
    document.getElementById('aiKeyToggle').addEventListener('click', () => {
      const isPassword = keyInput.type === 'password';
      keyInput.type = isPassword ? 'text' : 'password';
      document.getElementById('aiKeyToggle').textContent = isPassword ? 'Hide' : 'Show';
    });

    document.getElementById('aiKeySave').addEventListener('click', () => {
      const val = keyInput.value.trim();
      if (!val) return;
      window.MarginaliaAI.setKey(val);
      keyInput.value = '';
      keyInput.type = 'password';
      document.getElementById('aiKeyToggle').textContent = 'Show';
      showStatus('Key saved.');
    });

    document.getElementById('aiKeyRemove').addEventListener('click', () => {
      window.MarginaliaAI.clearKey();
      showStatus('Key removed.');
    });

    const modelSelect = document.getElementById('aiModelSelect');
    modelSelect.value = window.MarginaliaAI.getModel();
    modelSelect.addEventListener('change', () => {
      window.MarginaliaAI.setModel(modelSelect.value);
    });

    // Event delegation — works even after nav re-renders
    document.addEventListener('click', e => {
      if (e.target.closest('#aiSettingsBtn')) openModal();
    });
  }

  function wireGearBtn() {} // kept for call sites, no-op

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
    showStatus(window.MarginaliaAI.hasKey() ? 'A key is currently saved.' : 'No key saved yet.');
    document.getElementById('aiModelSelect').value = window.MarginaliaAI.getModel();
  }

  function closeModal() {
    document.getElementById('aiSettingsModal')?.classList.remove('open');
  }

  window.openAISettings = openModal;

  // Mount modal once on load, re-wire gear btn on every nav render
  window.addEventListener('marginalia:ui-refresh', wireGearBtn);

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', mountModal);
  } else {
    mountModal();
  }

})();
