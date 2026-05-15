# Rock Tree — Private Jungle Residences

Luxury real estate website for Rock Tree, a collection of five private jungle residences in Tinamastes, Costa Rica.

**Live site:** https://phenomenal-youtiao-e4f2b4.netlify.app

---

## Project Structure

```
rock-tree/
├── index.html        # Single-page website (all CSS/JS/images inline)
├── netlify.toml      # Netlify deploy config & cache headers
├── .gitignore
└── README.md
```

## Deploying

This site is connected to Netlify. Any push to `main` will auto-deploy.

```bash
git add .
git commit -m "your update message"
git push origin main
```

Netlify will build and publish within ~30 seconds.

## Making Updates

All content lives in `index.html`. Key sections and their approximate locations:

| Section | Search for |
|---|---|
| Hero headline & pitch | `class="hero-title"` |
| South Florida comparison | `class="compare-strip"` |
| Intro / About | `class="intro"` |
| Specs & Pricing | `class="specs"` |
| Floor plans | `id="floorplans"` |
| Local materials | `class="materials-section"` |
| Amenities gallery | `class="amenities"` |
| Services / Concierge | `id="services"` |
| Location distances | `id="location"` |
| Contact form | `id="contact"` |

## Updating Images

Images are embedded as base64 data URIs directly in the HTML. To replace an image:
1. Convert your new image to base64: `base64 -i yourimage.jpg | pbcopy`
2. Find the relevant `<img src="data:image/jpeg;base64,...">` tag
3. Replace the base64 string

Or simply bring the new image back to Claude and ask to swap it.

## Custom Domain

To connect a custom domain (e.g. `selvaalta.com`):
1. Go to Netlify → Domain Management
2. Add custom domain
3. Update your DNS to point to Netlify's servers

---

*Built with pure HTML/CSS/JS — no build tools, no dependencies.*
