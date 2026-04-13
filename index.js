const express = require("express");
const axios = require("axios");
const fs = require("fs");

const app = express();
app.use(express.json());

const BOT_TOKEN = "8236383204:AAGoHFsbWVy73yn17A9xKv5nkxisZkSH1Ac";
const ADMIN_ID = 1361987726;
const CHANNEL = "@phantomxhub";

const API = `https://api.telegram.org/bot${BOT_TOKEN}`;

// FILES
const scriptsFile = "scripts.json";
const subsFile = "subscriptions.json";

// INIT
if (!fs.existsSync(scriptsFile)) fs.writeFileSync(scriptsFile, "{}");
if (!fs.existsSync(subsFile)) fs.writeFileSync(subsFile, "{}");

// HELPERS
const load = (f) => JSON.parse(fs.readFileSync(f));
const save = (f, d) => fs.writeFileSync(f, JSON.stringify(d, null, 2));

const bot = (method, data) => axios.post(`${API}/${method}`, data);

// CHECK JOIN
async function checkJoin(userId) {
  try {
    let res = await axios.get(`${API}/getChatMember`, {
      params: { chat_id: CHANNEL, user_id: userId }
    });
    let s = res.data.result.status;
    return ["member", "administrator", "creator"].includes(s);
  } catch {
    return false;
  }
}

// SUB DAYS
function getSubDays(userId) {
  if (userId == ADMIN_ID) return "Unlimited";
  let subs = load(subsFile);
  if (subs[userId]) {
    let remain = subs[userId] - Date.now();
    return remain > 0 ? Math.ceil(remain / 86400000) : 0;
  }
  return 0;
}

// SHOW SCRIPTS
async function showFolder(chatId, appName) {
  let scripts = load(scriptsFile);
  let btns = [];
  let row = [];
  let found = false;

  for (let id in scripts) {
    let s = scripts[id];
    if (s.app_name == appName && s.status == "active" && s.heading != "INIT_FOLDER") {
      found = true;
      row.push({ text: "🔗 " + s.heading });
      if (row.length == 2) { btns.push(row); row = []; }
    }
  }

  if (row.length) btns.push(row);
  btns.push([{ text: "🚀 Scripts" }]);

  await bot("sendMessage", {
    chat_id: chatId,
    text: found ? `📂 Available for ${appName}` : "❌ No scripts",
    reply_markup: { keyboard: btns, resize_keyboard: true }
  });
}

// WEBHOOK
app.post("/", async (req, res) => {
  let update = req.body;
  let msg = update.message;
  let cb = update.callback_query;

  // CALLBACK
  if (cb) {
    let data = cb.data;
    let chatId = cb.message.chat.id;

    // VERIFY JOIN
    if (data == "verify_join") {
      if (await checkJoin(chatId)) {
        await bot("answerCallbackQuery", { callback_query_id: cb.id, text: "✅ Verified" });
        await bot("sendMessage", {
          chat_id: chatId,
          text: "🎉 Access Granted!",
          reply_markup: {
            keyboard: [["🚀 Scripts", "👤 Profile"], ["💎 Plan"]],
            resize_keyboard: true
          }
        });
      }
    }
  }

  // MESSAGE
  if (msg) {
    let chatId = msg.chat.id;
    let text = msg.text || "";

    // START
    if (text == "/start" || text == "🔙 Back") {
      if (!(await checkJoin(chatId))) {
        return bot("sendMessage", {
          chat_id: chatId,
          text: "⚠️ Join channel first!",
          reply_markup: {
            inline_keyboard: [
              [{ text: "📢 Join", url: "https://t.me/phantomxhub" }],
              [{ text: "✅ Verify", callback_data: "verify_join" }]
            ]
          }
        });
      }

      return bot("sendMessage", {
        chat_id: chatId,
        text: "👋 Welcome to Phantom Bot",
        reply_markup: {
          keyboard: [["🚀 Scripts", "👤 Profile"], ["💎 Plan"]],
          resize_keyboard: true
        }
      });
    }

    // SCRIPTS
    if (text == "🚀 Scripts") {
      if (getSubDays(chatId) === 0) {
        return bot("sendMessage", { chat_id: chatId, text: "⚠️ Premium required" });
      }

      let scripts = load(scriptsFile);
      let cats = [...new Set(Object.values(scripts).map(s => s.app_name))];

      let btns = [];
      let row = [];

      for (let c of cats) {
        if (!c) continue;
        row.push({ text: "📂 " + c });
        if (row.length == 2) { btns.push(row); row = []; }
      }
      if (row.length) btns.push(row);
      btns.push([{ text: "🔙 Back" }]);

      return bot("sendMessage", {
        chat_id: chatId,
        text: "📂 Select App:",
        reply_markup: { keyboard: btns, resize_keyboard: true }
      });
    }

    // OPEN FOLDER
    if (text.startsWith("📂 ")) {
      return showFolder(chatId, text.replace("📂 ", ""));
    }

    // SCRIPT CLICK
    if (text.startsWith("🔗 ")) {
      let name = text.replace("🔗 ", "");
      let scripts = load(scriptsFile);

      for (let id in scripts) {
        let s = scripts[id];
        if (s.heading == name && s.status == "active") {
          return bot("sendMessage", {
            chat_id: chatId,
            text: `🚀 ${s.heading}\n${s.placeholder}`,
            reply_markup: { force_reply: true }
          });
        }
      }
    }

    // EXECUTION
    if (msg.reply_to_message) {
      let reply = msg.reply_to_message.text;
      let scripts = load(scriptsFile);

      for (let id in scripts) {
        let s = scripts[id];
        if (reply.includes(s.heading)) {
          let val = text;
          let url = s.pb_api.replace("{param}", encodeURIComponent(val));

          let resApi = await axios.get(url).catch(() => null);
          let out = resApi?.data || "API Error";

          await bot("sendMessage", {
            chat_id: chatId,
            text: "✅ Result:\n" + JSON.stringify(out).slice(0, 3500)
          });

          return showFolder(chatId, s.app_name);
        }
      }
    }

    // PROFILE
    if (text == "👤 Profile") {
      let days = getSubDays(chatId);
      return bot("sendMessage", {
        chat_id: chatId,
        text: `🆔 ${chatId}\n💎 ${days > 0 || days === "Unlimited" ? "Premium" : "Free"}\n⏳ ${days}`
      });
    }

    // PLAN
    if (text == "💎 Plan") {
      return bot("sendMessage", {
        chat_id: chatId,
        text: "💸 Weekly ₹29\nLifetime ₹999\nContact @Error4040bot"
      });
    }
  }

  res.sendStatus(200);
});

// START SERVER
app.listen(3000, () => console.log("Bot running"));