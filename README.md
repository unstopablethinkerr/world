# World Travel Dashboard

A small, key-free-in-the-browser travel dashboard. Search any country to see its facts and the current weather in its capital. The page greets you with a loading screen that checks each part of the app before you start, and it opens with your own country when it can detect it.

**Live demo:** https://unstopablethinkerr.github.io/world/

## Features

- **Startup checks:** the loading screen tests the page, the country API, the country list, and the weather service, then shows a tick or a clear error for each one.
- **Smart start:** the dashboard opens with the visitor's country, or Japan if it can't be detected.
- **Instant suggestions:** typing shows matching countries from a local list. Names that start with your letters appear first, followed by names that contain them. Case and accents are ignored, so "cote" finds "Côte d'Ivoire".
- **Country details:** flag, capital, population, currency, codes, languages, and region.
- **Live weather:** current temperature, conditions, humidity, and wind for the capital city.
- **Recently explored:** your last six searches, one click away.

## How it works

The app uses three services:

| Part | Purpose | Key needed? |
|---|---|---|
| GitHub Pages | Hosts the HTML, CSS, and JavaScript | No |
| Cloudflare Worker | Adds the REST Countries API key on the server, and reports the visitor's country | Key stored as a Cloudflare secret |
| REST Countries | Detailed country data | Yes (held by the Worker) |
| mledoze/countries (jsDelivr CDN) | Country list for suggestions | No |
| Open-Meteo | Weather | No |

The browser never sees the REST Countries key. Suggestions are filtered locally, so typing doesn't make API calls.

## Project structure

```
world/
├── index.html    Page layout: loading screen and dashboard
├── style.css     Dark theme, animations, responsive layout
└── app.js        Checks, data loading, suggestions, rendering
```

## Setup

### 1. Deploy the Cloudflare Worker

1. Create a Worker in the Cloudflare dashboard (Workers & Pages → Create).
2. Paste the Worker code and click **Deploy**.
3. Go to **Settings → Variables and Secrets**, add a **Secret** named `RC_API_KEY`, and set it to your REST Countries key.
4. Copy your Worker URL (for example `https://rc-proxy.yourname.workers.dev`).

Test it in a browser:
- `?q=japan` should return JSON with Japan in it.
- `?where=1` should return your country code.

### 2. Point the app at your Worker

In `app.js`, set the first constant to your Worker URL:

```javascript
const PROXY_URL = "https://rc-proxy.yourname.workers.dev";
```

### 3. Publish on GitHub Pages

1. Push the files to the repo root.
2. Go to **Settings → Pages**.
3. Set **Source** to *Deploy from a branch*, choose `main` and `/ (root)`, then save.

The site appears at `https://<your-username>.github.io/<repo-name>/` after a minute or two.

## Running locally

Start a simple server from the project folder, then open the address it shows:

```bash
python -m http.server 8000
```

Open `http://localhost:8000`. This address is already allowed by the Worker.

## Customising

- **Startup time:** change `MIN_STEP_MS` in `app.js` (each check stays visible this long, about 10 seconds in total).
- **Fallback country:** change `FALLBACK_COUNTRY` in `app.js`.
- **Quick-pick chips:** edit the `SUGGESTIONS` list.
- **Suggestion count:** change `MAX_SUGGESTIONS`.
- **Colours:** edit the variables at the top of `style.css`.

## Troubleshooting

| Symptom | Likely cause |
|---|---|
| "Set PROXY_URL in app.js first" | The placeholder URL hasn't been replaced. |
| "Worker returned HTTP 401" | The `RC_API_KEY` secret is missing or wrong. |
| Country check fails with "Network error" | An ad blocker, VPN, or network filter is blocking the request. |
| No suggestions appear | The country list failed to load. Check the console for the message. |
| Dashboard starts with Japan, not your country | Location detection failed (common on localhost), or the Worker hasn't been redeployed. |

## Data sources and credits

- [REST Countries](https://restcountries.com): country details
- [mledoze/countries](https://github.com/mledoze/countries): country list for suggestions
- [Open-Meteo](https://open-meteo.com): weather data
- Flags from the REST Countries and flagcdn.com image sets

## Security notes

- The REST Countries key lives only in the Cloudflare Worker, never in the repository. Don't commit it, and rotate it if it was ever pushed.
- Location is approximate, since it comes from the visitor's IP address, and the Worker doesn't store it.

## Credits

This project was built with the help of these services and open resources:

- **[REST Countries](https://restcountries.com)**: detailed country information (names, capitals, population, currencies, languages)
- **[mledoze/countries](https://github.com/mledoze/countries)**: the open country list that powers the suggestions
- **[Open-Meteo](https://open-meteo.com)**: free weather data for the capital cities
- **[Cloudflare Workers](https://workers.cloudflare.com)**: keeps the API key safe on the server
- **[GitHub Pages](https://pages.github.com)**: hosts the site
- **[flagcdn.com](https://flagcdn.com)**: fallback flag images
- **[Google Fonts](https://fonts.google.com)**: typography, if used

Built by **Unstopable Thinker** as a learning project for Vani Infotech students.
