/* Marginalia · AI gateway client
   Calls the Cloud Function (aiGenerate) instead of the AI provider directly.
   No API key on the client — auth is via Firebase ID token.

   Usage (same interface as the old api.js):
     MarginaliaAI.generate({ featureId?, prompt, system?, onChunk?, onDone, onError })
     MarginaliaAI.generateJSON({ featureId?, prompt, system?, onError })
*/

import { ENV } from '../core/env.ts';
import { logEvent } from './analytics.ts';
import { getIdToken } from '../firebase/auth.ts';

export const MarginaliaAI = (() => {

  async function generate({
    featureId,
    prompt,
    system: _system,
    onChunk,
    onDone,
    onError,
    signal,
  }: {
    featureId?: string;
    prompt: string;
    system?: string;
    onChunk?: (delta: string) => void;
    onDone?: (full: string) => void;
    onError?: (err: Error) => void;
    signal?: AbortSignal;
  }): Promise<void> {
    const gatewayUrl = ENV.AI_GATEWAY_URL;
    if (!gatewayUrl) {
      onError?.(new Error('AI gateway URL not configured. Set VITE_AI_GATEWAY_URL in your .env file.'));
      return;
    }

    const token = await getIdToken();
    if (!token) {
      onError?.(new Error('Not signed in. Please log in to use AI features.'));
      return;
    }

    try {
      let provider = 'deepseek';
      let model = 'deepseek-chat';
      const res = await fetch(gatewayUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`,
        },
        body: JSON.stringify({ featureId, prompt }),
        signal,
      });

      if (!res.ok) {
        const body = await res.text().catch(() => '');
        let message = `Gateway error ${res.status}`;
        try { message = (JSON.parse(body) as { error?: string }).error || message; } catch { /* raw text */ }
        throw new Error(message);
      }

      // SSE stream
      const reader = res.body!.getReader();
      const decoder = new TextDecoder();
      let full = '';

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        const chunk = decoder.decode(value, { stream: true });
        for (const line of chunk.split('\n')) {
          const trimmed = line.trim();
          if (!trimmed.startsWith('data: ')) continue;
          const payload = trimmed.slice(6);
          if (payload === '[DONE]') continue;
          try {
            const json = JSON.parse(payload) as {
              delta?: string;
              error?: string;
              meta?: { provider?: string; model?: string };
            };
            if (json.error) throw new Error(json.error);
            if (json.meta?.provider) provider = json.meta.provider;
            if (json.meta?.model) model = json.meta.model;
            const delta = json.delta || '';
            if (delta) { full += delta; onChunk?.(delta); }
          } catch (parseErr) {
            if (parseErr instanceof Error && parseErr.message !== 'Unexpected end of JSON input') {
              throw parseErr;
            }
          }
        }
      }
      logEvent('ai_generated', { featureId, provider, model });
      onDone?.(full);
    } catch (err) {
      const error = err instanceof Error ? err : new Error(String(err));
      // Caller-initiated abort: surface as a typed error so UI can distinguish.
      if (error.name === 'AbortError') {
        onError?.(Object.assign(new Error('Generation cancelled.'), { name: 'AbortError' }));
      } else {
        onError?.(error);
      }
    }
  }

  async function generateJSON({
    featureId,
    prompt,
    system,
    onError,
  }: {
    featureId?: string;
    prompt: string;
    system?: string;
    onError?: (err: Error) => void;
  }): Promise<unknown> {
    return new Promise((resolve) => {
      generate({
        featureId,
        prompt,
        system: system || 'Return only valid JSON. No markdown fences, no explanation.',
        onDone(text) {
          try {
            const clean = text.replace(/^```[a-z]*\n?/i, '').replace(/```$/, '').trim();
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

  return { generate, generateJSON };
})();
