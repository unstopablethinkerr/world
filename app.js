const PROXY_URL = "https://black-silence-e788.balasanthoshb.workers.dev";
/* ============ Settings ============ */

// Open-Meteo needs no key, so the browser calls it directly
const OPEN_METEO_URL = "https://api.open-meteo.com/v1/forecast";

// Country list for suggestions, tried in order
const COUNTRIES_URLS = [
  "https://cdn.jsdelivr.net/gh/mledoze/countries@master/countries.json",
  "https://cdn.jsdelivr.net/gh/mledoze/countries@main/countries.json",
  "https://raw.githubusercontent.com/mledoze/countries/master/countries.json"
];

// Each check stays visible at least this long. Four checks at 2.5 s ≈ 10 s of loading
const MIN_STEP_MS = 2500;

// A check fails if the server doesn't answer within this time
const REQUEST_TIMEOUT_MS = 8000;

// Used if the visitor's country can't be detected
const FALLBACK_COUNTRY = "Japan";

const TOKYO = { lat: 35.6762, lng: 139.6503 };
const SUGGESTIONS = ["Japan", "Brazil", "India", "Kenya", "Norway", "Australia"];
const MAX_SUGGESTIONS = 8;
const MAX_RECENT = 6;

// WMO weather codes used by Open-Meteo
const WEATHER_CODES = {
  0: "Clear sky", 1: "Mainly clear", 2: "Partly cloudy", 3: "Overcast",
  45: "Fog", 48: "Rime fog",
  51: "Light drizzle", 53: "Drizzle", 55: "Heavy drizzle",
  61: "Light rain", 63: "Rain", 65: "Heavy rain",
  71: "Light snow", 73: "Snow", 75: "Heavy snow",
  80: "Rain showers", 81: "Showers", 82: "Violent showers",
  95: "Thunderstorm", 96: "Thunderstorm with hail", 99: "Severe thunderstorm"
};

/* ============ Elements and state ============ */

const $ = (id) => document.getElementById(id);

const loaderEl = $("loader");
const appEl = $("app");
const checksEl = $("checks");
const loaderMsg = $("loader-msg");
const progressBar = $("progress-bar");
const exploreBtn = $("explore-btn");
const retryBtn = $("retry-btn");

const form = $("search-form");
const input = $("search-input");
const statusEl = $("status");
const countryCard = $("country-card");
const weatherCard = $("weather-card");
const chipsEl = $("chips");
const recentEl = $("recent");
const suggestionsEl = $("suggestions");

const STEP_IDS = ["page", "worker", "countries", "weather"];
const countryCache = new Map();
const recent = [];

let allCountries = [];
let currentMatches = [];
let activeIndex = -1;
let visitorCode = null; // two-letter code, e.g. "IN", or null if unknown

/* ============ Helpers ============ */

function esc(value) {
  const div = document.createElement("div");
  div.textContent = value ?? "";
  return div.innerHTML;
}

function setStatus(message, isError = false) {
  statusEl.textContent = message;
  statusEl.classList.toggle("error", isError);
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// fetch that gives up after REQUEST_TIMEOUT_MS
async function fetchWithTimeout(url, options = {}) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  try {
    return await fetch(url, { ...options, signal: controller.signal });
  } catch (err) {
    if (err.name === "AbortError") throw new Error("Timed out. Check your connection.");
    throw new Error("Network error. Check your connection.");
  } finally {
    clearTimeout(timer);
  }
}

/* ============ Loading screen UI ============ */

const MARK = {
  pending: '<span class="dot"></span>',
  running: '<span class="spinner"></span>',
  ok: '<svg viewBox="0 0 24 24" aria-hidden="true"><path class="tick" d="M5 12.5l4.5 4.5L19 7.5"/></svg>',
  fail: '<svg viewBox="0 0 24 24" aria-hidden="true"><path class="cross" d="M7 7l10 10M17 7L7 17"/></svg>'
};

function setStep(id, state, detail = "") {
  const li = checksEl.querySelector(`[data-step="${id}"]`);
  li.dataset.state = state;
  li.querySelector(".mark").innerHTML = MARK[state];
  li.querySelector(".detail").textContent = detail;
  updateProgress();
}

function updateProgress() {
  const done = STEP_IDS.filter(
    (id) => checksEl.querySelector(`[data-step="${id}"]`).dataset.state === "ok"
  ).length;
  progressBar.style.width = `${(done / STEP_IDS.length) * 100}%`;
}

// Runs one check, shows its state, and keeps it visible for MIN_STEP_MS
async function runStep(id, task) {
  setStep(id, "running");
  const started = performance.now();
  let passed = false;

  try {
    const detail = await task();
    setStep(id, "ok", detail);
    passed = true;
  } catch (err) {
    setStep(id, "fail", err.message);
  }

  const elapsed = performance.now() - started;
  if (elapsed < MIN_STEP_MS) await sleep(MIN_STEP_MS - elapsed);
  return passed;
}

/* ============ The four checks ============ */

async function checkPage() {
  const required = [form, input, statusEl, countryCard, weatherCard, chipsEl, recentEl, suggestionsEl];
  if (required.some((el) => !el)) throw new Error("Page elements are missing.");
  return "All page parts found";
}

async function checkWorker() {
  if (PROXY_URL.includes("yourname")) throw new Error("Set PROXY_URL in app.js first.");

  // Confirm the country API answers with real data
  const res = await fetchWithTimeout(`${PROXY_URL}?q=japan`);
  if (!res.ok) throw new Error(`Worker returned HTTP ${res.status}.`);

  const json = await res.json();
  const results = json.data?.objects ?? [];
  if (results.length === 0) throw new Error("Worker answered but returned no data.");

  const japan = results.find((c) => c.names?.common?.toLowerCase() === "japan") || results[0];
  countryCache.set("japan", japan);

  // Find out where the visitor is, so the dashboard can start with their country
  visitorCode = await detectVisitorCountry();
  return visitorCode
    ? `Country API working · you're in ${visitorCode}`
    : "Country API working · location not detected";
}

async function checkCountries() {
  for (const url of COUNTRIES_URLS) {
    try {
      const res = await fetchWithTimeout(url);
      if (!res.ok) continue;
      allCountries = parseCountries(await res.json());
      if (allCountries.length === 0) continue;
      return `${allCountries.length} countries ready`;
    } catch (err) {
      // try the next URL
    }
  }
  throw new Error("Country list could not be downloaded.");
}

async function checkWeather() {
  const current = await fetchWeather(TOKYO.lat, TOKYO.lng);
  return `Tokyo is ${Math.round(current.temperature_2m)}°C right now`;
}

async function runAllChecks() {
  exploreBtn.disabled = true;
  exploreBtn.classList.remove("ready");
  retryBtn.hidden = true;
  loaderMsg.textContent = "Running checks…";
  STEP_IDS.forEach((id) => setStep(id, "pending"));
  progressBar.style.width = "0%";

  const results = [
    await runStep("page", checkPage),
    await runStep("worker", checkWorker),
    await runStep("countries", checkCountries),
    await runStep("weather", checkWeather)
  ];

  if (results.every(Boolean)) {
    loaderMsg.textContent = "All checks passed. You're good to go.";
    exploreBtn.disabled = false;
    exploreBtn.classList.add("ready");
  } else {
    loaderMsg.textContent = "Some checks failed. Check your connection, then retry.";
    retryBtn.hidden = false;
  }
}

/* ============ Visitor location ============ */

// Asks the Worker for the visitor's country code. Returns null if unknown.
async function detectVisitorCountry() {
  try {
    const res = await fetchWithTimeout(`${PROXY_URL}?where=1`);
    if (!res.ok) return null;
    const json = await res.json();
    return json.country ?? null;
  } catch (err) {
    return null;
  }
}

// Picks the starting country name: the visitor's, or the fallback
function startingCountry() {
  if (visitorCode) {
    const match = allCountries.find((c) => c.codes.alpha_2 === visitorCode);
    if (match) return match.names.common;
  }
  return FALLBACK_COUNTRY;
}

/* ============ Data parsing and loading ============ */

// Turns one raw record from countries.json into the shape the app uses.
// Returns null if the record is missing the essentials.
function parseCountry(raw) {
  const name = raw?.name?.common;
  const code2 = raw?.cca2;
  if (!name || !code2) return null;

  return {
    names: { common: name },
    flag: {
      url_svg: raw.flags?.svg ?? `https://flagcdn.com/w40/${code2.toLowerCase()}.png`,
      emoji: raw.flag ?? ""
    },
    capitals: (raw.capital ?? []).map((n) => ({ name: n })),
    codes: { alpha_2: code2, alpha_3: raw.cca3 ?? "" },
    latlng: Array.isArray(raw.latlng) ? raw.latlng : null
  };
}

function parseCountries(json) {
  if (!Array.isArray(json)) throw new Error("Country file is not an array.");
  return json
    .map(parseCountry)
    .filter(Boolean)
    .sort((a, b) => a.names.common.localeCompare(b.names.common));
}

// Detailed country data, via the Worker. Cached so repeat visits are instant.
async function fetchCountry(name) {
  const key = name.toLowerCase();
  if (countryCache.has(key)) return countryCache.get(key);

  const res = await fetchWithTimeout(`${PROXY_URL}?q=${encodeURIComponent(name)}`);
  if (!res.ok) throw new Error("Country service unavailable.");

  const json = await res.json();
  const results = json.data?.objects ?? [];
  const match = results.find((c) => c.names.common.toLowerCase() === key) || results[0];
  if (!match) throw new Error(`No country found for "${name}".`);

  countryCache.set(key, match);
  return match;
}

async function fetchWeather(lat, lon) {
  const params = new URLSearchParams({
    latitude: lat,
    longitude: lon,
    current: "temperature_2m,relative_humidity_2m,wind_speed_10m,weather_code",
    timezone: "auto"
  });
  const res = await fetchWithTimeout(`${OPEN_METEO_URL}?${params}`);
  if (!res.ok) throw new Error("Weather service unavailable.");
  const data = await res.json();
  return data.current;
}

/* ============ Suggestions (local filtering, no API calls) ============ */

function hideSuggestions() {
  suggestionsEl.hidden = true;
  suggestionsEl.innerHTML = "";
  currentMatches = [];
  activeIndex = -1;
}

function renderSuggestions(list) {
  suggestionsEl.innerHTML = "";
  activeIndex = -1;
  if (list.length === 0) return hideSuggestions();

  list.forEach((c) => {
    const li = document.createElement("li");
    li.innerHTML = `<img class="flag" src="${esc(c.flag.url_svg)}" alt="" /><span>${esc(c.names.common)}</span>`;
    // mousedown keeps focus in the input long enough for the click to register
    li.addEventListener("mousedown", (e) => {
      e.preventDefault();
      pick(c.names.common);
    });
    suggestionsEl.appendChild(li);
  });
  suggestionsEl.hidden = false;
}

// Lowercase and remove accents, so "cote" matches "Côte d'Ivoire"
function normalize(text) {
  return (text ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim();
}

// Tier 1: names that start with the query. Tier 2: names that contain it anywhere.
// Each tier stays alphabetical, because allCountries is already sorted.
function findSuggestions(query) {
  const needle = normalize(query);
  if (needle.length < 2) return [];

  const startsWith = [];
  const contains = [];

  for (const country of allCountries) {
    const name = normalize(country.names.common);
    if (name.startsWith(needle)) {
      startsWith.push(country);
    } else if (name.includes(needle)) {
      contains.push(country);
    }
  }

  return [...startsWith, ...contains].slice(0, MAX_SUGGESTIONS);
}

function loadSuggestions(q) {
  currentMatches = findSuggestions(q);
  renderSuggestions(currentMatches);
}

function pick(name) {
  hideSuggestions();
  search(name);
}

input.addEventListener("input", () => {
  const q = input.value.trim();
  if (q.length < 2) return hideSuggestions();
  loadSuggestions(q);
});

input.addEventListener("keydown", (e) => {
  const items = suggestionsEl.querySelectorAll("li");
  if (suggestionsEl.hidden || items.length === 0) return;

  if (e.key === "ArrowDown") {
    e.preventDefault();
    activeIndex = (activeIndex + 1) % items.length;
  } else if (e.key === "ArrowUp") {
    e.preventDefault();
    activeIndex = (activeIndex - 1 + items.length) % items.length;
  } else if (e.key === "Enter" && activeIndex >= 0) {
    e.preventDefault();
    pick(currentMatches[activeIndex].names.common);
    return;
  } else if (e.key === "Escape") {
    hideSuggestions();
    return;
  } else {
    return;
  }

  items.forEach((li, i) => li.classList.toggle("active", i === activeIndex));
});

input.addEventListener("blur", () => setTimeout(hideSuggestions, 150));

/* ============ Rendering ============ */

function renderCountry(c) {
  const capitalObj = c.capitals?.find((x) => x.primary) ?? c.capitals?.[0];
  const capital = capitalObj?.name ?? "—";
  const population = c.population?.toLocaleString() ?? "—";
  const currencies = (c.currencies ?? [])
    .map((cur) => (cur.symbol ? `${cur.name} (${cur.symbol})` : cur.name))
    .join(", ") || "—";
  const languages = (c.languages ?? []).map((l) => l.name).join(", ") || "—";
  const subregion = c.subregion ? ` · ${c.subregion}` : "";

  countryCard.innerHTML = `
    <div class="country-head">
      <img src="${esc(c.flag.url_svg)}" alt="Flag of ${esc(c.names.common)}" />
      <div>
        <h2>${esc(c.names.common)}</h2>
        <div class="region">${esc(c.region)}${esc(subregion)}</div>
      </div>
    </div>
    <div class="stats">
      <div class="stat"><span class="label">Capital</span><span class="value">${esc(capital)}</span></div>
      <div class="stat"><span class="label">Population</span><span class="value">${esc(population)}</span></div>
      <div class="stat"><span class="label">Currency</span><span class="value">${esc(currencies)}</span></div>
      <div class="stat"><span class="label">Code</span><span class="value">${esc(c.codes.alpha_2)} · ${esc(c.codes.alpha_3)}</span></div>
      <div class="stat wide"><span class="label">Languages</span><span class="value">${esc(languages)}</span></div>
    </div>
  `;

  return {
    lat: capitalObj?.coordinates?.lat ?? c.latlng?.[0],
    lng: capitalObj?.coordinates?.lng ?? c.latlng?.[1],
    capitalName: capital
  };
}

function renderWeather(w, capitalName) {
  const description = WEATHER_CODES[w.weather_code] ?? "Unknown conditions";
  weatherCard.innerHTML = `
    <div class="weather-main">
      <div class="temp">${Math.round(w.temperature_2m)}°C</div>
      <div class="condition">
        <div class="city">${esc(capitalName)}</div>
        <div class="desc">${esc(description)}</div>
      </div>
    </div>
    <div class="stats">
      <div class="stat"><span class="label">Humidity</span><span class="value">${w.relative_humidity_2m}%</span></div>
      <div class="stat"><span class="label">Wind</span><span class="value">${w.wind_speed_10m} km/h</span></div>
      <div class="stat wide"><span class="label">Observed</span><span class="value">${esc(w.time.replace("T", " "))}</span></div>
    </div>
  `;
}

function makeChip(name) {
  const btn = document.createElement("button");
  btn.type = "button";
  btn.className = "chip";
  btn.textContent = name;
  btn.addEventListener("click", () => search(name));
  return btn;
}

function renderChips() {
  chipsEl.innerHTML = "";
  SUGGESTIONS.forEach((name) => chipsEl.appendChild(makeChip(name)));
}

function renderRecent() {
  recentEl.innerHTML = "";
  if (recent.length === 0) {
    recentEl.innerHTML = `<span class="status">Nothing yet.</span>`;
    return;
  }
  recent.forEach((name) => recentEl.appendChild(makeChip(name)));
}

function addRecent(name) {
  const index = recent.findIndex((n) => n.toLowerCase() === name.toLowerCase());
  if (index !== -1) recent.splice(index, 1);
  recent.unshift(name);
  if (recent.length > MAX_RECENT) recent.length = MAX_RECENT;
  renderRecent();
}

/* ============ Main flow ============ */

async function search(query) {
  const name = query.trim();
  if (!name) return;

  hideSuggestions();
  input.value = name;
  setStatus("Loading country details…");
  weatherCard.innerHTML = `<div class="placeholder">Waiting for country data…</div>`;

  try {
    const country = await fetchCountry(name);
    const { lat, lng, capitalName } = renderCountry(country);
    addRecent(country.names.common);
    setStatus("");

    weatherCard.innerHTML = `<div class="placeholder">Loading weather…</div>`;
    try {
      const current = await fetchWeather(lat, lng);
      renderWeather(current, capitalName);
    } catch (weatherErr) {
      weatherCard.innerHTML = `<div class="placeholder">${esc(weatherErr.message)}</div>`;
    }
  } catch (err) {
    setStatus(err.message, true);
    countryCard.innerHTML = `<div class="placeholder">Try another country.</div>`;
    weatherCard.innerHTML = `<div class="placeholder">Weather appears after a country is found.</div>`;
  }
}

form.addEventListener("submit", (e) => {
  e.preventDefault();
  search(input.value);
});

/* ============ Startup ============ */

// Unexpected script errors show on the loading screen
window.addEventListener("error", (event) => {
  loaderMsg.textContent = "Script error: " + event.message;
  loaderMsg.style.color = "var(--danger)";
});

exploreBtn.addEventListener("click", () => {
  const start = startingCountry();
  loaderMsg.textContent = visitorCode
    ? `Starting with ${start}, based on your location.`
    : `Starting with ${start}.`;

  loaderEl.classList.add("leave");
  setTimeout(() => {
    loaderEl.hidden = true;
    appEl.hidden = false;
    appEl.classList.add("enter");
    search(start);
    input.focus();
  }, 500);
});

retryBtn.addEventListener("click", runAllChecks);

document.addEventListener("DOMContentLoaded", () => {
  renderChips();
  renderRecent();
  runAllChecks();
});
