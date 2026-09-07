# AutoFeedback Telegram Bridge

Server kecil untuk AutoFeedback.lua.

Alurnya:
Lua -> POST /send_feedback (Base64 + caption) -> server -> Telegram sendPhoto

## 1. Install
Node.js 18+ diperlukan.

```bash
npm install
npm start
```

## 2. Environment
Set:
- BOT_TOKEN
- CHAT_ID
- SERVER_KEY (opsional)

Jangan taruh token bot di source code atau commit ke Git.

## 3. Endpoint
POST `/send_feedback`

Form fields:
- `base64_image`
- `caption`
- `server_key` (opsional jika SERVER_KEY dipakai)

Response sukses:
```json
{"status":true}
```

Response gagal:
```json
{"status":false,"error":"..."}
```

## 4. Lua
Ganti ServerURL menjadi:

https://DOMAIN-DEPLOYMENT-LO/send_feedback

Kalau memakai SERVER_KEY, tambahkan header `X-AutoFeedback-Key` pada request Lua.
