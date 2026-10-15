// MoodBoard Bot - Reads the emotional tone of GitHub issues
// and reacts accordingly.

require('dotenv').config();
const express = require('express');
const fs = require('fs');
const crypto = require('crypto');
const Sentiment = require('sentiment');
const { createAppAuth } = require('@octokit/auth-app');
const { Octokit } = require('@octokit/rest');

const app = express();
const privateKey = fs.readFileSync(process.env.PRIVATE_KEY_PATH, 'utf8');
const sentiment = new Sentiment();

// ------------------------------------------------------------
// 1. Figure out the dominant emotion
// ------------------------------------------------------------
function detectEmotion(text) {
  const lower = text.toLowerCase();
  const result = sentiment.analyze(text);

  // Keywords that usually signal a specific mood.
  // Checked before the sentiment score, because some words
  // like "crash" score neutral but are clearly urgent.
  const urgentWords = ['urgent', 'asap', 'critical', 'broken', 'crash', 'down', 'emergency'];
  const frustratedWords = ['again', 'still', 'why', 'annoying', 'frustrating', 'impossible'];
  const joyWords = ['thanks', 'awesome', 'love', 'great', 'amazing', 'perfect'];

  const hasUrgent = urgentWords.some(w => lower.includes(w));
  const hasFrustrated = frustratedWords.some(w => lower.includes(w));
  const hasJoy = joyWords.some(w => lower.includes(w));

  if (hasUrgent) return { emoji: '🔥', label: 'urgent', tone: 'urgent' };
  if (hasFrustrated) return { emoji: '💢', label: 'tendu', tone: 'frustrated' };
  if (hasJoy || result.score >= 3) return { emoji: '😊', label: 'positif', tone: 'positive' };
  if (result.score <= -3) return { emoji: '😟', label: 'négatif', tone: 'negative' };

  return { emoji: '🤔', label: 'à clarifier', tone: 'neutral' };
}

// ------------------------------------------------------------
// 2. Build a reply that fits the detected tone
// ------------------------------------------------------------
function buildReply(emotion, author, repoName) {
  const replies = {
    urgent: `🔥 **${author}**, thanks for flagging this. We can tell it's urgent — the team will look into it first.\n\n> If you have logs or steps to reproduce, drop them in a comment. It helps a lot.`,
    frustrated: `💢 **${author}**, we get the frustration. Thanks for sticking around and reporting this.\n\n> Could you tell us when it started and what you already tried? We'll dig into it.`,
    positive: `😊 Thanks **${author}** for the kind words! Really glad you like it.\n\n> We'll keep this in mind for the future of \`${repoName}\`.`,
    negative: `😟 **${author}**, thanks for the honest feedback. We take it seriously.\n\n> Feel free to clarify what exactly isn't working, we want to understand.`,
    neutral: `🤔 Thanks **${author}** for opening this issue!\n\n> Could you add a bit more context (version, environment, what you expected)? It helps us a lot.`,
  };
  return replies[emotion.tone];
}

// ------------------------------------------------------------
// 3. Verify the webhook signature (security)
// ------------------------------------------------------------
// GitHub signs every webhook with the secret we set.
// If the signature doesn't match, someone else is hitting our
// endpoint — we drop the request.
app.use(express.json({
  verify: (req, res, buf) => { req.rawBody = buf; }
}));

function verifySignature(req) {
  const signature = req.headers['x-hub-signature-256'];
  if (!signature) return false;
  const hmac = crypto.createHmac('sha256', process.env.WEBHOOK_SECRET);
  const digest = 'sha256=' + hmac.update(req.rawBody).digest('hex');
  try {
    return crypto.timingSafeEqual(Buffer.from(signature), Buffer.from(digest));
  } catch {
    return false;
  }
}

// ------------------------------------------------------------
// 4. Authenticate as the GitHub App
// ------------------------------------------------------------
// Each installation has its own ID. We swap it for a token
// that lasts one hour.
async function getInstallationOctokit(installationId) {
  const auth = createAppAuth({
    appId: process.env.APP_ID,
    privateKey: privateKey,
    installationId: installationId,
  });
  const { token } = await auth({ type: 'installation' });
  return new Octokit({ auth: token });
}

// ------------------------------------------------------------
// 5. Main webhook handler
// ------------------------------------------------------------
app.post('/webhook', async (req, res) => {
  if (!verifySignature(req)) {
    console.log('❌ Invalid signature');
    return res.status(401).send('Invalid signature');
  }

  // Reply fast, otherwise GitHub thinks we timed out.
  res.status(200).send('OK');

  const event = req.headers['x-github-event'];
  const payload = req.body;

  // We only care about newly opened issues.
  if (event !== 'issues' || payload.action !== 'opened') return;

  const { installation, repository, issue } = payload;
  const owner = repository.owner.login;
  const repo = repository.name;

  console.log(`📥 New issue #${issue.number} on ${owner}/${repo}`);

  try {
    const octokit = await getInstallationOctokit(installation.id);

    // Combine title and body, then analyze the mood.
    const text = `${issue.title} ${issue.body || ''}`;
    const emotion = detectEmotion(text);
    console.log(`🎭 Detected emotion: ${emotion.emoji} ${emotion.label}`);

    // Each mood has its own color on the label.
    const colors = {
      urgent: 'b60205',
      tendu: 'd93f0b',
      positif: '0e8a16',
      négatif: '5319e7',
      'à clarifier': 'fbca04',
    };

    // Create the label if it doesn't exist yet.
    try {
      await octokit.rest.issues.getLabel({ owner, repo, name: emotion.label });
    } catch {
      await octokit.rest.issues.createLabel({
        owner, repo,
        name: emotion.label,
        color: colors[emotion.label] || 'cccccc',
        description: `Issues tagged as "${emotion.label}" by MoodBoard Bot`,
      });
    }

    // Stick the label on the issue.
    await octokit.rest.issues.addLabels({
      owner, repo,
      issue_number: issue.number,
      labels: [emotion.label],
    });

    // Post the tailored reply.
    const reply = buildReply(emotion, issue.user.login, repo);
    await octokit.rest.issues.createComment({
      owner, repo,
      issue_number: issue.number,
      body: reply,
    });

    console.log(`✅ Done: ${owner}/${repo}#${issue.number}`);
  } catch (err) {
    console.error('❌ Error:', err.message);
  }
});

// ------------------------------------------------------------
// 6. Start the server
// ------------------------------------------------------------
app.listen(process.env.PORT || 3000, () => {
  console.log(`🚀 MoodBoard Bot listening on port ${process.env.PORT || 3000}`);
});
