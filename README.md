# IssueSift 🪄

> **The intelligent issue triage for maintainers.** Stop drowning in issues. IssueSift automatically analyzes, labels, and routes new issues so you can focus on what matters.

[![GitHub stars](https://img.shields.io/github/stars/yassire-exe/issue-sift?style=social)](https://github.com/yassire-exe/issue-sift)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![PRs Welcome](https://img.shields.io/badge/PRs-welcome-brightgreen.svg)](https://github.com/yassire-exe/issue-sift/pulls)

## ✨ Why IssueSift?

Maintainers get flooded with issues. Some are urgent bug reports, some are frustrated rants, and some are just questions. Reading through all of them to figure out what's what takes hours.

IssueSift acts as your personal triage assistant. It reads the issue, summarizes it, detects the emotional tone and language, and applies the right label and assignment.

## 🚀 Features

- **📝 TL;DR Summary**: Automatically extracts the core problem of the issue so you don't have to read a 500-word essay.
- **🌍 Language Detection**: Detects if the user is speaking English or French and replies in their language.
- **🧠 Emotional Tone Analysis**: Detects if an issue is `urgent` 🚨, `frustrated` 💢, `positive` 😊, `negative` 😟, or needs `clarification` 🤔.
- **👤 Smart Assignment**: Routes urgent issues directly to the repository owner.
- **🏷️ Auto-Labeling**: Tags issues with beautiful, color-coded labels.

## 📦 Quick Start (Local Development)

1. Clone the repo and install dependencies:
   ```bash
   git clone https://github.com/yassire-exe/issue-sift.git
   cd issue-sift
   npm install
