# Conversation Viewer

Ultra-minimalist conversation data viewer with Apple-inspired design.

## Features

✨ **Clean & Simple**

- Minimalist UI with maximum whitespace
- Black/white/gray color scheme + blue accent
- No clutter, only essential information

📊 **Full Analytics**

- OrgID with copy button
- Platform & Status badges
- Duration & message count
- Avg/Median response time (Agent & Bot separately)

🎯 **Easy to Use**

- Load JSON file
- Search & filter
- Sort by date/messages/duration
- Click to view details

## Quick Start

1. Open `index.html` in browser
2. Click "Load JSON"
3. Select your conversation data file
4. Done!

## Deploy to GitHub Pages

```bash
# 1. Create repo on GitHub
# 2. Push code
git init
git add .
git commit -m "Initial commit"
git remote add origin <your-repo-url>
git push -u origin main

# 3. Enable GitHub Pages
# Go to Settings > Pages
# Source: main branch / viewer folder
```

Your viewer will be live at: `https://<username>.github.io/<repo-name>/`

## Tech Stack

- **Pure HTML/CSS/JS** - No frameworks needed
- **~500 lines total** - Ultra lightweight
- **Zero dependencies** - Just open and use

## Why Not React?

For this use case, vanilla JS is better:

- ✅ Simpler deployment (no build step)
- ✅ Faster load time (no bundle)
- ✅ Easier to maintain
- ✅ Perfect for internal tools

React would be overkill here.

## File Structure

```
viewer/
├── index.html    # Structure
├── style.css     # Minimalist styles
├── script.js     # Logic
└── README.md     # This file
```

## Browser Support

Works on all modern browsers (Chrome, Firefox, Safari, Edge).

---

Made with ❤️ for data scientists
