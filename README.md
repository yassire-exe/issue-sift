# MoodBoard Bot

A GitHub App that reads the emotional tone of new issues and reacts accordingly.

## What it does

When a new issue is opened, the bot:
1. Analyzes the title and body to detect the dominant emotion (urgent, frustrated, positive, negative, neutral)
2. Adds a colored label matching the detected emotion
3. Posts a tailored comment adapted to the tone

## Why

Maintainers get flooded with issues. Some are urgent, some are frustrated rants, some are just questions. MoodBoard Bot helps triage them instantly by tagging the mood and replying with empathy.

## Setup

1. Clone the repo
2. Install dependencies: `npm install`
3. Create a `.env` file with `APP_ID`, `WEBHOOK_SECRET`, `PRIVATE_KEY_PATH`, `PORT`
4. Add your GitHub App private key as `private-key.pem`
5. Run: `node index.js`
6. Expose the server with ngrok: `ngrok http 3000`
7. Set the webhook URL in your GitHub App settings

## Permissions

- Issues: Read & write
- Metadata: Read-only

## Events

- Issues

## Stack

- Node.js
- Express
- Octokit
- sentiment

## Status

Work in progress.
