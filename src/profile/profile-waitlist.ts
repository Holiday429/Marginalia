export function renderWaitlistCTA(host: HTMLElement): void {
  host.innerHTML = `
    <section class="prof-waitlist" aria-label="Join waitlist">
      <div class="prof-waitlist__inner">
        <p class="prof-waitlist__kicker">Early access</p>
        <h2 class="prof-waitlist__heading">Your reading life, visualised</h2>
        <p class="prof-waitlist__body">Marginalia turns your shelf into a reading identity — complete with a world map of where your books have taken you, your annual top 10, and an AI portrait of how you read.</p>
        <form class="prof-waitlist__form" id="profWaitlistForm" novalidate>
          <input
            class="prof-waitlist__input"
            id="profWaitlistEmail"
            type="email"
            placeholder="your@email.com"
            autocomplete="email"
            required
          />
          <button class="prof-waitlist__btn" type="submit">Join waitlist</button>
        </form>
        <p class="prof-waitlist__note" id="profWaitlistNote" hidden></p>
        <p class="prof-waitlist__legal">No spam. Unsubscribe any time.</p>
      </div>
    </section>
  `;

  bindWaitlistForm(host);
}

function bindWaitlistForm(host: HTMLElement): void {
  const form = host.querySelector<HTMLFormElement>('#profWaitlistForm');
  const emailInput = host.querySelector<HTMLInputElement>('#profWaitlistEmail');
  const note = host.querySelector<HTMLElement>('#profWaitlistNote');

  form?.addEventListener('submit', async (e) => {
    e.preventDefault();
    const email = emailInput?.value.trim();
    if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      showNote(note, 'Please enter a valid email address.', false);
      return;
    }

    const btn = form.querySelector<HTMLButtonElement>('button[type="submit"]');
    if (btn) { btn.disabled = true; btn.textContent = 'Joining…'; }

    try {
      const WAITLIST_ENDPOINT = 'https://formspree.io/f/YOUR_FORM_ID';

      const res = await fetch(WAITLIST_ENDPOINT, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Accept': 'application/json' },
        body: JSON.stringify({ email }),
      });

      if (res.ok) {
        if (form.parentElement) form.innerHTML = '';
        showNote(note, 'You\'re on the list. We\'ll be in touch.', true);
      } else {
        throw new Error('Submit failed');
      }
    } catch {
      if (btn) { btn.disabled = false; btn.textContent = 'Join waitlist'; }
      showNote(note, 'Something went wrong — try again in a moment.', false);
    }
  });
}

function showNote(el: HTMLElement | null, text: string, success: boolean): void {
  if (!el) return;
  el.textContent = text;
  el.hidden = false;
  el.className = `prof-waitlist__note${success ? ' prof-waitlist__note--success' : ' prof-waitlist__note--error'}`;
}
