# WhatsApp Telugu Reply Bot 🤖

Auto-replies to WhatsApp messages in casual Telugu / Tenglish. It's free and needs no API key.

> **Friend:** hi
> **Bot:** hi ra, em chestunnav? 😄
>
> **Friend:** tinnava?
> **Bot:** ha tinna ra, nuvvu tinnava?

## Features
- Replies in Tenglish, and in Telugu script (ఏం చేస్తున్నావ్) when the message is in Telugu script
- Replies only to the numbers you choose
- Shows "typing..." and waits 3–9 seconds, like a real person
- Optional free local AI ([Ollama](https://ollama.com)) for messages the rules don't cover
- Fast login with no browser (uses [Baileys](https://github.com/WhiskeySockets/Baileys))
- `!pause` / `!resume` from your own "Message yourself" chat

## Setup
Needs [Node.js 18+](https://nodejs.org).

```bash
git clone https://github.com/YOUR-USERNAME/whatsapp-telugu-bot.git
cd whatsapp-telugu-bot
npm install
cp .env.example .env      # then edit .env
npm start
```

Scan the QR code: **WhatsApp → Settings → Linked devices → Link a device**.
When you see `✅ Reply agent running`, it's working. Your login is saved in the `auth/` folder, so you only scan once.

## Settings (`.env`)
| Setting | What it does |
|---|---|
| `ALLOWED_NUMBERS` | Only reply to these numbers, e.g. `919876543210,919123456789`. Empty = everyone |
| `REPLY_IN_GROUPS` | `true` to also reply in groups (default `false`) |
| `OLLAMA_MODEL` | Optional local AI, e.g. `gemma3:4b` |

## Optional: local AI with Ollama
1. Install Ollama from [ollama.com/download](https://ollama.com/download)
2. `ollama pull gemma3:4b` (about 3 GB; use `gemma3:1b` on slower PCs)
3. Add `OLLAMA_MODEL=gemma3:4b` to `.env`

Common messages still use the fast fixed rules. Only unknown messages go to the AI. If the AI takes longer than 45 seconds, the bot sends a default reply instead.

## Add your own replies
Edit `RULES` in `index.js`:
```js
{ match: ["cricket", "match"], replies: ["match chustunna ra 🏏"] },
```
Rules higher in the list are checked first. When a rule has several replies, one is picked at random.

## Troubleshooting
| Problem | Fix |
|---|---|
| `skipped: 91xxx is not in ALLOWED_NUMBERS` | Copy that exact number into `.env` |
| No reply when you text yourself | Normal. It only replies to other people |
| `Logged out` | Delete the `auth/` folder and run `npm start` to scan again |
| `local AI failed (too slow)` | Use a smaller model (`gemma3:1b`) |

## ⚠️ Important
- **Never upload the `auth/` folder.** It is your WhatsApp login. `.gitignore` already excludes it.
- This uses an unofficial WhatsApp connection, and WhatsApp may restrict accounts that act like bots. Use it responsibly and keep `ALLOWED_NUMBERS` limited.
- The bot only runs while your computer and terminal are on.
