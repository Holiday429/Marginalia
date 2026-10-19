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

// A tiny fake Wikidata (plan 2.6): "Author N" was born in a city of country N % 4. Search returns the item;
// wbgetentities returns the items asked for, so the real lookup code runs unchanged against it.
const COUNTRIES = [['GB', 'United Kingdom'], ['FR', 'France'], ['JP', 'Japan'], ['NG', 'Nigeria']];
function wikidata(params) {
  const action = params.get('action');
  if (action === 'wbsearchentities') {
    const m = /^Author (\d+)$/.exec(params.get('search') ?? '');
    return { search: m ? [{ id: `Q9${m[1]}` }] : [] };
  }
  const entities = {};
  for (const id of (params.get('ids') ?? '').split('|')) {
    const claim = (qid) => [{ rank: 'normal', mainsnak: { datavalue: { value: { id: qid } } } }];
    if (/^Q9\d+$/.test(id)) {
      const n = Number(id.slice(2));
      entities[id] = { id, labels: { en: { value: `Author ${n}` } }, descriptions: { en: { value: 'writer' } }, sitelinks: { enwiki: 1 },
        claims: { P31: claim('Q5'), P106: claim('Q36180'), P19: claim(`QC${n % 4}`), P27: claim(`QK${n % 4}`) } };
    } else if (/^QC\d$/.test(id)) {
      const k = Number(id.slice(2));
      entities[id] = { id, labels: { en: { value: `City ${k}` } }, claims: { P17: claim(`QK${k}`) } };
    } else if (/^QK\d$/.test(id)) {
      const k = Number(id.slice(2));
      entities[id] = { id, labels: { en: { value: COUNTRIES[k][1] } }, claims: { P297: [{ mainsnak: { datavalue: { value: COUNTRIES[k][0] } } }] } };
    }
  }
  return { entities };
}

function replyFor(prompt) {
  if (/mainly set/i.test(prompt)) return { country: 'FR', city: 'Paris', confidence: 'medium' };
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
  if (req.method === 'GET' && req.url?.startsWith('/w/api.php')) {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify(wikidata(new URL(req.url, 'http://x').searchParams)));
    return;
  }
  if (req.method === 'GET' && req.url?.startsWith('/reverse')) {
    // Fake Nominatim: always Lisbon. The query string is echoed back so a test can check the coordinates were rounded.
    const q = new URL(req.url, 'http://x').searchParams;
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ address: { city: 'Lisbon', country_code: 'pt' }, echoedLat: q.get('lat'), echoedLon: q.get('lon') }));
    return;
  }
  if (req.method !== 'POST' || !req.url?.endsWith('/chat/completions')) { res.statusCode = 404; res.end(); return; }
  let body = '';
  req.on('data', (c) => { body += c; });
  req.on('end', () => {
    const payload = JSON.parse(body || '{}');
    const prompt = (payload.messages ?? []).map((m) => m.content).join('\n');
    const text = JSON.stringify(replyFor(prompt));
    if (!payload.stream) {
      // A plain (non-streaming) completion, as the geography function makes.
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ id: 'mock', object: 'chat.completion', choices: [{ index: 0, message: { role: 'assistant', content: text }, finish_reason: 'stop' }], usage: { prompt_tokens: 100, completion_tokens: 50, total_tokens: 150 } }));
      return;
    }
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
