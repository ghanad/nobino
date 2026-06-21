# Bale Bot Integration Notes

This document records the verified setup for sending a direct message through
the official Bale Bot API. It is intentionally independent from the Nobino
application; application scheduling and reservation-count integration are not
implemented yet.

The flow below was manually verified on 2026-06-21.

## Official API

- Documentation: <https://docs.bale.ai/>
- Bot creation: <https://ble.ir/botfather>
- API base URL:

  ```text
  https://tapi.bale.ai/bot<TOKEN>/<METHOD_NAME>
  ```

Bale's Bot API is based on the Telegram Bot API with some differences. The
official Bale documentation remains the source of truth for supported methods
and parameters.

## Required Values

Use these environment variable names for local tests and future integration:

```text
BALE_BOT_TOKEN=<token received from @botfather>
BALE_CHAT_ID=<destination chat ID>
```

Never commit real values to Git, include them in logs, or place them in
screenshots. The token is a credential and must be stored as a secret in
deployed environments.

## Create and Verify a Bot

1. Open `@botfather` in Bale and create a bot.
2. Store the returned token securely.
3. Load it into the current shell without echoing it:

   ```bash
   read -s BALE_BOT_TOKEN
   export BALE_BOT_TOKEN
   ```

4. Verify the token:

   ```bash
   curl -sS "https://tapi.bale.ai/bot${BALE_BOT_TOKEN}/getMe"
   ```

A valid token returns a JSON object with `"ok": true`.

## Find the Destination Chat ID

The destination user must first open the bot and send a message such as
`/start`. Bots cannot start an unsolicited private conversation with a user.

After the user sends a message, request the bot updates:

```bash
curl -sS "https://tapi.bale.ai/bot${BALE_BOT_TOKEN}/getUpdates"
```

Read the destination ID from `result[].message.chat.id`:

```json
{
  "ok": true,
  "result": [
    {
      "message": {
        "chat": {
          "id": 123456789,
          "type": "private"
        }
      }
    }
  ]
}
```

Store the ID separately from the token:

```bash
export BALE_CHAT_ID="123456789"
```

If `result` is empty, send a new message to the bot and call `getUpdates`
again. For a production bot, update consumption must track `update_id` and use
an appropriate `offset` to avoid processing the same update repeatedly. This is
not needed when `getUpdates` is used only once to discover a chat ID.

## Send a Test Message

The `sendMessage` method requires `chat_id` and `text`:

```bash
curl -sS -X POST \
  "https://tapi.bale.ai/bot${BALE_BOT_TOKEN}/sendMessage" \
  --data-urlencode "chat_id=${BALE_CHAT_ID}" \
  --data-urlencode "text=Test message from Nobino"
```

The integration is working when the API returns `"ok": true` and the target
user receives the message in Bale.

Equivalent Python test using only the standard library:

```python
import json
import os
import urllib.parse
import urllib.request

token = os.environ["BALE_BOT_TOKEN"]
chat_id = os.environ["BALE_CHAT_ID"]
url = f"https://tapi.bale.ai/bot{token}/sendMessage"
body = urllib.parse.urlencode(
    {"chat_id": chat_id, "text": "Test message from Nobino"}
).encode()

with urllib.request.urlopen(url, data=body, timeout=10) as response:
    result = json.load(response)

if result.get("ok") is not True:
    raise RuntimeError(result.get("description", "Bale API request failed"))

print("Message sent successfully")
```

## Nobino Account Linking and Notification Delivery

The application integration uses these additional environment variables:

```text
APP_BASE_URL=https://nobino.example.com
BALE_BOT_USERNAME=nobino_bot
BALE_SYNC_SECRET=<long random secret>
```

Authenticated users open `/settings/bale`, generate a single-use connection
token, and send the displayed `/connect <token>` command to the bot. Nobino
stores only a SHA-256 hash of the token. It expires after 10 minutes, and the
resulting private `chat.id` is unique across Nobino users.

The deployment scheduler must invoke the protected sync endpoint once per
minute. The endpoint consumes `getUpdates` with a persisted offset and delivers
new in-app notifications to linked users:

```bash
curl --fail --silent --show-error -X POST \
  -H "Authorization: Bearer ${BALE_SYNC_SECRET}" \
  "${APP_BASE_URL}/api/integrations/bale/sync"
```

Delivery happens outside reservation transactions. Each attempted delivery is
stored separately, failed sends are retried up to three times, and notifications
created before the user's latest connection are not sent retroactively.
