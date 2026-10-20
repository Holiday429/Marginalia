# Beta interview guide (phase 2 gate)

For: Holiday, running 20-minute interviews with at least 5 of the ~20 beta users, in week 4 or later.
Goal: find out whether the loop works for a real reader: *capture → get brought back → act on it*. Not to collect feature requests.
Write the conclusions into `docs/phase-reports/phase-2.md` (section "Interviews"). Main questions are given in English with a Chinese wording in brackets; use whichever language the person is comfortable in.

## Before you start

- Pick users who have used the app for at least two weeks, mixing active ones (saved or answered something in the last week) and quiet ones (did not). Ask for at least one quiet user: they teach the most.
- Look at their PostHog person page first (5 minutes): when they signed up, how many books, highlights, sessions, whether they enabled the weekly email, whether they answered a resurfaced highlight, whether they finished a book. Do not read these back to them; use them to ask better follow-ups.
- Ask permission to take notes (and to record audio if you want to). Say that nothing they say is a judgement of them, and that "I never used that" is a useful answer.
- Have the app open on a dev account of your own, so you can share your screen if they get stuck. Do not demo before they have tried it themselves.

## Plan (20 minutes)

| Time | What |
| --- | --- |
| 0–2 | Introduction and consent |
| 2–6 | Their reading life (no app yet) |
| 6–12 | Walk me through the last time you used it |
| 12–18 | The loop: capture, coming back, finishing |
| 18–20 | Magic wand, and one thing to remember |

### 1. Introduction (2 min)

"I want to understand how Marginalia fits into your reading. There are no wrong answers and I did not build every part of it, so be blunt." Ask if you may take notes.

### 2. Their reading life (4 min)

- What are you reading right now, and where do you read (paper, Kindle, phone, WeChat Read)? （你现在在读什么？在哪里读？）
- When you finish a book, what happens to what you learned? Where did your notes and highlights go before Marginalia? （读完一本书以后，那些收获去哪了？用 Marginalia 之前，笔记和划线放在哪里？）
- Have you ever gone back to an old highlight on your own? What made you do it? （你有没有自己回头翻过旧的划线？是什么让你翻的？）

Listen for: the tool they used before (Notion, Readwise, Kindle, notes app), and whether going back is a habit or a rare event.

### 3. The last time (6 min)

- Tell me about the last time you opened Marginalia. What were you trying to do? （上一次打开 Marginalia 是为了什么？）
- Please show me (share screen, or tell me step by step) how you add a book. How did your first books get in: typed, imported, or did you skip it? （你的书是怎么进来的？手动添加、导入，还是没加？）
- Where did you get stuck, or almost give up? （哪一步卡住过，或差点放弃？）
- Did you see the three-step guide when you started? What do you remember of it? （你还记得开始时的三步引导吗？）

Observe: what they click first, whether they find the "+" capture button and the `C` key on their own, whether they know about the search (Ctrl/Cmd+K).

### 4. The loop (6 min)

Ask each one, then follow with "why" and "can you give me an example":

- **Capture.** When did you last save a thought or a highlight, and how: the "+" button, a book page, an import? Was there a time you wanted to write something down and did not? （最近一次记下一句话是怎么记的？有没有想记但没记的时候？）
- **Coming back.** Do you get the weekly email? (If not: why not? Did you turn it on? Did you see the setting?) Did you ever answer one of the highlights in it, or on the wall in the room? What did you feel when an old highlight came back? （周报邮件你收到吗？没收到的话为什么？有没有回应过某条旧划线？它回来时你是什么感觉？）
- **Acting.** Has anything you read in Marginalia made you do something (an action you wrote, a book you picked, a conversation)? （有没有哪条内容让你真的做了点什么？）
- **Finishing.** Did you finish a book since you joined? Did the three questions appear? Did you answer, skip, or not notice? Was the card useful? Would you share it? （读完一本书时的三个问题和那张卡片，你觉得怎么样？）
- **Map and search.** Did you open the map? Did the places it put your books in look right? Do you search your own notes, and did you find what you looked for? （地图把书放的位置对吗？你会搜自己的笔记吗？）

Observe, do not lead: do not mention a feature they did not mention until the end. Note every moment where they say "I didn't know I could".

### 5. Wrap-up (2 min)

- If I could change one thing about Marginalia for you this week, what should it be? （如果只能改一件事，你希望改什么？）
- Would you be disappointed if Marginalia disappeared tomorrow? Very, somewhat, not much? Why? （如果 Marginalia 明天消失，你会失望吗？很、有点、不太？为什么？）
- Who else do you know that would use it? （你会推荐给谁？）

## What to write down

One page per person, same headings, so the five can be compared:

1. Who (reader type, tools they used before), days since signup, what PostHog showed.
2. Capture: how often and how, what blocked them.
3. Coming back: email received? enabled? answered? what happened to their interest.
4. Finishing ritual and finish card: seen / answered / skipped / used.
5. Map, search, import: worked / confused them.
6. Three quotes in their own words.
7. Disappointment answer (very / somewhat / not much).
8. Your read: did the loop close for this person (captured → came back → did something)? Yes / partly / no, and the broken link.

## How this maps to the gate

The gate asks that at least half of the beta users still saved a highlight or answered a resurface in week 4 (PostHog: weekly active readers, `docs/analytics.md`), and that five interviews were done. After five interviews, look for the broken link that appears in at least three of them (nobody turned the email on; the capture button was not found; the guide was skipped and nothing replaced it; answers were given but nothing came back). That link is what phase 2 continues on before phase 3 starts. Do not count "I like it" as evidence for the loop; count what they did.

## Rules for yourself

- Do not defend the product, explain a feature, or fix a bug during the interview. Write it down.
- Silence is fine. After an answer, wait three seconds before the next question.
- Never ask "would you use a feature that…". Ask about the last time they did something.
- Thank them and tell them what changed because of what they said, once it has.
