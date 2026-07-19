# Bale Bot Integration Notes

This document records the verified setup for sending a direct message through
the official Bale Bot API. It is intentionally independent from the Nobino
application; the Nobino-specific scheduling details are documented below.

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

For a private conversation, the collaborator must first open the bot and send a
message. Bots cannot start an unsolicited private conversation with a user.

The supported discovery flow is:

1. The collaborator opens the bot in Bale.
2. The collaborator sends `/chatid`.
3. The bot replies with the private chat ID.
4. The collaborator sends that ID to an admin.
5. The admin opens `/admin/lunch-notifications`.
6. The admin selects the destination type `گفت‌وگو یا گروه بله`.
7. The admin enters the name and chat ID.
8. The admin uses `ارسال همین حالا` to test the connection.

The bot also accepts `/chatid@bot_username` for convenience when the bot
username is known. The command only reveals the current private chat ID; it does
not activate any Nobino setting by itself.

If you need to verify the raw API behavior manually, the current chat ID is
still available through `getUpdates` from `result[].message.chat.id` after the
user has sent any message. For a production bot, update consumption must track
`update_id` and use an appropriate `offset` to avoid processing the same update
repeatedly.

The destination ID should remain private and must not be published in chat
groups, issue trackers, or Git.

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
minute. The endpoint consumes `getUpdates`, delivers new in-app notifications
to linked users, and also sends the food summary (breakfast and lunch) to every active report
recipient configured in `/admin/lunch-notifications`:

- A recipient can be a direct chat/group ID or a Nobino user with an active
  Bale connection.
- User recipients use their current active connection at send and retry time.

```bash
curl --fail --silent --show-error -X POST \
  -H "Authorization: Bearer ${BALE_SYNC_SECRET}" \
  "${APP_BASE_URL}/api/integrations/bale/sync"
```

Delivery happens outside reservation transactions. Each attempted direct-message
delivery is stored separately, failed sends are retried up to three times, and
notifications created before the user's latest connection are not sent
retroactively.

Food reports use the same one-minute scheduler. A report becomes eligible one
minute after the shared food cutoff for its target date. Days without food service do
not produce a message, disabled food reservations also suppress the report, and
active service days with zero reservations still send a zero-count breakfast and
lunch summary grouped by delivery location.
Because Bale does not provide an idempotency key, an ambiguous network failure
can still lead to a duplicate food report on retry.
