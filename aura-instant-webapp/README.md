# Aura Instant Studio

A browser-ready static web app for:

- Text → Image
- Image → Image (Quick Remix in-browser)
- Image → Image (AI Remix with optional Pollinations upload key)
- Image → Video (Motion Clip in-browser)

## Open instantly

You can use it in three ways:

1. Open `index.html` directly in your browser
2. Upload the folder to Netlify Drop
3. Deploy the folder to Vercel or GitHub Pages

## What works without any setup

- **Text → Image**
- **Quick Remix**
- **Motion Clip**

## What needs an optional key

- **AI Remix**

AI Remix uploads your reference image first, then passes that uploaded URL into the image-to-image request. Put your key into the settings card inside the app. It is stored only in your browser's localStorage.

## Files

- `index.html` — app shell
- `styles.css` — custom styling
- `app.js` — browser logic
- `manifest.webmanifest` — PWA manifest
- `sw.js` — service worker for app shell caching
- `netlify.toml` — static deploy config
- `vercel.json` — static deploy config
- `.nojekyll` — GitHub Pages compatibility

## Notes

- The app keeps `safe=true` on Pollinations image generation.
- Motion Clip is browser-rendered WebM, so it is immediate and free.
- Remote providers may apply their own rate limits, watermarks, or policy enforcement.
