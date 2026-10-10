window.addEventListener("error", (event) => {
  const el = document.getElementById("status");
  if (el) {
    el.textContent = "Script error: " + event.message;
    el.classList.add("error");
  }
});
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

async function fetchCountry(name) {
  const res = await fetch(`https://restcountries.com/v3.1/name/${encodeURIComponent(name)}`);
  if (res.status === 404) throw new Error(`No country found for "${name}". Try another spelling.`);
  if (!res.ok) throw new Error("The country service is unavailable right now.");

  const results = await res.json();
  return (
    results.find((c) => c.name.common.toLowerCase() === name.toLowerCase()) ||
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
  const res = await fetch(`https://api.open-meteo.com/v1/forecast?${params}`);
  if (!res.ok) throw new Error("Weather service unavailable.");
  const data = await res.json();
  return data.current;
}

function renderCountry(c) {
  const capital = c.capital?.[0] ?? "—";
  const population = c.population?.toLocaleString() ?? "—";
  const currencies = Object.values(c.currencies ?? {})
    .map((cur) => (cur.symbol ? `${cur.name} (${cur.symbol})` : cur.name))
    .join(", ") || "—";
  const languages = Object.values(c.languages ?? {}).join(", ") || "—";
  const subregion = c.subregion ? ` · ${c.subregion}` : "";

  countryCard.innerHTML = `
    <div class="country-head">
      <img src="${esc(c.flags.svg)}" alt="${esc(c.flags.alt || `Flag of ${c.name.common}`)}" />
      <div>
        <h2>${esc(c.name.common)}</h2>
        <div class="region">${esc(c.region)}${esc(subregion)}</div>
      </div>
    </div>
    <div class="stats">
      <div class="stat"><span class="label">Capital</span><span class="value">${esc(capital)}</span></div>
      <div class="stat"><span class="label">Population</span><span class="value">${esc(population)}</span></div>
      <div class="stat"><span class="label">Currency</span><span class="value">${esc(currencies)}</span></div>
      <div class="stat"><span class="label">Code</span><span class="value">${esc(c.cca2)} · ${esc(c.cca3)}</span></div>
      <div class="stat wide"><span class="label">Languages</span><span class="value">${esc(languages)}</span></div>
    </div>
  `;
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
    renderCountry(country);
    addRecent(country.name.common);
    setStatus("");

    // Prefer the capital's coordinates; fall back to the country centre
    const [lat, lon] = country.capitalInfo?.latlng ?? country.latlng;
    weatherCard.innerHTML = `<div class="placeholder">Loading weather…</div>`;

    try {
      const current = await fetchWeather(lat, lon);
      renderWeather(current, country.capital?.[0] ?? country.name.common);
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

renderChips();
renderRecent();
search("Japan");
