const PROXY_URL = "https://black-silence-e788.balasanthoshb.workers.dev";
// Your Cloudflare Worker URL (keeps the REST Countries key private)

// Open-Meteo needs no key, so the browser calls it directly
const OPEN_METEO_URL = "https://api.open-meteo.com/v1/forecast";

// Public country list for suggestions (no API calls while typing)
const COUNTRIES_URLS = [
  "https://cdn.jsdelivr.net/gh/mledoze/countries@master/countries.json",
  "https://cdn.jsdelivr.net/gh/mledoze/countries@main/countries.json",
  "https://raw.githubusercontent.com/mledoze/countries/master/countries.json"
];

const form = document.getElementById("search-form");
const input = document.getElementById("search-input");
const statusEl = document.getElementById("status");
const countryCard = document.getElementById("country-card");
const weatherCard = document.getElementById("weather-card");
const chipsEl = document.getElementById("chips");
const recentEl = document.getElementById("recent");
const suggestionsEl = document.getElementById("suggestions");

const SUGGESTIONS = ["Japan", "Brazil", "India", "Kenya", "Norway", "Australia"];
const MAX_RECENT = 6;
const MAX_SUGGESTIONS = 6;
const recent = [];

let allCountries = [];
let currentMatches = [];
let activeIndex = -1;

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

// Show unexpected script errors on the page
window.addEventListener("error", (event) => {
  setStatus("Script error: " + event.message, true);
});

// Escape text before inserting it into HTML
function esc(value) {
  const div = document.createElement("div");
  div.textContent = value ?? "";
  return div.innerHTML;
}

function setStatus(message, isError = false) {
  statusEl.textContent = message;
  statusEl.classList.toggle("error", isError);
}

/* ---------- Data loading ---------- */

// Turns one raw record from countries.json into the shape the app uses.
// Returns null if the record is missing the essentials, so it is skipped.
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

// Parses the whole file: keeps valid records and sorts them by name
function parseCountries(json) {
  if (!Array.isArray(json)) throw new Error("Country file is not an array");
  return json
    .map(parseCountry)
    .filter(Boolean)
    .sort((a, b) => a.names.common.localeCompare(b.names.common));
}

// Downloads the country list once, trying each URL in turn
async function loadAllCountries() {
  for (const url of COUNTRIES_URLS) {
    try {
      const res = await fetch(url);
      if (!res.ok) continue;
      allCountries = parseCountries(await res.json());
      console.log("Loaded countries:", allCountries.length);
      return;
    } catch (err) {
      console.warn("Could not load from", url, err);
    }
  }
  setStatus("Suggestions unavailable: country list could not be loaded.", true);
}

// Detailed country data, via the Worker
async function fetchCountry(name) {
  const res = await fetch(`${PROXY_URL}?q=${encodeURIComponent(name)}`);
  if (!res.ok) throw new Error("Country service unavailable.");

  const json = await res.json();
  const results = json.data?.objects ?? [];
  if (results.length === 0) throw new Error(`No country found for "${name}".`);

  return (
    results.find((c) => c.names.common.toLowerCase() === name.toLowerCase()) ||
    results[0]
  );
}

async function fetchWeather(lat, lon) {
  const params = new URLSearchParams({
    latitude: lat,
    longitude: lon,
    current: "temperature_2m,relative_humidity_2m,wind_speed_10m,weather_code",
    timezone: "auto"
  });
  const res = await fetch(`${OPEN_METEO_URL}?${params}`);
  if (!res.ok) throw new Error("Weather service unavailable.");
  const data = await res.json();
  return data.current;
}

/* ---------- Suggestions (local filtering, no API calls) ---------- */

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

function loadSuggestions(q) {
  const needle = q.toLowerCase();
  currentMatches = allCountries
    .filter((c) => c.names.common.toLowerCase().startsWith(needle))
    .slice(0, MAX_SUGGESTIONS);
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

/* ---------- Rendering ---------- */

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
    lat: capitalObj?.coordinates?.lat,
    lng: capitalObj?.coordinates?.lng,
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

/* ---------- Main flow ---------- */

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

/* ---------- Startup ---------- */

document.addEventListener("DOMContentLoaded", () => {
  loadAllCountries();
  renderChips();
  renderRecent();
  search("Japan");
});
