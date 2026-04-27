/* ==========================================================================
   Marginalia · Firebase auth gate
   --------------------------------------------------------------------------
   Requirement: user must log in to see personal content.
   - Sign up: username + email + password
   - Sign in: email or username + password
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
  };

  let gateReady = false;

  init();

  function init() {
    const runtime = window.MARGINALIA_FIREBASE || {};
    if (!runtime.enabled) {
      dispatchAuthState();
      return;
    }

    if (!window.firebase?.initializeApp) {
      console.warn('[auth] Firebase SDK is not loaded.');
      dispatchAuthState();
      return;
    }

    if (!runtime.config?.apiKey || !runtime.config?.projectId) {
      console.warn('[auth] Firebase config is incomplete.');
      dispatchAuthState();
      return;
    }

    authState.enabled = true;
    authState.app = firebase.apps.length ? firebase.app() : firebase.initializeApp(runtime.config);
    authState.auth = firebase.auth();
    authState.db = firebase.firestore();
    authState.storage = firebase.storage();

    ensureGate();
    lockApp(true);
    authState.auth.onAuthStateChanged(async (user) => {
      authState.user = user || null;
      if (user) {
        lockApp(false);
        await ensureUserProfile(user);
      } else {
        lockApp(true);
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
        <div class="auth-shell">
          <aside class="auth-info">
            <div class="auth-kicker">Marginalia Cloud</div>
            <h1 class="auth-title">Your Reading Network</h1>
            <p class="auth-copy">Log in to load your concepts, links, confirmations, and future cloud notes across devices.</p>
          </aside>
          <div class="auth-panel">
            <div class="auth-tabs">
              <button id="authTabLogin" class="active" type="button">Sign In</button>
              <button id="authTabRegister" type="button">Register</button>
            </div>
            <form class="auth-form" id="authForm">
              <label id="authUsernameRow" hidden>
                <span>Username</span>
                <input id="authUsernameInput" autocomplete="username">
              </label>
              <label>
                <span id="authIdentityLabel">Email or username</span>
                <input id="authIdentityInput" required>
              </label>
              <label>
                <span>Password</span>
                <input id="authPasswordInput" type="password" autocomplete="current-password" required>
              </label>
              <button class="auth-submit" id="authSubmitBtn" type="submit">Sign In</button>
              <div class="auth-error" id="authError"></div>
            </form>
            <div class="auth-user" id="authUser" hidden>
              <div class="auth-user-meta" id="authUserMeta"></div>
              <button class="auth-logout-btn" id="authLogoutBtn" type="button">Log Out</button>
            </div>
          </div>
        </div>
      </section>
    `;
    Array.from(root.children).forEach((node) => document.body.appendChild(node));
    gateReady = true;

    document.getElementById('authTabLogin')?.addEventListener('click', () => setMode('login'));
    document.getElementById('authTabRegister')?.addEventListener('click', () => setMode('register'));
    document.getElementById('authForm')?.addEventListener('submit', onSubmit);
    document.getElementById('authLogoutBtn')?.addEventListener('click', () => authState.auth?.signOut());
    renderAuthState();
  }

  function setMode(mode) {
    authState.mode = mode === 'register' ? 'register' : 'login';
    renderAuthState();
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
      updatedAt: firebase.firestore.FieldValue.serverTimestamp(),
      createdAt: firebase.firestore.FieldValue.serverTimestamp(),
    }, { merge: true });
  }

  function renderAuthState() {
    const gate = document.getElementById('authGate');
    if (!gate) return;
    gate.classList.toggle('open', authState.enabled && !authState.user);
    gate.setAttribute('aria-hidden', String(!(authState.enabled && !authState.user)));

    const usernameRow = document.getElementById('authUsernameRow');
    const identityLabel = document.getElementById('authIdentityLabel');
    const submitBtn = document.getElementById('authSubmitBtn');
    const loginTab = document.getElementById('authTabLogin');
    const registerTab = document.getElementById('authTabRegister');
    const userWrap = document.getElementById('authUser');
    const userMeta = document.getElementById('authUserMeta');

    const isRegister = authState.mode === 'register';
    if (usernameRow) usernameRow.hidden = !isRegister;
    if (identityLabel) identityLabel.textContent = isRegister ? 'Email' : 'Email or username';
    if (submitBtn) submitBtn.textContent = isRegister ? 'Create account' : 'Sign In';
    if (loginTab) loginTab.classList.toggle('active', !isRegister);
    if (registerTab) registerTab.classList.toggle('active', isRegister);

    if (authState.user) {
      if (userWrap) userWrap.hidden = false;
      if (userMeta) userMeta.textContent = `${authState.user.displayName || 'User'} · ${authState.user.email || authState.user.uid}`;
    } else {
      if (userWrap) userWrap.hidden = true;
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
    const code = error?.code || '';
    if (code.includes('wrong-password')) return 'Password is incorrect.';
    if (code.includes('user-not-found')) return 'User not found.';
    if (code.includes('invalid-email')) return 'Email is invalid.';
    if (code.includes('email-already-in-use')) return 'Email is already registered.';
    if (code.includes('weak-password')) return 'Password should be at least 6 characters.';
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
  };
})();
