// Fake OpenAI-compatible model server for the emulator e2e (plan 2.2).
// The Functions emulator points aiGenerate at it (AI_BASE_URL), so a test exercises the real handler:
// auth, server-side prompt, quota, audit log, streaming. Nothing here reaches a real model.
import { createServer } from 'node:http';

const PORT = Number(process.env.MOCK_LLM_PORT || 5180);
const DELAY_MS = Number(process.env.MOCK_LLM_DELAY_MS || 600);

const INTRO_CARD = {
  premise: 'A test premise for the pre-read card. It stays free of spoilers.',
  audience: 'Readers who like careful arguments.',
  difficulty: 'moderate',
  difficultyNote: 'Dense in places, but the chapters stand alone.',
  readingTip: 'Read one chapter at a time and note one sentence from each.',
  context: {
    author: 'The author is a fictional test writer.',
    period: 'Written in the early 2000s.',
    place: 'Set in a city that exists only in the tests.',
    summary: 'This is the cultural context paragraph produced by the mock model, long enough to look like one.',
  },
};

function replyFor(prompt) {
  if (/just finished/i.test(prompt)) {
    // Echo the reader's first answer so a test can prove the answers reached the server-built prompt.
    const belief = /surprised them: "([^"]*)"/.exec(prompt)?.[1] ?? '';
    return { headline: 'Doubt, then action', synthesis: `Because you wrote "${belief}", this book became a habit rather than an opinion.`, tags: ['focus', 'habits'] };
  }
  if (/pre-read card/i.test(prompt)) return INTRO_CARD;
  return {};
}

createServer((req, res) => {
  if (req.method === 'GET' && req.url === '/health') { res.end('ok'); return; }
  if (req.method !== 'POST' || !req.url?.endsWith('/chat/completions')) { res.statusCode = 404; res.end(); return; }
  let body = '';
  req.on('data', (c) => { body += c; });
  req.on('end', () => {
    const payload = JSON.parse(body || '{}');
    const prompt = (payload.messages ?? []).map((m) => m.content).join('\n');
    const text = JSON.stringify(replyFor(prompt));
    res.writeHead(200, { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache' });
    const send = (obj) => res.write(`data: ${JSON.stringify(obj)}\n\n`);
    setTimeout(() => {
      const mid = Math.floor(text.length / 2);
      for (const part of [text.slice(0, mid), text.slice(mid)]) send({ id: 'mock', object: 'chat.completion.chunk', choices: [{ index: 0, delta: { content: part } }] });
      send({ id: 'mock', object: 'chat.completion.chunk', choices: [], usage: { prompt_tokens: 100, completion_tokens: 50, total_tokens: 150 } });
      res.write('data: [DONE]\n\n');
      res.end();
    }, DELAY_MS);
  });
}).listen(PORT, '127.0.0.1', () => process.stdout.write(`mock llm on ${PORT}\n`));
