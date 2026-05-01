/* ==========================================================================
   Marginalia · Firebase auth gate
   --------------------------------------------------------------------------
   - Sign up: username + email + password
   - Sign in: email or username + password
   - Social login: Google one-tap (popup)
   ========================================================================== */

window.MarginaliaAuth = (() => {
  const authState = {
    enabled: false,
    app: null,
    auth: null,
    db: null,
    storage: null,
    user: null,
    ready: false,
    mode: 'login',
    gateOpen: false,
    profilePanelOpen: false,
  };

  let gateReady = false;
  let authTriggersBound = false;

  init();

  function init() {
    const runtime = window.MARGINALIA_FIREBASE || {};
    if (!runtime.enabled) {
      syncAuthTriggers();
      dispatchAuthState();
      return;
    }

    if (!window.firebase?.initializeApp) {
      console.warn('[auth] Firebase SDK is not loaded.');
      syncAuthTriggers();
      dispatchAuthState();
      return;
    }

    if (!runtime.config?.apiKey || !runtime.config?.projectId) {
      console.warn('[auth] Firebase config is incomplete.');
      syncAuthTriggers();
      dispatchAuthState();
      return;
    }

    authState.enabled = true;
    authState.app = firebase.apps.length ? firebase.app() : firebase.initializeApp(runtime.config);
    authState.auth = firebase.auth();
    authState.db = firebase.firestore();
    authState.storage = firebase.storage();

    ensureGate();
    bindAuthTriggers();
    authState.auth.onAuthStateChanged(async (user) => {
      authState.user = user || null;
      if (user) {
        await ensureUserProfile(user);
        authState.gateOpen = false;
        clearAuthInputs();
        setAuthError('');
      }
      authState.ready = true;
      renderAuthState();
      dispatchAuthState();
    });
  }

  function ensureGate() {
    if (gateReady || !document.body) return;
    const root = document.createElement('div');
    root.innerHTML = `
      <section class="auth-gate" id="authGate" aria-hidden="true">
        <div class="auth-shell" role="dialog" aria-modal="true" aria-label="Login panel">
          <aside class="auth-info">
            <div class="auth-kicker">Marginalia Cloud</div>
            <h1 class="auth-title">Your Reading Network</h1>
            <p class="auth-copy">Log in to load your concepts, links, confirmations, and future cloud notes across devices.</p>
          </aside>
          <div class="auth-panel">
            <button class="auth-close-btn" id="authCloseBtn" type="button" aria-label="Close login panel">×</button>
            <div class="auth-tabs" id="authTabs">
              <button id="authTabLogin" class="active" type="button">Sign In</button>
              <button id="authTabRegister" type="button">Register</button>
            </div>
            <form class="auth-form" id="authForm">
              <label id="authUsernameRow" hidden>
                <span>Username</span>
                <input id="authUsernameInput" autocomplete="username">
              </label>
              <label>
                <span id="authIdentityLabel">Email or Username</span>
                <input id="authIdentityInput" required>
              </label>
              <label>
                <span>Password</span>
                <input id="authPasswordInput" type="password" autocomplete="current-password" required>
              </label>
              <button class="auth-submit" id="authSubmitBtn" type="submit">Sign In</button>
              <div class="auth-divider" aria-hidden="true"><span>or</span></div>
              <button class="auth-google-btn" id="authGoogleBtn" type="button">Continue With Google</button>
              <div class="auth-error" id="authError"></div>
            </form>
            <div class="auth-user" id="authUser" hidden>
              <div class="auth-user-meta" id="authUserMeta"></div>
              <button class="auth-logout-btn" id="authLogoutBtn" type="button" data-auth-action="logout">Log Out</button>
            </div>
          </div>
        </div>
      </section>
      <section class="auth-dock-panel" id="authDockPanel" aria-hidden="true" hidden>
        <button class="auth-dock-close" id="authDockCloseBtn" type="button" aria-label="Close account panel">×</button>
        <div class="auth-dock-head">
          <span class="auth-dock-avatar" id="authDockAvatar" aria-hidden="true">U</span>
          <div class="auth-dock-name" id="authDockName">User</div>
          <div class="auth-dock-email" id="authDockEmail"></div>
        </div>
        <div class="auth-dock-divider" aria-hidden="true"></div>
        <button class="auth-dock-item" type="button" data-auth-panel-action="ai-settings">AI Settings</button>
        <button class="auth-dock-item" type="button" data-auth-panel-action="language">Language · Soon</button>
        <button class="auth-dock-item is-logout" type="button" data-auth-panel-action="logout">Log Out</button>
      </section>
    `;
    Array.from(root.children).forEach((node) => document.body.appendChild(node));
    gateReady = true;

    document.getElementById('authTabLogin')?.addEventListener('click', () => setMode('login'));
    document.getElementById('authTabRegister')?.addEventListener('click', () => setMode('register'));
    document.getElementById('authForm')?.addEventListener('submit', onSubmit);
    document.getElementById('authGoogleBtn')?.addEventListener('click', onGoogleLogin);
    document.getElementById('authCloseBtn')?.addEventListener('click', closeGate);
    document.getElementById('authDockCloseBtn')?.addEventListener('click', closeProfilePanel);
    document.getElementById('authLogoutBtn')?.addEventListener('click', async () => {
      if (!authState.auth) return;
      await authState.auth.signOut();
      closeGate();
    });
    document.querySelectorAll('[data-auth-panel-action]').forEach((btn) => {
      btn.addEventListener('click', onProfilePanelAction);
    });

    document.addEventListener('keydown', (event) => {
      if (event.key === 'Escape') {
        closeGate();
        closeProfilePanel();
      }
    });

    window.addEventListener('marginalia:ui-refresh', syncAuthTriggers);

    renderAuthState();
  }

  function bindAuthTriggers() {
    if (authTriggersBound) return;
    authTriggersBound = true;

    document.addEventListener('click', (event) => {
      const trigger = event.target.closest('[data-auth-trigger]');
      if (trigger) {
        event.preventDefault();
        if (!authState.user) {
          closeProfilePanel();
          openGate();
          return;
        }
        toggleProfilePanel();
        return;
      }

      const gate = document.getElementById('authGate');
      if (gate && authState.gateOpen && event.target === gate) {
        closeGate();
      }

      if (authState.profilePanelOpen) {
        const panel = document.getElementById('authDockPanel');
        if (panel && !event.target.closest('#authDockPanel')) closeProfilePanel();
      }
    });
  }

  function setMode(mode) {
    authState.mode = mode === 'register' ? 'register' : 'login';
    renderAuthState();
  }

  function openGate(mode = 'login') {
    if (!authState.enabled) return;
    closeProfilePanel();
    setMode(mode);
    authState.gateOpen = true;
    setAuthError('');
    renderAuthState();
  }

  function closeGate() {
    if (!authState.gateOpen) return;
    authState.gateOpen = false;
    setAuthError('');
    renderAuthState();
  }

  function toggleProfilePanel() {
    if (!authState.user) return;
    if (authState.profilePanelOpen) {
      closeProfilePanel();
      return;
    }
    openProfilePanel();
  }

  function openProfilePanel() {
    if (!authState.user) return;
    const panel = document.getElementById('authDockPanel');
    if (!panel) return;

    authState.profilePanelOpen = true;
    updateProfilePanelMeta();
    panel.hidden = false;
    requestAnimationFrame(() => panel.classList.add('open'));
    panel.setAttribute('aria-hidden', 'false');
  }

  function closeProfilePanel() {
    const panel = document.getElementById('authDockPanel');
    if (!authState.profilePanelOpen && !panel) return;
    authState.profilePanelOpen = false;
    if (!panel) return;
    panel.classList.remove('open');
    panel.setAttribute('aria-hidden', 'true');
    window.setTimeout(() => {
      if (!authState.profilePanelOpen) panel.hidden = true;
    }, 280);
  }

  function updateProfilePanelMeta() {
    const user = authState.user;
    const avatar = document.getElementById('authDockAvatar');
    const name = document.getElementById('authDockName');
    const email = document.getElementById('authDockEmail');
    if (!avatar || !name || !email) return;

    const userName = user?.displayName || user?.email || 'User';
    const initial = String(userName).trim().charAt(0).toUpperCase() || 'U';
    name.textContent = userName;
    email.textContent = user?.email || '';

    if (user?.photoURL) {
      avatar.style.backgroundImage = `url("${user.photoURL.replace(/"/g, '%22')}")`;
      avatar.textContent = '';
      avatar.classList.add('has-photo');
    } else {
      avatar.style.backgroundImage = '';
      avatar.textContent = initial;
      avatar.classList.remove('has-photo');
    }
  }

  async function onProfilePanelAction(event) {
    const action = event.currentTarget?.dataset?.authPanelAction;
    if (!action) return;

    if (action === 'logout') {
      if (!authState.auth) return;
      await authState.auth.signOut();
      closeProfilePanel();
      return;
    }

    if (action === 'ai-settings') {
      closeProfilePanel();
      window.openAISettings?.();
      return;
    }

    if (action === 'language') {
      closeProfilePanel();
      setAuthError('');
      return;
    }
  }

  async function onSubmit(event) {
    event.preventDefault();
    if (!authState.auth || !authState.db) return;
    setAuthError('');

    const mode = authState.mode;
    const identity = String(document.getElementById('authIdentityInput')?.value || '').trim();
    const password = String(document.getElementById('authPasswordInput')?.value || '').trim();
    const username = String(document.getElementById('authUsernameInput')?.value || '').trim();

    if (!identity || !password) {
      setAuthError('Please enter credentials.');
      return;
    }

    try {
      if (mode === 'register') {
        if (!username) {
          setAuthError('Username is required.');
          return;
        }
        await registerWithUsername({ username, email: identity, password });
      } else {
        await loginWithIdentity({ identity, password });
      }
      clearAuthInputs();
      closeGate();
    } catch (error) {
      setAuthError(normalizeAuthError(error));
    }
  }

  async function onGoogleLogin() {
    if (!authState.auth) return;
    setAuthError('');

    try {
      const provider = new firebase.auth.GoogleAuthProvider();
      provider.setCustomParameters({ prompt: 'select_account' });
      const result = await authState.auth.signInWithPopup(provider);
      if (result?.user) {
        await ensureUserProfile(result.user);
        clearAuthInputs();
        closeGate();
      }
    } catch (error) {
      setAuthError(normalizeAuthError(error));
    }
  }

  async function registerWithUsername({ username, email, password }) {
    const normalizedUsername = normalizeUsername(username);
    if (!normalizedUsername) throw new Error('Username is invalid.');
    if (!email.includes('@')) throw new Error('Registration requires email.');

    const existing = await authState.db
      .collection('workspaces')
      .doc(getWorkspaceId())
      .collection('userProfiles')
      .where('usernameLower', '==', normalizedUsername)
      .limit(1)
      .get();
    if (!existing.empty) throw new Error('Username is already used.');

    const result = await authState.auth.createUserWithEmailAndPassword(email, password);
    if (!result.user) throw new Error('Unable to create account.');
    await result.user.updateProfile({ displayName: username });
    await upsertUserProfile(result.user, { username, email });
  }

  async function loginWithIdentity({ identity, password }) {
    const identityInput = identity.trim();
    if (identityInput.includes('@')) {
      await authState.auth.signInWithEmailAndPassword(identityInput, password);
      return;
    }

    const profileSnapshot = await authState.db
      .collection('workspaces')
      .doc(getWorkspaceId())
      .collection('userProfiles')
      .where('usernameLower', '==', normalizeUsername(identityInput))
      .limit(1)
      .get();
    if (profileSnapshot.empty) throw new Error('User not found.');

    const profile = profileSnapshot.docs[0].data();
    if (!profile?.email) throw new Error('User profile is incomplete.');
    await authState.auth.signInWithEmailAndPassword(profile.email, password);
  }

  async function ensureUserProfile(user) {
    if (!authState.db) return;
    const workspaceId = getWorkspaceId();
    const profileRef = authState.db
      .collection('workspaces')
      .doc(workspaceId)
      .collection('userProfiles')
      .doc(user.uid);
    const doc = await profileRef.get();
    if (doc.exists) return;
    await upsertUserProfile(user, {
      username: user.displayName || (user.email ? user.email.split('@')[0] : user.uid.slice(0, 8)),
      email: user.email || '',
    });
  }

  async function upsertUserProfile(user, { username, email }) {
    const workspaceId = getWorkspaceId();
    const profileRef = authState.db
      .collection('workspaces')
      .doc(workspaceId)
      .collection('userProfiles')
      .doc(user.uid);

    await profileRef.set({
      uid: user.uid,
      username,
      usernameLower: normalizeUsername(username),
      email,
      photoURL: user.photoURL || '',
      updatedAt: firebase.firestore.FieldValue.serverTimestamp(),
      createdAt: firebase.firestore.FieldValue.serverTimestamp(),
    }, { merge: true });
  }

  function renderAuthState() {
    const gate = document.getElementById('authGate');
    if (!gate) return;

    const shouldOpen = authState.enabled && authState.gateOpen;
    gate.classList.toggle('open', shouldOpen);
    gate.setAttribute('aria-hidden', String(!shouldOpen));
    lockApp(shouldOpen);

    const authTabs = document.getElementById('authTabs');
    const authForm = document.getElementById('authForm');
    const usernameRow = document.getElementById('authUsernameRow');
    const identityLabel = document.getElementById('authIdentityLabel');
    const submitBtn = document.getElementById('authSubmitBtn');
    const loginTab = document.getElementById('authTabLogin');
    const registerTab = document.getElementById('authTabRegister');
    const userWrap = document.getElementById('authUser');
    const userMeta = document.getElementById('authUserMeta');

    const isRegister = authState.mode === 'register';
    const hasUser = Boolean(authState.user);

    if (usernameRow) usernameRow.hidden = !isRegister;
    if (identityLabel) identityLabel.textContent = isRegister ? 'Email' : 'Email or Username';
    if (submitBtn) submitBtn.textContent = isRegister ? 'Create Account' : 'Sign In';
    if (loginTab) loginTab.classList.toggle('active', !isRegister);
    if (registerTab) registerTab.classList.toggle('active', isRegister);
    if (authTabs) authTabs.hidden = hasUser;
    if (authForm) authForm.hidden = hasUser;

    if (hasUser) {
      if (userWrap) userWrap.hidden = false;
      if (userMeta) userMeta.textContent = `${authState.user.displayName || 'User'} · ${authState.user.email || authState.user.uid}`;
    } else if (userWrap) {
      userWrap.hidden = true;
      closeProfilePanel();
    }

    syncAuthTriggers();
  }

  function syncAuthTriggers() {
    const triggers = document.querySelectorAll('[data-auth-trigger]');
    triggers.forEach((trigger) => {
      const avatar = trigger.querySelector('[data-auth-avatar]');
      if (!authState.enabled) {
        trigger.hidden = true;
        return;
      }

      trigger.hidden = false;
      trigger.setAttribute('aria-label', authState.user ? 'Open account panel' : 'Open login panel');
      const user = authState.user;
      const name = user?.displayName || user?.email || 'Log In';
      const initial = String(name).trim().charAt(0).toUpperCase() || 'L';

      if (avatar) {
        if (user?.photoURL) {
          avatar.style.backgroundImage = `url("${user.photoURL.replace(/"/g, '%22')}")`;
          avatar.textContent = '';
          avatar.classList.add('has-photo');
        } else {
          avatar.style.backgroundImage = '';
          avatar.textContent = initial;
          avatar.classList.remove('has-photo');
        }
      }
    });
    if (authState.profilePanelOpen) {
      updateProfilePanelMeta();
    }
  }

  function lockApp(isLocked) {
    document.body.classList.toggle('auth-locked', isLocked && authState.enabled);
  }

  function clearAuthInputs() {
    ['authIdentityInput', 'authPasswordInput', 'authUsernameInput'].forEach((id) => {
      const input = document.getElementById(id);
      if (input) input.value = '';
    });
  }

  function setAuthError(message) {
    const errorEl = document.getElementById('authError');
    if (errorEl) errorEl.textContent = message || '';
  }

  function normalizeUsername(value) {
    return String(value || '')
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9_.-]/g, '');
  }

  function normalizeAuthError(error) {
    const code = String(error?.code || '');
    if (code.includes('wrong-password')) return 'Password is incorrect.';
    if (code.includes('user-not-found')) return 'User not found.';
    if (code.includes('invalid-email')) return 'Email is invalid.';
    if (code.includes('email-already-in-use')) return 'Email is already registered.';
    if (code.includes('weak-password')) return 'Password should be at least 6 characters.';
    if (code.includes('popup-closed-by-user')) return 'Google login was canceled.';
    if (code.includes('popup-blocked')) return 'Browser blocked popup. Please allow popups and retry.';
    return error?.message || 'Authentication failed.';
  }

  function getWorkspaceId() {
    return window.MARGINALIA_FIREBASE?.workspaceId || 'default';
  }

  function dispatchAuthState() {
    window.dispatchEvent(new CustomEvent('marginalia:auth-changed', {
      detail: {
        enabled: authState.enabled,
        ready: authState.ready,
        user: authState.user ? {
          uid: authState.user.uid,
          email: authState.user.email || '',
          displayName: authState.user.displayName || '',
        } : null,
      },
    }));
  }

  function onAuthStateChange(listener) {
    if (typeof listener !== 'function') return () => {};
    const handler = (event) => listener(event.detail);
    window.addEventListener('marginalia:auth-changed', handler);
    listener({
      enabled: authState.enabled,
      ready: authState.ready,
      user: authState.user ? {
        uid: authState.user.uid,
        email: authState.user.email || '',
        displayName: authState.user.displayName || '',
      } : null,
    });
    return () => window.removeEventListener('marginalia:auth-changed', handler);
  }

  return {
    get enabled() { return authState.enabled; },
    get app() { return authState.app; },
    get auth() { return authState.auth; },
    get db() { return authState.db; },
    get storage() { return authState.storage; },
    get user() { return authState.user; },
    onAuthStateChange,
    openLogin: openGate,
    closeLogin: closeGate,
  };
})();
