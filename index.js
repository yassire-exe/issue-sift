require('dotenv').config();
const express = require('express');
const fs = require('fs');
const crypto = require('crypto');
const Sentiment = require('sentiment');
const { franc } = require('franc');
const { createAppAuth } = require('@octokit/auth-app');
const { Octokit } = require('@octokit/rest');

const app = express();
const privateKey = fs.readFileSync(process.env.PRIVATE_KEY_PATH, 'utf8');
const sentiment = new Sentiment();

// Returns an object with emoji, label and tone based on the issue text.
function detectEmotion(text) {
  const lower = text.toLowerCase();
  const result = sentiment.analyze(text);

  const urgentWords = ['urgent', 'asap', 'critical', 'broken', 'crash', 'down', 'emergency', 'plante', 'cassé', 'aide'];
  const frustratedWords = ['again', 'still', 'why', 'annoying', 'frustrating', 'impossible', 'encore', 'toujours', 'pourquoi'];
  const joyWords = ['thanks', 'awesome', 'love', 'great', 'amazing', 'perfect', 'merci', 'génial', 'super', 'parfait'];

  const hasUrgent = urgentWords.some(w => lower.includes(w));
  const hasFrustrated = frustratedWords.some(w => lower.includes(w));
  const hasJoy = joyWords.some(w => lower.includes(w));

  if (hasUrgent) return { emoji: '🔥', label: 'urgent', tone: 'urgent' };
  if (hasFrustrated) return { emoji: '💢', label: 'tendu', tone: 'frustrated' };
  if (hasJoy || result.score >= 3) return { emoji: '😊', label: 'positif', tone: 'positive' };
  if (result.score <= -3) return { emoji: '😟', label: 'négatif', tone: 'negative' };

  return { emoji: '🤔', label: 'à clarifier', tone: 'neutral' };
}

// Creates a short summary from the issue body.
function generateSummary(body) {
  if (!body || body.trim() === '') {
    return "_No description provided._";
  }
  let cleanText = body.replace(/[#*`>]/g, '').replace(/\n/g, ' ').trim();
  if (cleanText.length > 150) {
    cleanText = cleanText.substring(0, 150) + '...';
  }
  return `> **TL;DR:** ${cleanText}`;
}

// Builds the reply in English or French depending on the detected language.
function buildReply(emotion, author, repoName, lang) {
  const replies = {
    eng: {
      urgent: `🔥 **${author}**, thanks for flagging this. We can tell it's urgent — the team will look into it first.\n\n> If you have logs or steps to reproduce, drop them in a comment. It helps a lot.`,
      frustrated: `💢 **${author}**, we get the frustration. Thanks for sticking around and reporting this.\n\n> Could you tell us when it started and what you already tried? We'll dig into it.`,
      positive: `😊 Thanks **${author}** for the kind words! Really glad you like it.\n\n> We'll keep this in mind for the future of \`${repoName}\`.`,
      negative: `😟 **${author}**, thanks for the honest feedback. We take it seriously.\n\n> Feel free to clarify what exactly isn't working, we want to understand.`,
      neutral: `🤔 Thanks **${author}** for opening this issue!\n\n> Could you add a bit more context (version, environment, what you expected)? It helps us a lot.`,
    },
    fra: {
      urgent: `🔥 **${author}**, merci d'avoir signalé ça. On voit que c'est urgent — l'équipe va regarder ça en priorité.\n\n> Si tu as des logs ou des étapes de reproduction, ajoute-les en commentaire, ça accélère énormément.`,
      frustrated: `💢 **${author}**, on comprend la frustration. Merci de persévérer et de nous faire remonter ça.\n\n> Peux-tu nous dire depuis quand ça arrive et ce que tu as déjà essayé ? On va creuser.`,
      positive: `😊 Merci **${author}** pour ce retour enthousiaste ! Ça fait plaisir.\n\n> On garde ça en tête pour la suite de \`${repoName}\`.`,
      negative: `😟 **${author}**, merci pour ce retour. On prend le problème au sérieux.\n\n> N'hésite pas à préciser ce qui ne va pas exactement, on veut bien comprendre.`,
      neutral: `🤔 Merci **${author}** pour cette issue !\n\n> Peux-tu préciser un peu le contexte (version, environnement, ce que tu attendais) ? Ça nous aide à bien cerner.`,
    }
  };

  const selectedLang = lang === 'fra' ? 'fra' : 'eng';
  return replies[selectedLang][emotion.tone];
}

// Keeps the raw body around so we can verify the webhook signature.
app.use(express.json({
  verify: (req, res, buf) => { req.rawBody = buf; }
}));

// Compares the GitHub signature with a locally computed one.
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

// Exchanges the installation ID for a short-lived access token.
async function getInstallationOctokit(installationId) {
  const auth = createAppAuth({
    appId: process.env.APP_ID,
    privateKey: privateKey,
    installationId: installationId,
  });

  const { token } = await auth({ type: 'installation' });
  return new Octokit({ auth: token });
}

app.post('/webhook', async (req, res) => {
  if (!verifySignature(req)) {
    console.log('Invalid signature');
    return res.status(401).send('Invalid signature');
  }

  res.status(200).send('OK');

  const event = req.headers['x-github-event'];
  const payload = req.body;

  if (event !== 'issues' || payload.action !== 'opened') return;

  const { installation, repository, issue } = payload;
  const owner = repository.owner.login;
  const repo = repository.name;

  console.log(`New issue #${issue.number} on ${owner}/${repo}`);

  try {
    const octokit = await getInstallationOctokit(installation.id);
    const text = `${issue.title} ${issue.body || ''}`;

    let detectedLang = franc(text);
    const wordCount = text.trim().split(/\s+/).length;

    // Fallback for short texts
    if (wordCount < 10) {
      const frenchIndicators = ['le', 'la', 'les', 'de', 'et', 'un', 'une', 'des', 'ce', 'cette', 'est', 'sont', 'pour', 'comment', 'pourquoi', 'merci', 'bonjour'];
      const words = text.toLowerCase().split(/\W+/);
      const isLikelyFrench = frenchIndicators.some(w => words.includes(w));
      if (!isLikelyFrench) {
        detectedLang = 'eng';
      }
    }

    console.log(`Detected language: ${detectedLang}`);

    const emotion = detectEmotion(text);
    console.log(`Detected emotion: ${emotion.label}`);

    const colors = {
      urgent: 'b60205',
      tendu: 'd93f0b',
      positif: '0e8a16',
      négatif: '5319e7',
      'à clarifier': 'fbca04',
    };

    // Create the label only if it doesn't exist yet.
    try {
      await octokit.rest.issues.getLabel({ owner, repo, name: emotion.label });
    } catch {
      await octokit.rest.issues.createLabel({
        owner,
        repo,
        name: emotion.label,
        color: colors[emotion.label] || 'cccccc',
        description: `Issues tagged as "${emotion.label}" by IssueSift`,
      });
    }

    await octokit.rest.issues.addLabels({
      owner,
      repo,
      issue_number: issue.number,
      labels: [emotion.label],
    });

    // Urgent issues are assigned to the repository owner.
    if (emotion.tone === 'urgent') {
      try {
        await octokit.rest.issues.addAssignees({
          owner,
          repo,
          issue_number: issue.number,
          assignees: [owner],
        });
        console.log(`Urgent issue assigned to ${owner}`);
      } catch (err) {
        console.log(`Could not assign: ${err.message}`);
      }
    }

    // Build the final IssueSift report
    const summary = generateSummary(issue.body);
    const baseReply = buildReply(emotion, issue.user.login, repo, detectedLang);
    
    const finalReply = `### 🤖 IssueSift Report\n\n${summary}\n\n---\n\n${baseReply}\n\n---\n*🤖 Handled automatically by [IssueSift](https://github.com/yassire-exe/issue-sift)*`;

    await octokit.rest.issues.createComment({
      owner,
      repo,
      issue_number: issue.number,
      body: finalReply,
    });

    console.log(`Done: ${owner}/${repo}#${issue.number}`);
  } catch (err) {
    console.error('Error:', err.message);
  }
});

app.listen(process.env.PORT || 3000, () => {
  console.log(`IssueSift listening on port ${process.env.PORT || 3000}`);
});
