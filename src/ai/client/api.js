/* ==========================================================================
   Marginalia · AI API client
   --------------------------------------------------------------------------
   Thin wrapper around DeepSeek (OpenAI-compatible) chat completions.
   API key is stored in localStorage only — never sent to any server other
   than the AI provider directly from the browser.

   Usage:
     window.MarginaliaAI.generate({ prompt, onChunk?, onDone, onError })
     window.MarginaliaAI.hasKey()
     window.MarginaliaAI.setKey(key)
     window.MarginaliaAI.clearKey()
   ========================================================================== */

window.MarginaliaAI = (() => {
  const STORAGE_KEY  = 'marginalia_ai_key';
  const STORAGE_MODEL = 'marginalia_ai_model';
  const ENDPOINT     = 'https://api.deepseek.com/chat/completions';
  const DEFAULT_MODEL = 'deepseek-chat';

  function getKey()   { return localStorage.getItem(STORAGE_KEY) || ''; }
  function setKey(k)  { localStorage.setItem(STORAGE_KEY, k.trim()); }
  function clearKey() { localStorage.removeItem(STORAGE_KEY); }
  function hasKey()   { return Boolean(getKey()); }
  function getModel() { return localStorage.getItem(STORAGE_MODEL) || DEFAULT_MODEL; }
  function setModel(m){ localStorage.setItem(STORAGE_MODEL, m); }

  /**
   * Call the AI with a prompt. Streams the response via onChunk callback.
   * @param {object} opts
   * @param {string}   opts.prompt
   * @param {string}   [opts.system]   system message
   * @param {function} [opts.onChunk]  called with each text delta (streaming)
   * @param {function} opts.onDone     called with full response text
   * @param {function} opts.onError    called with Error
   */
  async function generate({ prompt, system, onChunk, onDone, onError }) {
    const key = getKey();
    if (!key) {
      onError?.(new Error('No API key set. Open Settings to add your DeepSeek key.'));
      return;
    }

    const messages = [];
    if (system) messages.push({ role: 'system', content: system });
    messages.push({ role: 'user', content: prompt });

    const streaming = typeof onChunk === 'function';

    try {
      const res = await fetch(ENDPOINT, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${key}`,
        },
        body: JSON.stringify({
          model: getModel(),
          messages,
          stream: streaming,
          temperature: 0.4,
          max_tokens: 4096,
        }),
      });

      if (!res.ok) {
        const body = await res.text().catch(() => '');
        throw new Error(`API error ${res.status}: ${body.slice(0, 200)}`);
      }

      if (streaming) {
        const reader = res.body.getReader();
        const decoder = new TextDecoder();
        let full = '';

        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          const chunk = decoder.decode(value, { stream: true });
          // SSE format: lines starting with "data: "
          for (const line of chunk.split('\n')) {
            const trimmed = line.trim();
            if (!trimmed.startsWith('data: ')) continue;
            const payload = trimmed.slice(6);
            if (payload === '[DONE]') continue;
            try {
              const json = JSON.parse(payload);
              const delta = json.choices?.[0]?.delta?.content || '';
              if (delta) { full += delta; onChunk(delta); }
            } catch {}
          }
        }
        onDone?.(full);
      } else {
        const json = await res.json();
        const text = json.choices?.[0]?.message?.content || '';
        onDone?.(text);
      }
    } catch (err) {
      onError?.(err);
    }
  }

  /**
   * Convenience: call AI and parse the response as JSON.
   * The prompt should instruct the model to return only valid JSON.
   */
  async function generateJSON({ prompt, system, onError }) {
    return new Promise((resolve) => {
      generate({
        prompt,
        system: system || 'Return only valid JSON. No markdown fences, no explanation.',
        onDone(text) {
          try {
            // Strip possible ```json fences if model disobeys
            const clean = text.replace(/^```[a-z]*\n?/i, '').replace(/```$/,'').trim();
            resolve(JSON.parse(clean));
          } catch {
            onError?.(new Error('AI returned invalid JSON. Try again.'));
            resolve(null);
          }
        },
        onError(err) { onError?.(err); resolve(null); },
      });
    });
  }

  return { hasKey, getKey, setKey, clearKey, getModel, setModel, generate, generateJSON };
})();
