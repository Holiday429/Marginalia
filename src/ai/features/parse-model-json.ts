/* Marginalia · parse a model reply that should be JSON (pure). */

/** Strip a code fence the model may wrap around its JSON, then parse. */
export function parseModelJson(text: string): unknown {
  return JSON.parse(text.replace(/^```[a-z]*\n?/i, '').replace(/```$/, '').trim());
}
