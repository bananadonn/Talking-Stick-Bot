# Talking Stick Bot

A Discord bot that brings structured, fair discussion to voice channels. Inspired by the "talking stick" concept — only the person holding the stick has the floor — this bot lets users request moderated speaking sessions that are approved by admins and managed through interactive Discord buttons.

## How It Works

1. A user with the designated role runs `!requeststick <minutes>` while in a voice channel
2. An approval request is sent to the channel with Approve/Deny buttons (admins only)
3. If approved, the stick holder gets a live control panel to mute and unmute other members in the voice channel
4. The session automatically ends after the requested duration, unmuting all participants

## Features

- Role-gated session requests
- Admin approval workflow with interactive embeds
- Real-time mute/unmute control panel with one button per voice channel member
- Automatic session expiry with cleanup (all users unmuted)
- Voice channel validation — requests expire if the user leaves before approval

## Setup

**Requirements:** Node.js 18+, a Discord bot token

1. Clone the repo and install dependencies:
```bash
npm install
```

2. Create a `config.json` file in the root directory:
```json
{
  "token": "YOUR_BOT_TOKEN",
  "stickHolderRole": "Stick Holder"
}
```

3. In the [Discord Developer Portal](https://discord.com/developers/applications), enable the following **Privileged Gateway Intents** for your bot:
   - Server Members Intent
   - Message Content Intent

4. Invite the bot to your server with the following permissions: `Mute Members`, `Read Messages`, `Send Messages`, `Use Slash Commands`

5. Start the bot:
```bash
node bot.js
```

## Commands

| Command | Description |
|---|---|
| `!requeststick <minutes>` | Request a stick session (1–120 minutes). Must be in a voice channel and have the configured role. |

## Tech Stack

- [discord.js](https://discord.js.org/) v14
- Node.js
