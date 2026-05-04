/* Marginalia · AI gateway client
   Calls the Cloud Function (aiGenerate) instead of the AI provider directly.
   No API key on the client — auth is via Firebase ID token.

   Usage (same interface as the old api.js):
     MarginaliaAI.generate({ featureId?, prompt, system?, onChunk?, onDone, onError })
     MarginaliaAI.generateJSON({ featureId?, prompt, system?, onError })
*/

import { ENV } from '../core/env.ts';

declare const firebase: {
  auth(): { currentUser: { getIdToken(): Promise<string> } | null };
};

export const MarginaliaAI = (window as Window & { MarginaliaAI?: unknown }).MarginaliaAI = (() => {

  async function getIdToken(): Promise<string | null> {
    try {
      const user = firebase.auth().currentUser;
      if (!user) return null;
      return await user.getIdToken();
    } catch {
      return null;
    }
  }

  async function generate({
    featureId,
    prompt,
    system: _system,
    onChunk,
    onDone,
    onError,
  }: {
    featureId?: string;
    prompt: string;
    system?: string;
    onChunk?: (delta: string) => void;
    onDone?: (full: string) => void;
    onError?: (err: Error) => void;
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
      const res = await fetch(gatewayUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`,
        },
        body: JSON.stringify({ featureId, prompt }),
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
            const json = JSON.parse(payload) as { delta?: string; error?: string };
            if (json.error) throw new Error(json.error);
            const delta = json.delta || '';
            if (delta) { full += delta; onChunk?.(delta); }
          } catch (parseErr) {
            if (parseErr instanceof Error && parseErr.message !== 'Unexpected end of JSON input') {
              throw parseErr;
            }
          }
        }
      }
      onDone?.(full);
    } catch (err) {
      onError?.(err instanceof Error ? err : new Error(String(err)));
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
