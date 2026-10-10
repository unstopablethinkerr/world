const PROXY_URL = "https://black-silence-e788.balasanthoshb.workers.dev";
const OPEN_METEO_URL = "https://api.open-meteo.com/v1/forecast";

const form = document.getElementById("search-form");
const input = document.getElementById("search-input");
const statusEl = document.getElementById("status");
const countryCard = document.getElementById("country-card");
const weatherCard = document.getElementById("weather-card");
const chipsEl = document.getElementById("chips");
const recentEl = document.getElementById("recent");

const SUGGESTIONS = ["Japan", "Brazil", "India", "Kenya", "Norway", "Australia"];
const MAX_RECENT = 6;
const recent = [];

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

// Show any unexpected script error on the page
window.addEventListener("error", (event) => {
  statusEl.textContent = "Script error: " + event.message;
  statusEl.classList.add("error");
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

// Calls the Cloudflare Worker, which adds the API key on the server
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

function renderChips() {
  chipsEl.innerHTML = "";
  SUGGESTIONS.forEach((name) => {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "chip";
    btn.textContent = name;
    btn.addEventListener("click", () => search(name));
    chipsEl.appendChild(btn);
  });
}

function renderRecent() {
  recentEl.innerHTML = "";
  if (recent.length === 0) {
    recentEl.innerHTML = `<span class="status">Nothing yet.</span>`;
    return;
  }
  recent.forEach((name) => {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "chip";
    btn.textContent = name;
    btn.addEventListener("click", () => search(name));
    recentEl.appendChild(btn);
  });
}

function addRecent(name) {
  const index = recent.findIndex((n) => n.toLowerCase() === name.toLowerCase());
  if (index !== -1) recent.splice(index, 1);
  recent.unshift(name);
  if (recent.length > MAX_RECENT) recent.length = MAX_RECENT;
  renderRecent();
}

async function search(query) {
  const name = query.trim();
  if (!name) return;

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

document.addEventListener("DOMContentLoaded", () => {
  renderChips();
  renderRecent();
  search("Japan");
});
