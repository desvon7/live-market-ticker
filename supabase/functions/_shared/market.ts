// Shared between the Supabase Edge Functions (Deno) and the web app (Vite).
// Keep this file dependency-free so both runtimes can import it directly.

export const sectors = [
  "Information Technology",
  "Communication Services",
  "Consumer Discretionary",
  "Consumer Staples",
  "Financials",
  "Health Care",
  "Industrials",
  "Energy",
  "Materials",
  "Real Estate",
  "Utilities",
] as const;
export type Sector = (typeof sectors)[number];

export type SecurityKind = "stock" | "ETF";
export type Security = { name: string; domain: string; sector: Sector | "ETF"; kind: SecurityKind };

// Verified ticker → company-domain map used for Logo.dev lookups. Dashboard
// overrides (config.domains) take precedence; unknown symbols show initials.
const s = (name: string, domain: string, sector: Sector): Security => ({
  name,
  domain,
  sector,
  kind: "stock",
});
export const registry: Record<string, Security> = {
  NVDA: s("NVIDIA", "nvidia.com", "Information Technology"),
  AAPL: s("Apple", "apple.com", "Information Technology"),
  MSFT: s("Microsoft", "microsoft.com", "Information Technology"),
  AVGO: s("Broadcom", "broadcom.com", "Information Technology"),
  ORCL: s("Oracle", "oracle.com", "Information Technology"),
  PLTR: s("Palantir", "palantir.com", "Information Technology"),
  AMD: s("AMD", "amd.com", "Information Technology"),
  CRM: s("Salesforce", "salesforce.com", "Information Technology"),
  CSCO: s("Cisco", "cisco.com", "Information Technology"),
  IBM: s("IBM", "ibm.com", "Information Technology"),
  ADBE: s("Adobe", "adobe.com", "Information Technology"),
  QCOM: s("Qualcomm", "qualcomm.com", "Information Technology"),
  INTC: s("Intel", "intel.com", "Information Technology"),
  NOW: s("ServiceNow", "servicenow.com", "Information Technology"),
  TXN: s("Texas Instruments", "ti.com", "Information Technology"),

  GOOGL: s("Alphabet", "google.com", "Communication Services"),
  META: s("Meta", "meta.com", "Communication Services"),
  NFLX: s("Netflix", "netflix.com", "Communication Services"),
  TMUS: s("T-Mobile US", "t-mobile.com", "Communication Services"),
  DIS: s("Disney", "disney.com", "Communication Services"),
  VZ: s("Verizon", "verizon.com", "Communication Services"),
  T: s("AT&T", "att.com", "Communication Services"),
  CMCSA: s("Comcast", "comcast.com", "Communication Services"),

  AMZN: s("Amazon", "amazon.com", "Consumer Discretionary"),
  TSLA: s("Tesla", "tesla.com", "Consumer Discretionary"),
  HD: s("Home Depot", "homedepot.com", "Consumer Discretionary"),
  MCD: s("McDonald's", "mcdonalds.com", "Consumer Discretionary"),
  BKNG: s("Booking Holdings", "bookingholdings.com", "Consumer Discretionary"),
  LOW: s("Lowe's", "lowes.com", "Consumer Discretionary"),
  NKE: s("Nike", "nike.com", "Consumer Discretionary"),
  SBUX: s("Starbucks", "starbucks.com", "Consumer Discretionary"),

  WMT: s("Walmart", "walmart.com", "Consumer Staples"),
  COST: s("Costco", "costco.com", "Consumer Staples"),
  PG: s("Procter & Gamble", "pg.com", "Consumer Staples"),
  KO: s("Coca-Cola", "coca-colacompany.com", "Consumer Staples"),
  PEP: s("PepsiCo", "pepsico.com", "Consumer Staples"),
  PM: s("Philip Morris", "pmi.com", "Consumer Staples"),
  MDLZ: s("Mondelez", "mondelezinternational.com", "Consumer Staples"),

  "BRK.B": s("Berkshire Hathaway", "berkshirehathaway.com", "Financials"),
  JPM: s("JPMorgan Chase", "jpmorganchase.com", "Financials"),
  V: s("Visa", "visa.com", "Financials"),
  MA: s("Mastercard", "mastercard.com", "Financials"),
  BAC: s("Bank of America", "bankofamerica.com", "Financials"),
  WFC: s("Wells Fargo", "wellsfargo.com", "Financials"),
  GS: s("Goldman Sachs", "goldmansachs.com", "Financials"),
  MS: s("Morgan Stanley", "morganstanley.com", "Financials"),

  LLY: s("Eli Lilly", "lilly.com", "Health Care"),
  UNH: s("UnitedHealth", "unitedhealthgroup.com", "Health Care"),
  JNJ: s("Johnson & Johnson", "jnj.com", "Health Care"),
  ABBV: s("AbbVie", "abbvie.com", "Health Care"),
  MRK: s("Merck", "merck.com", "Health Care"),
  ABT: s("Abbott", "abbott.com", "Health Care"),
  TMO: s("Thermo Fisher", "thermofisher.com", "Health Care"),
  PFE: s("Pfizer", "pfizer.com", "Health Care"),

  GE: s("GE Aerospace", "geaerospace.com", "Industrials"),
  CAT: s("Caterpillar", "caterpillar.com", "Industrials"),
  RTX: s("RTX", "rtx.com", "Industrials"),
  HON: s("Honeywell", "honeywell.com", "Industrials"),
  UNP: s("Union Pacific", "up.com", "Industrials"),
  BA: s("Boeing", "boeing.com", "Industrials"),
  DE: s("Deere", "deere.com", "Industrials"),
  UPS: s("UPS", "ups.com", "Industrials"),

  XOM: s("ExxonMobil", "exxonmobil.com", "Energy"),
  CVX: s("Chevron", "chevron.com", "Energy"),
  COP: s("ConocoPhillips", "conocophillips.com", "Energy"),
  SLB: s("SLB", "slb.com", "Energy"),
  EOG: s("EOG Resources", "eogresources.com", "Energy"),
  OXY: s("Occidental", "oxy.com", "Energy"),

  LIN: s("Linde", "linde.com", "Materials"),
  SHW: s("Sherwin-Williams", "sherwin-williams.com", "Materials"),
  APD: s("Air Products", "airproducts.com", "Materials"),
  ECL: s("Ecolab", "ecolab.com", "Materials"),
  FCX: s("Freeport-McMoRan", "fcx.com", "Materials"),
  NEM: s("Newmont", "newmont.com", "Materials"),

  PLD: s("Prologis", "prologis.com", "Real Estate"),
  AMT: s("American Tower", "americantower.com", "Real Estate"),
  EQIX: s("Equinix", "equinix.com", "Real Estate"),
  WELL: s("Welltower", "welltower.com", "Real Estate"),
  SPG: s("Simon Property", "simon.com", "Real Estate"),
  O: s("Realty Income", "realtyincome.com", "Real Estate"),

  NEE: s("NextEra Energy", "nexteraenergy.com", "Utilities"),
  SO: s("Southern Company", "southerncompany.com", "Utilities"),
  DUK: s("Duke Energy", "duke-energy.com", "Utilities"),
  CEG: s("Constellation Energy", "constellationenergy.com", "Utilities"),
  AEP: s("American Electric Power", "aep.com", "Utilities"),
  D: s("Dominion Energy", "dominionenergy.com", "Utilities"),

  // Exchange-traded funds. These are ETF share prices, never index values.
  SPY: { name: "SPDR S&P 500 ETF Trust", domain: "ssga.com", sector: "ETF", kind: "ETF" },
  QQQ: { name: "Invesco QQQ Trust", domain: "invesco.com", sector: "ETF", kind: "ETF" },
  DIA: {
    name: "SPDR Dow Jones Industrial Average ETF",
    domain: "ssga.com",
    sector: "ETF",
    kind: "ETF",
  },
  IWM: { name: "iShares Russell 2000 ETF", domain: "ishares.com", sector: "ETF", kind: "ETF" },
};

export const etfSymbols = ["SPY", "QQQ", "DIA", "IWM"] as const;
export type EtfSymbol = (typeof etfSymbols)[number];

// Default editable list for "top" mode (roughly the largest US listings).
export const defaultTopSymbols = [
  "NVDA",
  "MSFT",
  "AAPL",
  "GOOGL",
  "AMZN",
  "META",
  "AVGO",
  "TSLA",
  "BRK.B",
  "JPM",
  "LLY",
  "WMT",
  "ORCL",
  "V",
  "MA",
  "NFLX",
  "XOM",
  "COST",
  "PLTR",
  "JNJ",
];

export const modes = ["top", "sector", "all", "random", "watchlist", "custom"] as const;
export type TickerMode = (typeof modes)[number];
export const modeLabels: Record<TickerMode, string> = {
  top: "Top market tickers",
  sector: "One sector",
  all: "All sectors",
  random: "Random stocks",
  watchlist: "My watchlist",
  custom: "Custom selection",
};

export const speedPresets = { slow: 40, normal: 65, fast: 110 } as const;
export type SpeedPreset = keyof typeof speedPresets | "custom";

export type TickerConfig = {
  appearance: "dark" | "light" | "glass";
  mode: TickerMode;
  sector: Sector;
  // Per-mode stock lists. All are editable from the dashboard.
  topSymbols: string[];
  sectorSymbols: Record<string, string[]>;
  watchlist: string[];
  symbols: string[]; // custom selection
  pinned: string[]; // always first, in this order
  hidden: string[]; // temporarily removed from every mode
  allOrder: "grouped" | "interleaved";
  randomSectors: string[]; // empty = every sector
  randomCount: number;
  randomFavor: "any" | "largecap";
  randomAvoidRecent: boolean;
  shuffleMinutes: number; // 0 = only when "Shuffle now" is pressed
  shuffleSeed: number;
  maxItems: number; // maximum stock entries (ETFs are counted separately)
  etfs: EtfSymbol[];
  showEtfs: boolean;
  news: boolean;
  newsPlacement: "interleaved" | "section";
  newsScope: "general" | "selected";
  height: number;
  speedPreset: SpeedPreset;
  speed: number; // px per second
  fontSize: number;
  logoSize: number;
  opacity: number;
  textColor: string;
  upColor: string;
  downColor: string;
  paused: boolean;
  resetAt: number; // bump to restart the scroll from the beginning
  direction: "left" | "right";
  showNames: boolean;
  showLogos: boolean;
  showSparklines: boolean;
  showStatus: boolean;
  safeArea: number; // px kept clear on safeSide, e.g. for a webcam
  safeSide: "left" | "right";
  domains: Record<string, string>; // logo domain overrides
  logos: Record<string, string>; // logo URL overrides (https)
};

const registrySector = (sector: string) =>
  Object.keys(registry).filter((symbol) => registry[symbol]?.sector === sector);

export const defaultSectorSymbols: Record<string, string[]> = Object.fromEntries(
  sectors.map((sector) => [sector, registrySector(sector).slice(0, 8)]),
);
defaultSectorSymbols["Information Technology"] = [
  "NVDA",
  "AAPL",
  "MSFT",
  "GOOGL",
  "AMZN",
  "META",
  "AVGO",
  "ORCL",
];

export const defaultConfig: TickerConfig = {
  appearance: "dark",
  mode: "sector",
  sector: "Information Technology",
  topSymbols: defaultTopSymbols,
  sectorSymbols: defaultSectorSymbols,
  watchlist: ["NVDA", "AAPL", "MSFT", "GOOGL", "AMZN", "META", "AVGO", "ORCL"],
  symbols: ["NVDA", "AAPL", "MSFT", "GOOGL", "AMZN", "META", "AVGO", "ORCL"],
  pinned: [],
  hidden: [],
  allOrder: "grouped",
  randomSectors: [],
  randomCount: 12,
  randomFavor: "any",
  randomAvoidRecent: true,
  shuffleMinutes: 0,
  shuffleSeed: 1,
  maxItems: 8,
  etfs: ["SPY", "QQQ", "DIA", "IWM"],
  showEtfs: true,
  news: true,
  newsPlacement: "section",
  newsScope: "general",
  height: 104,
  speedPreset: "normal",
  speed: speedPresets.normal,
  fontSize: 20,
  logoSize: 28,
  opacity: 95,
  textColor: "#f5f5f7",
  upColor: "#30d158",
  downColor: "#ff453a",
  paused: false,
  resetAt: 0,
  direction: "left",
  showNames: false,
  showLogos: true,
  showSparklines: false,
  showStatus: true,
  safeArea: 0,
  safeSide: "right",
  domains: {},
  logos: {},
};

export const limits = {
  height: [90, 160],
  speed: [15, 180],
  fontSize: [16, 28],
  logoSize: [24, 48],
  opacity: [0, 100],
  safeArea: [0, 600],
  maxItems: [1, 46],
  randomCount: [1, 46],
  shuffleMinutes: [0, 240],
} as const;

// Finnhub's free WebSocket plan allows 50 symbol subscriptions per connection.
export const MAX_SYMBOLS = 50;
export const MAX_LIST = 60;

const symbolPattern = /^[A-Z][A-Z0-9.-]{0,9}$/;
const domainPattern = /^([a-z0-9-]+\.)+[a-z]{2,}$/;
const colorPattern = /^#[0-9a-f]{6}$/i;

export function normalizeSymbol(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const symbol = value.trim().toUpperCase();
  return symbolPattern.test(symbol) ? symbol : null;
}

// Lovable's editor preview addresses ask for a Lovable login, which OBS can't
// pass, so copied links must point at the published site instead.
export function isLovablePreview(host: string) {
  return (
    /(^|\.)lovableproject(-dev)?\.com$/.test(host) ||
    (/\.lovable\.app$/.test(host) && /^(id-)?preview-/.test(host))
  );
}

// A site address links can be built on: https, public, and not a preview.
export function normalizeOrigin(value: unknown): string | null {
  if (typeof value !== "string" || value.length > 200) return null;
  try {
    const url = new URL(value);
    if (url.protocol !== "https:" || isLovablePreview(url.hostname)) return null;
    if (url.hostname === "localhost" || !url.hostname.includes(".")) return null;
    return url.origin;
  } catch {
    return null;
  }
}

export function normalizeDomain(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const domain = value
    .trim()
    .toLowerCase()
    .replace(/^https?:\/\//, "")
    .replace(/^www\./, "")
    .replace(/\/.*$/, "");
  return domainPattern.test(domain) && domain.length <= 253 ? domain : null;
}

export function normalizeLogoUrl(value: unknown): string | null {
  if (typeof value !== "string" || value.length > 500) return null;
  try {
    const url = new URL(value.trim());
    return url.protocol === "https:" ? url.href : null;
  } catch {
    return null;
  }
}

export function parseSymbolList(value: unknown, max = MAX_LIST): string[] {
  const items = Array.isArray(value)
    ? value
    : typeof value === "string"
      ? value.split(/[\s,]+/)
      : [];
  return [...new Set(items.map(normalizeSymbol).filter((x): x is string => !!x))].slice(0, max);
}

function clamp(value: unknown, [min, max]: readonly [number, number], fallback: number) {
  return typeof value === "number" && Number.isFinite(value)
    ? Math.round(Math.min(max, Math.max(min, value)))
    : fallback;
}

function pick<T extends string>(value: unknown, options: readonly T[], fallback: T): T {
  return options.includes(value as T) ? (value as T) : fallback;
}

function record<T>(
  value: unknown,
  key: (k: string) => string | null,
  val: (v: unknown) => T | null,
) {
  const out: Record<string, T> = {};
  if (value && typeof value === "object" && !Array.isArray(value)) {
    for (const [k, v] of Object.entries(value as Record<string, unknown>).slice(0, 100)) {
      const nk = key(k);
      const nv = val(v);
      if (nk && nv !== null) out[nk] = nv;
    }
  }
  return out;
}

// Coerces anything (an older stored config, a dashboard payload) into a valid
// config, falling back to defaults field by field instead of throwing.
export function sanitizeConfig(input: unknown): TickerConfig {
  const raw = (input && typeof input === "object" ? input : {}) as Record<string, unknown>;
  const d = defaultConfig;
  const bool = (key: keyof TickerConfig) =>
    typeof raw[key] === "boolean" ? (raw[key] as boolean) : (d[key] as boolean);
  const list = (key: keyof TickerConfig, allowEmpty = false) => {
    if (!Array.isArray(raw[key])) return d[key] as string[];
    const parsed = parseSymbolList(raw[key]);
    return parsed.length || allowEmpty ? parsed : (d[key] as string[]);
  };
  const color = (key: "textColor" | "upColor" | "downColor") =>
    typeof raw[key] === "string" && colorPattern.test(raw[key] as string)
      ? (raw[key] as string)
      : d[key];
  const sectorSymbols = { ...d.sectorSymbols };
  for (const [sector, symbols] of Object.entries(
    record(
      raw["sectorSymbols"],
      (k) => ((sectors as readonly string[]).includes(k) ? k : null),
      (v) => (Array.isArray(v) ? parseSymbolList(v) : null),
    ),
  )) {
    if (symbols.length) sectorSymbols[sector] = symbols;
  }
  const speedPreset = pick(
    raw["speedPreset"],
    ["slow", "normal", "fast", "custom"] as const,
    "custom",
  );
  return {
    appearance: pick(raw["appearance"], ["dark", "light", "glass"] as const, d.appearance),
    mode: pick(raw["mode"], modes, d.mode),
    sector: pick(raw["sector"], sectors, d.sector),
    topSymbols: list("topSymbols"),
    sectorSymbols,
    watchlist: list("watchlist"),
    symbols: list("symbols"),
    pinned: list("pinned", true),
    hidden: list("hidden", true),
    allOrder: pick(raw["allOrder"], ["grouped", "interleaved"] as const, d.allOrder),
    randomSectors: Array.isArray(raw["randomSectors"])
      ? sectors.filter((x) => (raw["randomSectors"] as unknown[]).includes(x))
      : d.randomSectors,
    randomCount: clamp(raw["randomCount"], limits.randomCount, d.randomCount),
    randomFavor: pick(raw["randomFavor"], ["any", "largecap"] as const, d.randomFavor),
    randomAvoidRecent: bool("randomAvoidRecent"),
    shuffleMinutes: clamp(raw["shuffleMinutes"], limits.shuffleMinutes, d.shuffleMinutes),
    shuffleSeed:
      typeof raw["shuffleSeed"] === "number" && Number.isSafeInteger(raw["shuffleSeed"])
        ? raw["shuffleSeed"]
        : d.shuffleSeed,
    maxItems: clamp(raw["maxItems"], limits.maxItems, d.maxItems),
    etfs: Array.isArray(raw["etfs"])
      ? etfSymbols.filter((etf) => (raw["etfs"] as unknown[]).includes(etf))
      : d.etfs,
    showEtfs: bool("showEtfs"),
    news: bool("news"),
    newsPlacement: pick(raw["newsPlacement"], ["interleaved", "section"] as const, d.newsPlacement),
    newsScope: pick(raw["newsScope"], ["general", "selected"] as const, d.newsScope),
    height: clamp(raw["height"], limits.height, d.height),
    speedPreset: raw["speedPreset"] === undefined ? d.speedPreset : speedPreset,
    speed:
      speedPreset !== "custom"
        ? speedPresets[speedPreset]
        : clamp(raw["speed"], limits.speed, d.speed),
    fontSize: clamp(raw["fontSize"], limits.fontSize, d.fontSize),
    logoSize: clamp(raw["logoSize"], limits.logoSize, d.logoSize),
    opacity: clamp(raw["opacity"], limits.opacity, d.opacity),
    textColor: color("textColor"),
    upColor: color("upColor"),
    downColor: color("downColor"),
    paused: bool("paused"),
    resetAt:
      typeof raw["resetAt"] === "number" && Number.isFinite(raw["resetAt"])
        ? raw["resetAt"]
        : d.resetAt,
    direction: pick(raw["direction"], ["left", "right"] as const, d.direction),
    showNames: bool("showNames"),
    showLogos: bool("showLogos"),
    showSparklines: bool("showSparklines"),
    showStatus: bool("showStatus"),
    safeArea: clamp(raw["safeArea"], limits.safeArea, d.safeArea),
    safeSide: pick(raw["safeSide"], ["left", "right"] as const, d.safeSide),
    domains: record(raw["domains"], normalizeSymbol, normalizeDomain),
    logos: record(raw["logos"], normalizeSymbol, normalizeLogoUrl),
  };
}

function seededShuffle(pool: string[], seed: number) {
  let state = (Math.abs(Math.floor(seed)) % 2147483646) + 1;
  const rand = () => {
    state = (state * 48271) % 2147483647;
    return state / 2147483647;
  };
  const copy = [...pool];
  for (let i = copy.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [copy[i], copy[j]] = [copy[j] as string, copy[i] as string];
  }
  return copy;
}

export const stockSymbols = () =>
  Object.keys(registry).filter((symbol) => registry[symbol]?.kind === "stock");

// The stock universe for random mode: registry stocks plus any per-sector picks.
function randomPool(config: TickerConfig) {
  const chosen = config.randomSectors.length ? config.randomSectors : [...sectors];
  const pool = new Set<string>();
  for (const sector of chosen) {
    const inSector = [...registrySector(sector), ...(config.sectorSymbols[sector] ?? [])];
    // Registry entries are ordered roughly by size within each sector.
    for (const symbol of config.randomFavor === "largecap" ? inSector.slice(0, 4) : inSector)
      pool.add(symbol);
  }
  if (config.randomFavor === "largecap")
    for (const symbol of config.topSymbols)
      if (!config.randomSectors.length || chosen.includes(registry[symbol]?.sector as Sector))
        pool.add(symbol);
  return [...pool].filter((symbol) => securityKind(symbol) === "stock");
}

export function shuffleSeedAt(config: TickerConfig, now = Date.now()) {
  const bucket = config.shuffleMinutes > 0 ? Math.floor(now / (config.shuffleMinutes * 60_000)) : 0;
  return config.shuffleSeed * 7919 + bucket;
}

function randomSample(config: TickerConfig, now?: number) {
  const pool = randomPool(config);
  const seed = shuffleSeedAt(config, now);
  const count = Math.min(config.randomCount, pool.length);
  if (!config.randomAvoidRecent) return seededShuffle(pool, seed).slice(0, count);
  // Prefer stocks that were not in the previous shuffle, topping up if the pool is small.
  const previous = new Set(seededShuffle(pool, seed - 1).slice(0, count));
  const shuffled = seededShuffle(pool, seed);
  return [
    ...shuffled.filter((x) => !previous.has(x)),
    ...shuffled.filter((x) => previous.has(x)),
  ].slice(0, count);
}

function sectorList(config: TickerConfig, sector: string) {
  return config.sectorSymbols[sector] ?? registrySector(sector);
}

export function stocksForConfig(config: TickerConfig, now?: number): string[] {
  let list: string[];
  switch (config.mode) {
    case "top":
      list = config.topSymbols;
      break;
    case "sector":
      list = sectorList(config, config.sector);
      break;
    case "all": {
      const groups = sectors.map((sector) => sectorList(config, sector));
      if (config.allOrder === "grouped") list = groups.flat();
      else {
        list = [];
        for (let i = 0; i < Math.max(...groups.map((g) => g.length)); i++)
          for (const g of groups) if (g[i]) list.push(g[i] as string);
      }
      break;
    }
    case "random":
      list = randomSample(config, now);
      break;
    case "watchlist":
      list = config.watchlist;
      break;
    case "custom":
      list = config.symbols;
      break;
  }
  const hidden = new Set(config.hidden);
  const limit = config.mode === "random" ? config.randomCount : config.maxItems;
  return [...new Set([...config.pinned, ...list])]
    .filter((symbol) => !hidden.has(symbol))
    .slice(0, limit);
}

// ETFs lead the ticker, followed by the stocks for the selected mode.
export function activeSymbols(config: TickerConfig, now?: number): string[] {
  const etfs = config.showEtfs ? config.etfs.filter((x) => !config.hidden.includes(x)) : [];
  return [...new Set([...etfs, ...stocksForConfig(config, now)])].slice(0, MAX_SYMBOLS);
}

export function securityKind(symbol: string): SecurityKind {
  return (etfSymbols as readonly string[]).includes(symbol)
    ? "ETF"
    : (registry[symbol]?.kind ?? "stock");
}

export function logoDomain(symbol: string, config?: Pick<TickerConfig, "domains">): string | null {
  return config?.domains[symbol] ?? (registry[symbol]?.domain || null);
}

export function initials(symbol: string) {
  return symbol.replace(/[^A-Z]/g, "").slice(0, 2) || symbol.slice(0, 2);
}

export type Quote = {
  symbol: string;
  price: number;
  previousClose: number | null;
  change: number | null;
  percent: number | null;
  timestamp: number;
  source: "snapshot" | "trade";
};

export type MarketSession = {
  isOpen: boolean;
  session: "pre-market" | "regular" | "post-market" | "closed";
  holiday: string | null;
  checkedAt: number;
};

export type FeedStatus =
  "connecting" | "connected" | "reconnecting" | "offline" | "duplicate" | "error";
export type NewsItem = {
  id: number;
  headline: string;
  source: string;
  datetime: number;
  url: string;
  related: string;
};

// Messages the relay sends to an overlay over the WebSocket.
export type FeedEvent =
  | { type: "config"; config: TickerConfig }
  | { type: "quotes"; quotes: Quote[] }
  | { type: "status"; status: FeedStatus; message?: string }
  | { type: "news"; items: NewsItem[] }
  | { type: "market"; market: MarketSession }
  | { type: "rotate" }
  | { type: "ping" };

// The overlay's first (and only) message to the relay.
// takeover: true on an overlay's first connection after it loads, so the newest
// copy wins the single connection; reconnects and duplicate retries send false.
export type RelayHello = {
  type: "hello";
  id: string;
  key: string;
  instance: string;
  takeover?: boolean;
};

// Close codes the relay uses so the overlay knows whether to retry.
export const RelayClose = {
  rotate: 4000,
  badRequest: 4001,
  invalidLink: 4003,
  duplicate: 4009,
  unavailable: 4503,
} as const;

// "Live" only for a trade inside the last minute; everything else carries its timestamp.
export function freshness(
  quote: Quote | undefined,
  now: number,
): "live" | "recent" | "stale" | "none" {
  if (!quote) return "none";
  const age = now - quote.timestamp;
  if (quote.source === "trade" && age < 60_000) return "live";
  return age < 15 * 60_000 ? "recent" : "stale";
}

// US markets keep New York time, so "which trading day" is decided in ET.
const etDayFormat = new Intl.DateTimeFormat("en-CA", {
  timeZone: "America/New_York",
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
});
export function etDay(timestamp: number) {
  return etDayFormat.format(new Date(timestamp));
}

// The close a trade's daily change is measured against. Before the first
// trade of a new day, a REST snapshot's own price is the latest close, and its
// previous close is a session older.
export function tradeBaseline(snapshot: Quote | null, tradeTime: number): number | null {
  if (!snapshot) return null;
  return etDay(tradeTime) > etDay(snapshot.timestamp) ? snapshot.price : snapshot.previousClose;
}

export function withChange(
  symbol: string,
  price: number,
  timestamp: number,
  previousClose: number | null,
  source: Quote["source"],
): Quote {
  const change = previousClose && previousClose > 0 ? price - previousClose : null;
  const percent = change === null || !previousClose ? null : (change / previousClose) * 100;
  return { symbol, price, previousClose, change, percent, timestamp, source };
}
