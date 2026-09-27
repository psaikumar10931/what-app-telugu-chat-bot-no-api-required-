import "dotenv/config";
import qrcode from "qrcode-terminal";
import pino from "pino";
import makeWASocket, { useMultiFileAuthState, DisconnectReason, Browsers } from "@whiskeysockets/baileys";

// ---------- Settings (edit in .env) ----------
const REPLY_IN_GROUPS = process.env.REPLY_IN_GROUPS === "true";
const ALLOWED = (process.env.ALLOWED_NUMBERS || "")
  .split(",").map(s => s.trim()).filter(Boolean);
// Optional free local AI (no API key): install Ollama, then set OLLAMA_MODEL=gemma3:4b
const OLLAMA_MODEL = process.env.OLLAMA_MODEL || "";
const MIN_DELAY = 3000, MAX_DELAY = 9000;

// ---------- Reply rules: add your own! ----------
// Each rule: words/phrases to look for → list of replies (one picked at random).
const RULES = [
  { match: ["urgent", "emergency", "hospital", "dabbulu", "money", "money kavali", "అర్జెంట్"],
    replies: ["ippudu konchem busy ra, konchem sepatlo call chestha 🙏"] },
  { match: ["em chestunnav", "emi chestunnav", "em chestunnaru", "em chestunav", "em chesthunnav", "wat doing", "what are you doing", "wyd"],
    replies: ["em ledu ra, just intlo unna. nuvvu?", "chill avtunna ra 😄 nuvvu em chestunnav?", "em ledu ra, phone chustunna. nuvvu cheppu"] },
  { match: ["ఏం చేస్తున్నావ్", "ఏం చేస్తున్నావు", "ఏమి చేస్తున్నావు"],
    replies: ["ఏం లేదు రా, ఇంట్లో ఉన్నా. నువ్వు?"] },
  { match: ["ela unnav", "ela unnaru", "bagunnava", "bagunnara", "how are you", "hru", "ela unav"],
    replies: ["bagunna ra, nuvvu ela unnav?", "super ra 😄 nuvvu?"] },
  { match: ["ఎలా ఉన్నావ్", "ఎలా ఉన్నావు", "బాగున్నావా"],
    replies: ["బాగున్నా రా, నువ్వు ఎలా ఉన్నావ్?"] },
  { match: ["tinnava", "tinnara", "tinava", "lunch", "dinner", "breakfast", "tiffin"],
    replies: ["ha tinna ra, nuvvu tinnava?", "inka ledu ra, konchem sepatlo tintanu. nuvvu?"] },
  { match: ["ekkada unnav", "ekkada unnaru", "where are you", "ekkada"],
    replies: ["intlo unna ra. enduku?", "bayata unna ra, enti cheppu"] },
  { match: ["kaluddama", "kalustava", "vastava", "meet", "plan", "movie", "outing", "party"],
    replies: ["chuddam ra, nenu malli cheptha 👍", "try chestha ra, confirm chestha"] },
  { match: ["call", "phone chey", "call chey", "lift chey"],
    replies: ["ippudu konchem busy ra, konchem sepatlo call chestha", "5 mins ra, call chestha"] },
  { match: ["good morning", "gm", "gud mrng"],
    replies: ["good morning ra ☀️", "gm ra 😄 lechava?"] },
  { match: ["good night", "gn", "gud n8"],
    replies: ["good night ra 😴 malli repu matladdam", "gn ra, bye"] },
  { match: ["thanks", "thank you", "thanku", "thq", "tq"],
    replies: ["parledu ra 🙏", "ayyo em parledu ra"] },
  { match: ["haha", "lol", "😂", "🤣", "hahaha"],
    replies: ["😂😂", "haha ra 😂"] },
  { match: ["bagunna", "fine", "good", "super", "baagunna"],
    replies: ["super ra 😄", "good good 👍"] },
  { match: ["🥺", "😢", "😭", "😔", "☹️", "😞", "sad"],
    replies: ["enti ra em aindi? 🥺", "ayyo enti ra, cheppu em aindi"] },
  { match: ["ok", "okay", "sare", "k", "ohk", "hmm", "avunu", "avnu", "ha", "haa", "yes", "s"],
    replies: ["sare ra 👍", "👍"] },
  { match: ["hi", "hii", "hiii", "hello", "hey", "hai", "హాయ్"],
    replies: ["hi ra, em chestunnav? 😄", "hey ra! ela unnav?", "hi ra, cheppu"] },
];
const MEDIA_REPLIES = ["chusa ra 👍", "super ra 😄"];
const DEFAULT_REPLIES = ["ippudu konchem busy ra, tarvata reply chestha 🙏"];

const pick = arr => arr[Math.floor(Math.random() * arr.length)];
const escape = s => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

function ruleReply(text) {
  const t = text.toLowerCase();
  for (const rule of RULES) {
    for (const word of rule.match) {
      const isLatin = /^[\x00-\x7F ]+$/.test(word);
      const hit = isLatin
        ? new RegExp(`(^|[^a-z])${escape(word)}([^a-z]|$)`).test(t) // whole word
        : t.includes(word); // emojis / Telugu script
      if (hit) return pick(rule.replies);
    }
  }
  return null;
}

async function localAiReply(text) {
  if (!OLLAMA_MODEL) return null;
  console.log("   🤖 asking local AI...");
  try {
    const res = await fetch("http://localhost:11434/api/chat", {
      method: "POST",
      body: JSON.stringify({
        model: OLLAMA_MODEL,
        stream: false,
        keep_alive: "60m", // keep the model in memory so replies stay fast
        options: { num_predict: 60 }, // short replies = faster
        messages: [
          { role: "system", content: "Reply like a young Telugu friend texting on WhatsApp: very short (1 line), casual Telugu written in English letters (Tenglish), e.g. 'em ledu ra, intlo unna. nuvvu?'. Never say you are an AI. Never agree to plans or money; say 'nenu malli cheptha'." },
          { role: "user", content: text },
        ],
      }),
      signal: AbortSignal.timeout(45000), // give up after 45s → default reply
    });
    const data = await res.json();
    return data?.message?.content?.trim() || null;
  } catch (e) {
    console.log(`   🤖 local AI failed (${e.name === "TimeoutError" ? "too slow" : "is Ollama running?"})`);
    return null; // fall back to default reply
  }
}

// Load the model into memory at startup so the first reply isn't slow
if (OLLAMA_MODEL) {
  console.log("⏳ Warming up local AI (first time can take a minute)...");
  fetch("http://localhost:11434/api/generate", {
    method: "POST", body: JSON.stringify({ model: OLLAMA_MODEL, keep_alive: "60m" }),
  }).then(() => console.log("🤖 Local AI ready")).catch(() => console.log("⚠️ Ollama not running, using rules only"));
}

let paused = false;
const sleep = ms => new Promise(r => setTimeout(r, ms));
const textOf = m =>
  m.message?.conversation || m.message?.extendedTextMessage?.text ||
  m.message?.imageMessage?.caption || m.message?.videoMessage?.caption || "";
const isMedia = m => !!(m.message?.imageMessage || m.message?.videoMessage ||
  m.message?.audioMessage || m.message?.stickerMessage || m.message?.documentMessage);

async function start() {
  const { state, saveCreds } = await useMultiFileAuthState("auth"); // login is saved in the "auth" folder
  const sock = makeWASocket({
    auth: state,
    logger: pino({ level: "silent" }),
    browser: Browsers.windows("Desktop"),
    syncFullHistory: false, // don't download old chats → fast login
    markOnlineOnConnect: false, // you still get notifications on your phone
  });
  sock.ev.on("creds.update", saveCreds);

  sock.ev.on("connection.update", ({ connection, lastDisconnect, qr }) => {
    if (qr) {
      console.log("Scan this QR in WhatsApp → Linked devices → Link a device:");
      qrcode.generate(qr, { small: true });
    }
    if (connection === "open")
      console.log(`✅ Reply agent running (${OLLAMA_MODEL ? "rules + local AI" : "rules only"}).`);
    if (connection === "close") {
      const code = lastDisconnect?.error?.output?.statusCode;
      if (code === DisconnectReason.loggedOut) {
        console.log("❌ Logged out. Delete the 'auth' folder and run npm start to scan again.");
      } else {
        console.log("⚠️ Connection dropped, reconnecting...");
        start();
      }
    }
  });

  sock.ev.on("messages.upsert", async ({ messages, type }) => {
    for (const m of messages) {
      try {
        const jid = m.key.remoteJid;
        if (!m.message || jid === "status@broadcast") continue;
        const text = textOf(m).trim();

        // Commands: send in your "Message yourself" chat
        if (m.key.fromMe) {
          const cmd = text.toLowerCase();
          if (cmd === "!pause") { paused = true; await sock.sendMessage(jid, { text: "⏸️ Auto-reply paused" }); }
          if (cmd === "!resume") { paused = false; await sock.sendMessage(jid, { text: "▶️ Auto-reply on" }); }
          continue;
        }
        if (type !== "notify") continue; // only new incoming messages

        // Real phone number (newer WhatsApp may hide it behind an "@lid" id)
        const pn = m.key.senderPn || m.key.remoteJidAlt || m.key.participantPn || jid;
        const number = pn.split("@")[0].split(":")[0];
        console.log(`📩 Got message from ${number}: ${text || "[media]"}`);

        if (paused) { console.log("   skipped: paused (send !resume)"); continue; }
        if (jid.endsWith("@g.us") && !REPLY_IN_GROUPS) { console.log("   skipped: group chat"); continue; }
        if (ALLOWED.length && !ALLOWED.includes(number)) {
          console.log(`   skipped: ${number} is not in ALLOWED_NUMBERS`); continue;
        }

        let reply;
        if (!text && isMedia(m)) reply = pick(MEDIA_REPLIES);
        else if (text) reply = ruleReply(text) || (await localAiReply(text)) || pick(DEFAULT_REPLIES);
        if (!reply) continue;

        await sock.readMessages([m.key]);
        await sock.sendPresenceUpdate("composing", jid);
        await sleep(MIN_DELAY + Math.random() * (MAX_DELAY - MIN_DELAY));
        await sock.sendPresenceUpdate("paused", jid);
        await sock.sendMessage(jid, { text: reply });
        console.log(`   → ${reply}`);
      } catch (err) {
        console.error("Error replying:", err.message);
      }
    }
  });
}

console.log("⏳ Connecting to WhatsApp...");
start();
