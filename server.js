const express = require("express");
const https = require("https");
const crypto = require("crypto");

const app = express();

// Telegram API only needs a relatively small payload for this use case.
// Increase if your screenshots are larger.
app.use(express.urlencoded({ extended: false, limit: "12mb" }));

const PORT = process.env.PORT || 3000;
const BOT_TOKEN = process.env.BOT_TOKEN;
const CHAT_ID = process.env.CHAT_ID;
const SERVER_KEY = process.env.SERVER_KEY || "";

function telegramRequest(method, form) {
  return new Promise((resolve, reject) => {
    const body = new URLSearchParams(form).toString();

    const req = https.request({
      hostname: "api.telegram.org",
      path: `/bot${BOT_TOKEN}/${method}`,
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
        "Content-Length": Buffer.byteLength(body)
      },
      timeout: 30000
    }, (res) => {
      let data = "";
      res.setEncoding("utf8");
      res.on("data", chunk => data += chunk);
      res.on("end", () => {
        try {
          const json = JSON.parse(data);
          resolve({ statusCode: res.statusCode, json });
        } catch {
          resolve({ statusCode: res.statusCode, json: null, raw: data });
        }
      });
    });

    req.on("timeout", () => req.destroy(new Error("Telegram request timed out")));
    req.on("error", reject);
    req.write(body);
    req.end();
  });
}

function cleanBase64(value) {
  if (typeof value !== "string") return null;
  // Accept both raw Base64 and data:image/...;base64,... forms.
  const comma = value.indexOf(",");
  if (value.startsWith("data:") && comma >= 0) {
    value = value.slice(comma + 1);
  }
  value = value.replace(/\s/g, "");
  if (!value || value.length > 11_000_000) return null;
  if (!/^[A-Za-z0-9+/]*={0,2}$/.test(value)) return null;
  return value;
}

function validKey(req) {
  if (!SERVER_KEY) return true;
  const supplied = req.get("X-AutoFeedback-Key") || req.body.server_key || "";
  return crypto.timingSafeEqual(
    Buffer.from(String(supplied)),
    Buffer.from(String(SERVER_KEY))
  );
}

app.get("/", (_req, res) => {
  res.json({ ok: true, service: "AutoFeedback Telegram bridge" });
});

app.post("/send_feedback", async (req, res) => {
  if (!validKey(req)) {
    return res.status(401).json({ status: false, error: "unauthorized" });
  }

  if (!BOT_TOKEN || !CHAT_ID) {
    return res.status(500).json({ status: false, error: "server_not_configured" });
  }

  const image = cleanBase64(req.body.base64_image);
  const caption = typeof req.body.caption === "string"
    ? req.body.caption.slice(0, 1024)
    : "";

  if (!image) {
    return res.status(400).json({ status: false, error: "invalid_base64_image" });
  }

  try {
    const buffer = Buffer.from(image, "base64");

    // Telegram's sendPhoto endpoint needs multipart/form-data.
    // Build it here so the Lua client can continue sending Base64.
    const boundary = "----AutoFeedback" + crypto.randomBytes(12).toString("hex");

    const parts = [];
    const addText = (name, value) => {
      parts.push(
        Buffer.from(
          `--${boundary}\r\n` +
          `Content-Disposition: form-data; name="${name}"\r\n\r\n` +
          `${value}\r\n`
        )
      );
    };

    addText("chat_id", CHAT_ID);
    addText("caption", caption);
    addText("parse_mode", "HTML");

    parts.push(
      Buffer.from(
        `--${boundary}\r\n` +
        `Content-Disposition: form-data; name="photo"; filename="feedback.jpg"\r\n` +
        `Content-Type: image/jpeg\r\n\r\n`
      )
    );
    parts.push(buffer);
    parts.push(Buffer.from(`\r\n--${boundary}--\r\n`));

    const body = Buffer.concat(parts);

    const result = await new Promise((resolve, reject) => {
      const request = https.request({
        hostname: "api.telegram.org",
        path: `/bot${BOT_TOKEN}/sendPhoto`,
        method: "POST",
        headers: {
          "Content-Type": `multipart/form-data; boundary=${boundary}`,
          "Content-Length": body.length
        },
        timeout: 30000
      }, response => {
        let data = "";
        response.setEncoding("utf8");
        response.on("data", chunk => data += chunk);
        response.on("end", () => {
          try {
            resolve(JSON.parse(data));
          } catch {
            resolve({ ok: false, description: data.slice(0, 300) });
          }
        });
      });

      request.on("timeout", () => request.destroy(new Error("Telegram request timed out")));
      request.on("error", reject);
      request.write(body);
      request.end();
    });

    if (result && result.ok) {
      return res.json({ status: true });
    }

    console.error("Telegram error:", result);
    return res.status(502).json({
      status: false,
      error: "telegram_send_failed"
    });
  } catch (err) {
    console.error("Send error:", err);
    return res.status(502).json({
      status: false,
      error: "telegram_request_failed"
    });
  }
});

app.listen(PORT, () => {
  console.log(`AutoFeedback server listening on port ${PORT}`);
});
