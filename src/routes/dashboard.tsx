import { createFileRoute } from "@tanstack/react-router";
import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { toast } from "sonner";
import { AppearanceShell } from "@/components/AppearanceShell";
import {
  ArrowDown,
  ArrowUp,
  Copy,
  EyeOff,
  Pause,
  Pin,
  Play,
  RotateCcw,
  Shuffle,
  Trash2,
  X,
} from "lucide-react";
import { TickerBar } from "@/components/ticker/TickerBar";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Slider } from "@/components/ui/slider";
import { Switch } from "@/components/ui/switch";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  type Access,
  accessLink,
  activeSymbols,
  control,
  currentSite,
  defaultConfig,
  etfSymbols,
  type FeedStatus,
  formatTime,
  limits,
  linksNeedLogin,
  logoSrc,
  type MarketSession,
  modeLabels,
  modes,
  normalizeDomain,
  normalizeLogoUrl,
  openOverlayKey,
  parseAccess,
  parseSymbolList,
  type Quote,
  randomKey,
  registry,
  rememberSite,
  sanitizeConfig,
  sealOverlayKey,
  sectors,
  speedPresets,
  type TickerConfig,
  withChange,
} from "@/lib/market";

export const Route = createFileRoute("/dashboard")({
  head: () => ({
    meta: [
      { title: "Javon Journey | Ticker control" },
      {
        name: "description",
        content: "Private Javon Journey broadcast ticker controls and appearance settings.",
      },
      { property: "og:title", content: "Javon Journey | Ticker control" },
      {
        property: "og:description",
        content: "Private broadcast ticker controls and appearance settings.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
      { name: "robots", content: "noindex, nofollow" },
    ],
  }),
  component: Dashboard,
});

type Relay = {
  live: boolean;
  status: FeedStatus;
  message: string | null;
  duplicateAt: string | null;
  market: MarketSession | null;
  symbols: string[];
  startedAt: string | null;
  updatedAt: string;
  hasProviderKey: boolean;
  hasLogoKey: boolean;
} | null;
type CachedQuote = {
  symbol: string;
  price: number;
  previousClose: number | null;
  timestamp: number;
  source: Quote["source"];
};
type LiveState = { relay: Relay; quotes: CachedQuote[] };
type ReadResponse = LiveState & {
  config: TickerConfig;
  previous: TickerConfig | null;
  presets: Record<string, unknown>;
  overlaySealed?: string | null;
  publicSite?: string | null;
};

const draftKey = (id: string) => `ticker-draft:${id}`;
const overlayKeyStorage = (id: string) => `ticker-overlay-key:${id}`;

function Dashboard() {
  const [access, setAccess] = useState<Access | null | undefined>(undefined);
  const [live, setLive] = useState<TickerConfig | null>(null);
  const [draft, setDraftState] = useState<TickerConfig | null>(null);
  const [previous, setPrevious] = useState<TickerConfig | null>(null);
  const [presets, setPresets] = useState<Record<string, TickerConfig>>({});
  const [state, setState] = useState<LiveState>({ relay: null, quotes: [] });
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [overlayKey, setOverlayKey] = useState<string | null>(null);
  // The preview shows the draft, so ask the server for the draft's prices too.
  const shown = useMemo(() => (draft ? activeSymbols(draft) : []), [draft]);
  const shownKey = shown.join(",");
  const shownRef = useRef(shown);
  shownRef.current = shown;

  useEffect(() => {
    const parsed = parseAccess(window.location.hash);
    setAccess(parsed);
    // Remember the dashboard link on this computer only (setup page offers it).
    if (parsed) {
      try {
        localStorage.setItem("ticker-dashboard-link", accessLink("/dashboard", parsed));
      } catch {
        // storage unavailable
      }
    }
  }, []);

  const setDraft = useCallback(
    (update: TickerConfig | ((c: TickerConfig) => TickerConfig)) => {
      setDraftState((current) => {
        if (!current) return current;
        const next = sanitizeConfig(typeof update === "function" ? update(current) : update);
        try {
          if (access) localStorage.setItem(draftKey(access.id), JSON.stringify(next));
        } catch {
          // storage unavailable
        }
        return next;
      });
    },
    [access],
  );

  useEffect(() => {
    if (!access) return;
    control<ReadResponse>({ action: "read", ...access, site: currentSite() })
      .then((data) => {
        rememberSite(data.publicSite);
        setLive(sanitizeConfig(data.config));
        setPrevious(data.previous ? sanitizeConfig(data.previous) : null);
        setPresets(
          Object.fromEntries(Object.entries(data.presets).map(([k, v]) => [k, sanitizeConfig(v)])),
        );
        setState({ relay: data.relay, quotes: data.quotes });
        let saved: TickerConfig | null = null;
        try {
          const raw = localStorage.getItem(draftKey(access.id));
          saved = raw ? sanitizeConfig(JSON.parse(raw)) : null;
        } catch {
          saved = null;
        }
        setDraftState(saved ?? sanitizeConfig(data.config));
        void syncOverlayKey(access, data.overlaySealed ?? null).then(setOverlayKey);
      })
      .catch((e: Error & { status?: number }) => {
        // A replaced link must not keep the home page's "Open my dashboard" stuck on it.
        if (e.status === 403) {
          try {
            if (localStorage.getItem("ticker-dashboard-link") === accessLink("/dashboard", access))
              localStorage.removeItem("ticker-dashboard-link");
          } catch {
            // storage unavailable
          }
        }
        setError(e.message);
      });
    const timer = setInterval(() => {
      control<LiveState>({ action: "status", ...access, symbols: shownRef.current })
        .then(setState)
        .catch(() => {});
    }, 5000);
    return () => clearInterval(timer);
  }, [access]);

  // Load prices for newly shown symbols now rather than at the next poll.
  useEffect(() => {
    if (!access || !shownKey) return;
    control<LiveState>({ action: "status", ...access, symbols: shownKey.split(",") })
      .then(setState)
      .catch(() => {});
  }, [access, shownKey]);

  const publish = async (config: TickerConfig, message = "Applied to stream") => {
    if (!access) return;
    setBusy(true);
    try {
      const data = await control<{ config: TickerConfig }>({ action: "apply", ...access, config });
      setPrevious(live);
      setLive(sanitizeConfig(data.config));
      toast.success(message);
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  // Transport controls act on the live stream immediately and mirror into the draft.
  const liveControl = (patch: Partial<TickerConfig>, message: string) => {
    if (!live) return;
    setDraft((d) => ({ ...d, ...patch }));
    void publish({ ...live, ...patch }, message);
  };

  const restore = async () => {
    if (!access) return;
    setBusy(true);
    try {
      const data = await control<{ config: TickerConfig }>({ action: "restore", ...access });
      setPrevious(live);
      setLive(sanitizeConfig(data.config));
      setDraft(sanitizeConfig(data.config));
      toast.success("Previous configuration restored");
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const quotes = useMemo(() => {
    const out: Record<string, Quote> = {};
    for (const q of state.quotes)
      out[q.symbol] = withChange(q.symbol, q.price, q.timestamp, q.previousClose, q.source);
    return out;
  }, [state.quotes]);

  if (access === undefined) return <Shell />;
  if (access === null)
    return (
      <Shell>
        <Empty
          title="Dashboard link required"
          body="Open the private dashboard link you saved when you set up the ticker. It ends with #<id>.<key>."
        />
      </Shell>
    );
  if (error)
    return (
      <Shell>
        <Empty title="Can't open this dashboard" body={error} />
      </Shell>
    );
  if (!draft || !live)
    return (
      <Shell>
        <p className="p-10 text-sm text-muted-foreground">Loading your ticker…</p>
      </Shell>
    );

  const dirty = JSON.stringify(draft) !== JSON.stringify(live);
  const relay = state.relay;
  const duplicateRecent =
    relay?.duplicateAt && Date.now() - Date.parse(relay.duplicateAt) < 120_000;

  return (
    <Shell
      appearance={draft.appearance}
      disabled={busy}
      onAppearanceChange={(appearance) =>
        liveControl({ appearance }, "Appearance applied to stream")
      }
    >
      <header className="sticky top-0 z-20 border-b border-border bg-background/85 backdrop-blur">
        <div className="mx-auto flex max-w-[1400px] flex-wrap items-center gap-3 px-6 py-3">
          <div className="mr-auto">
            <h1 className="text-base font-semibold tracking-tight">Ticker control</h1>
            <RelayBadge relay={relay} />
          </div>
          <Button
            variant="outline"
            size="sm"
            onClick={() =>
              liveControl({ paused: !live.paused }, live.paused ? "Resumed" : "Paused")
            }
            disabled={busy}
          >
            {live.paused ? <Play className="size-4" /> : <Pause className="size-4" />}
            {live.paused ? "Resume" : "Pause"}
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={() => liveControl({ resetAt: Date.now() }, "Ticker reset to start")}
            disabled={busy}
          >
            <RotateCcw className="size-4" /> Reset
          </Button>
          <Button variant="outline" size="sm" onClick={restore} disabled={busy || !previous}>
            Restore previous
          </Button>
          <Button variant="ghost" size="sm" onClick={() => setDraft(live)} disabled={!dirty}>
            Discard draft
          </Button>
          <Button size="sm" onClick={() => publish(draft)} disabled={busy || !dirty}>
            Apply to stream
          </Button>
        </div>
      </header>

      <main className="mx-auto max-w-[1400px] space-y-6 px-6 py-6">
        {duplicateRecent && (
          <Banner tone="warn" title="A second ticker copy tried to connect">
            The free Finnhub plan allows one live connection, so the extra copy is paused and
            retries every 15 seconds. Close duplicate OBS browser sources (or other open overlay
            tabs) that use this overlay link. Last attempt{" "}
            {relay?.duplicateAt ? new Date(relay.duplicateAt).toLocaleTimeString() : ""}.
          </Banner>
        )}
        {relay && !relay.hasProviderKey && (
          <Banner tone="error" title="FINNHUB_API_KEY is missing">
            Set it as a Supabase Edge Function secret:{" "}
            <code>supabase secrets set FINNHUB_API_KEY=…</code>
          </Banner>
        )}
        {relay && !relay.hasLogoKey && (
          <Banner tone="warn" title="LOGO_DEV_PUBLISHABLE_KEY is missing">
            Logos fall back to initials until it is set as a Supabase Edge Function secret.
          </Banner>
        )}

        <section className="space-y-2">
          <div className="flex items-baseline justify-between">
            <h2 className="text-sm font-medium">
              {dirty ? "Draft preview — not live yet" : "Preview — matches the stream"}
            </h2>
            <span className="text-xs text-muted-foreground">
              Prices are the relay's last quotes
              {state.quotes.length ? "" : " (none yet — open the overlay in OBS)"}
            </span>
          </div>
          <Preview config={draft} channelId={access.id} quotes={quotes} relay={relay} />
        </section>

        <Tabs defaultValue="selection">
          <TabsList className="h-auto max-w-full flex-wrap justify-start">
            <TabsTrigger value="selection">Selection</TabsTrigger>
            <TabsTrigger value="appearance">Appearance</TabsTrigger>
            <TabsTrigger value="motion">Motion</TabsTrigger>
            <TabsTrigger value="logos">Logos</TabsTrigger>
            <TabsTrigger value="news">News</TabsTrigger>
            <TabsTrigger value="presets">Presets</TabsTrigger>
            <TabsTrigger value="links">Links & OBS</TabsTrigger>
          </TabsList>
          <TabsContent value="selection">
            <SelectionPanel config={draft} setConfig={setDraft} />
          </TabsContent>
          <TabsContent value="appearance">
            <AppearancePanel config={draft} setConfig={setDraft} />
          </TabsContent>
          <TabsContent value="motion">
            <MotionPanel config={draft} setConfig={setDraft} />
          </TabsContent>
          <TabsContent value="logos">
            <LogoPanel config={draft} setConfig={setDraft} channelId={access.id} />
          </TabsContent>
          <TabsContent value="news">
            <NewsPanel config={draft} setConfig={setDraft} />
          </TabsContent>
          <TabsContent value="presets">
            <PresetPanel
              access={access}
              draft={draft}
              setDraft={setDraft}
              presets={presets}
              setPresets={setPresets}
            />
          </TabsContent>
          <TabsContent value="links">
            <LinksPanel
              access={access}
              relay={relay}
              quotes={state.quotes}
              overlayKey={overlayKey}
              setOverlayKey={setOverlayKey}
            />
          </TabsContent>
        </Tabs>
      </main>
    </Shell>
  );
}

function Shell(props: React.ComponentProps<typeof AppearanceShell>) {
  return <AppearanceShell {...props} />;
}

function Empty({ title, body }: { title: string; body: string }) {
  return (
    <div className="mx-auto max-w-md px-6 py-24 text-center">
      <h1 className="text-xl font-semibold">{title}</h1>
      <p className="mt-2 text-sm text-muted-foreground">{body}</p>
      <a href="/" className="mt-6 inline-block text-sm underline underline-offset-4">
        Setup page
      </a>
    </div>
  );
}

function Banner({
  tone,
  title,
  children,
}: {
  tone: "warn" | "error";
  title: string;
  children: ReactNode;
}) {
  return (
    <div
      className={`rounded-lg border px-4 py-3 text-sm ${tone === "error" ? "border-red-500/40 bg-red-500/10" : "border-amber-500/40 bg-amber-500/10"}`}
    >
      <p className="font-medium">{title}</p>
      <p className="mt-1 text-muted-foreground">{children}</p>
    </div>
  );
}

const statusText: Record<FeedStatus, string> = {
  connecting: "Overlay connecting",
  connected: "Overlay live",
  reconnecting: "Overlay reconnecting",
  offline: "Overlay offline",
  duplicate: "Duplicate copy",
  error: "Market data error",
};

function RelayBadge({ relay }: { relay: Relay }) {
  const status: FeedStatus = relay?.live ? relay.status : "offline";
  const color =
    status === "connected"
      ? "bg-emerald-500"
      : status === "offline"
        ? "bg-zinc-500"
        : status === "error"
          ? "bg-red-500"
          : "bg-amber-400";
  const market = relay?.market;
  return (
    <p className="mt-0.5 flex items-center gap-2 text-xs text-muted-foreground">
      <span className={`inline-block size-2 rounded-full ${color}`} />
      {statusText[status]}
      {relay?.live && relay.message ? ` · ${relay.message}` : ""}
      {market
        ? ` · US market ${market.session === "regular" ? "open" : market.session.replace("-", " ")}${market.holiday ? ` (${market.holiday})` : ""}`
        : ""}
      {!relay?.live && " · the relay runs only while the overlay is open in OBS"}
    </p>
  );
}

function Preview({
  config,
  channelId,
  quotes,
  relay,
}: {
  config: TickerConfig;
  channelId: string;
  quotes: Record<string, Quote>;
  relay: Relay;
}) {
  const box = useRef<HTMLDivElement>(null);
  const [scale, setScale] = useState(0.5);
  useEffect(() => {
    const measure = () => box.current && setScale(box.current.offsetWidth / 1920);
    measure();
    const observer = new ResizeObserver(measure);
    if (box.current) observer.observe(box.current);
    return () => observer.disconnect();
  }, []);
  const status: FeedStatus = relay?.live ? relay.status : "offline";
  return (
    <div
      ref={box}
      className="relative w-full overflow-hidden rounded-lg border border-border"
      style={{
        aspectRatio: "16 / 9",
        background: "repeating-conic-gradient(#1c1c1f 0% 25%, #232327 0% 50%) 50% / 24px 24px",
      }}
    >
      <span className="absolute left-3 top-3 text-xs text-muted-foreground">
        1920 × 1080 canvas · checkerboard = transparent in OBS
      </span>
      <div
        style={{
          position: "absolute",
          left: 0,
          top: 0,
          width: 1920,
          height: 1080,
          transform: `scale(${scale})`,
          transformOrigin: "top left",
        }}
      >
        <TickerBar
          config={config}
          channelId={channelId}
          quotes={quotes}
          status={status}
          market={relay?.market ?? null}
        />
      </div>
    </div>
  );
}

type PanelProps = {
  config: TickerConfig;
  setConfig: (update: (c: TickerConfig) => TickerConfig) => void;
};

function Field({ label, hint, children }: { label: string; hint?: string; children: ReactNode }) {
  return (
    <label className="block space-y-1.5">
      <span className="text-sm font-medium">{label}</span>
      {children}
      {hint && <span className="block text-xs text-muted-foreground">{hint}</span>}
    </label>
  );
}

function Card({
  title,
  children,
  action,
}: {
  title: string;
  children: ReactNode;
  action?: ReactNode;
}) {
  return (
    <section className="rounded-xl border border-border bg-card/40 p-5">
      <div className="mb-4 flex items-center justify-between gap-2">
        <h3 className="text-sm font-semibold">{title}</h3>
        {action}
      </div>
      <div className="space-y-4">{children}</div>
    </section>
  );
}

function Toggle({
  label,
  checked,
  onChange,
  hint,
}: {
  label: string;
  checked: boolean;
  onChange: (v: boolean) => void;
  hint?: string;
}) {
  return (
    <div className="flex items-start justify-between gap-4">
      <div>
        <p className="text-sm">{label}</p>
        {hint && <p className="text-xs text-muted-foreground">{hint}</p>}
      </div>
      <Switch checked={checked} onCheckedChange={onChange} />
    </div>
  );
}

function Range({
  label,
  value,
  range,
  onChange,
  unit = "px",
}: {
  label: string;
  value: number;
  range: readonly [number, number];
  onChange: (v: number) => void;
  unit?: string;
}) {
  return (
    <div className="space-y-2">
      <div className="flex justify-between text-sm">
        <span>{label}</span>
        <span className="tabular-nums text-muted-foreground">
          {value}
          {unit}
        </span>
      </div>
      <Slider
        min={range[0]}
        max={range[1]}
        step={1}
        value={[value]}
        onValueChange={([v]) => v !== undefined && onChange(v)}
      />
    </div>
  );
}

const selectClass =
  "h-9 w-full rounded-md border border-input bg-transparent px-3 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring";
const optionClass = "bg-popover text-popover-foreground";

function SymbolList({
  value,
  onChange,
  placeholder = "Add tickers, e.g. NVDA, TSM",
}: {
  value: string[];
  onChange: (v: string[]) => void;
  placeholder?: string;
}) {
  const [text, setText] = useState("");
  const add = () => {
    const next = parseSymbolList([...value, ...parseSymbolList(text)]);
    onChange(next);
    setText("");
  };
  const move = (i: number, d: number) => {
    const next = [...value];
    const j = i + d;
    if (j < 0 || j >= next.length) return;
    [next[i], next[j]] = [next[j] as string, next[i] as string];
    onChange(next);
  };
  return (
    <div className="space-y-3">
      <div className="flex gap-2">
        <Input
          list="ticker-registry"
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && (e.preventDefault(), add())}
          placeholder={placeholder}
        />
        <Button variant="secondary" onClick={add} disabled={!text.trim()}>
          Add
        </Button>
      </div>
      <ol className="divide-y divide-border rounded-md border border-border">
        {value.map((symbol, i) => (
          <li key={symbol} className="flex items-center gap-2 px-3 py-1.5 text-sm">
            <span className="w-6 tabular-nums text-xs text-muted-foreground">{i + 1}</span>
            <span className="w-16 font-medium">{symbol}</span>
            <span className="flex-1 truncate text-xs text-muted-foreground">
              {registry[symbol]?.name ?? "Not in registry — add a logo domain under Logos"}
            </span>
            <IconButton label="Move up" onClick={() => move(i, -1)}>
              <ArrowUp className="size-3.5" />
            </IconButton>
            <IconButton label="Move down" onClick={() => move(i, 1)}>
              <ArrowDown className="size-3.5" />
            </IconButton>
            <IconButton label="Remove" onClick={() => onChange(value.filter((s) => s !== symbol))}>
              <X className="size-3.5" />
            </IconButton>
          </li>
        ))}
        {!value.length && (
          <li className="px-3 py-2 text-sm text-muted-foreground">No tickers yet.</li>
        )}
      </ol>
    </div>
  );
}

function IconButton({
  label,
  onClick,
  children,
  active,
}: {
  label: string;
  onClick: () => void;
  children: ReactNode;
  active?: boolean;
}) {
  return (
    <button
      type="button"
      title={label}
      aria-label={label}
      onClick={onClick}
      className={`rounded p-1 hover:bg-accent ${active ? "text-foreground" : "text-muted-foreground"}`}
    >
      {children}
    </button>
  );
}

function RegistryList() {
  return (
    <datalist id="ticker-registry">
      {Object.entries(registry).map(([symbol, info]) => (
        <option key={symbol} value={symbol}>
          {info.name} · {info.sector}
        </option>
      ))}
    </datalist>
  );
}

function SelectionPanel({ config, setConfig }: PanelProps) {
  const set = <K extends keyof TickerConfig>(key: K, value: TickerConfig[K]) =>
    setConfig((c) => ({ ...c, [key]: value }));
  const shown = activeSymbols(config);
  return (
    <div className="mt-4 grid gap-6 lg:grid-cols-[1fr_380px]">
      <RegistryList />
      <div className="space-y-6">
        <Card title="Display mode">
          <div className="grid grid-cols-2 gap-2 md:grid-cols-3">
            {modes.map((mode) => (
              <button
                key={mode}
                type="button"
                onClick={() => set("mode", mode)}
                className={`rounded-lg border px-3 py-2.5 text-left text-sm transition ${config.mode === mode ? "border-foreground/60 bg-accent" : "border-border hover:bg-accent/50"}`}
              >
                {modeLabels[mode]}
              </button>
            ))}
          </div>
        </Card>

        {config.mode === "top" && (
          <Card title="Top market tickers">
            <p className="text-xs text-muted-foreground">
              Your own list, shown in this order. The default is roughly the largest US listings;
              edit freely.
            </p>
            <SymbolList value={config.topSymbols} onChange={(v) => set("topSymbols", v)} />
          </Card>
        )}
        {config.mode === "sector" && (
          <Card title="One sector">
            <Field label="Sector">
              <select
                className={selectClass}
                value={config.sector}
                onChange={(e) => set("sector", e.target.value as TickerConfig["sector"])}
              >
                {sectors.map((s) => (
                  <option key={s} className={optionClass}>
                    {s}
                  </option>
                ))}
              </select>
            </Field>
            <SymbolList
              value={config.sectorSymbols[config.sector] ?? []}
              onChange={(v) =>
                set("sectorSymbols", { ...config.sectorSymbols, [config.sector]: v })
              }
            />
          </Card>
        )}
        {config.mode === "all" && (
          <Card title="All sectors">
            <Field label="Order" hint="Uses each sector's list from One sector mode.">
              <select
                className={selectClass}
                value={config.allOrder}
                onChange={(e) => set("allOrder", e.target.value as TickerConfig["allOrder"])}
              >
                <option value="grouped" className={optionClass}>
                  Grouped by sector
                </option>
                <option value="interleaved" className={optionClass}>
                  Interleaved across sectors
                </option>
              </select>
            </Field>
          </Card>
        )}
        {config.mode === "random" && (
          <Card
            title="Random stocks"
            action={
              <Button
                size="sm"
                variant="secondary"
                onClick={() => set("shuffleSeed", Math.floor(Math.random() * 1e9))}
              >
                <Shuffle className="size-4" /> Shuffle now
              </Button>
            }
          >
            <Field label="Eligible sectors" hint="None selected = all sectors.">
              <div className="flex flex-wrap gap-1.5">
                {sectors.map((s) => {
                  const on = config.randomSectors.includes(s);
                  return (
                    <button
                      key={s}
                      type="button"
                      onClick={() =>
                        set(
                          "randomSectors",
                          on
                            ? config.randomSectors.filter((x) => x !== s)
                            : [...config.randomSectors, s],
                        )
                      }
                      className={`rounded-full border px-2.5 py-1 text-xs ${on ? "border-foreground/60 bg-accent" : "border-border text-muted-foreground"}`}
                    >
                      {s}
                    </button>
                  );
                })}
              </div>
            </Field>
            <Range
              label="Number of stocks"
              value={config.randomCount}
              range={limits.randomCount}
              onChange={(v) => set("randomCount", v)}
              unit=""
            />
            <Field
              label="Favor"
              hint="Volume- and mover-weighted picks need a paid data plan, so they are not offered."
            >
              <select
                className={selectClass}
                value={config.randomFavor}
                onChange={(e) => set("randomFavor", e.target.value as TickerConfig["randomFavor"])}
              >
                <option value="any" className={optionClass}>
                  Any stock in the universe
                </option>
                <option value="largecap" className={optionClass}>
                  Large caps
                </option>
              </select>
            </Field>
            <Toggle
              label="Avoid recently shown stocks"
              checked={config.randomAvoidRecent}
              onChange={(v) => set("randomAvoidRecent", v)}
            />
            <Range
              label="Auto-shuffle every"
              value={config.shuffleMinutes}
              range={limits.shuffleMinutes}
              onChange={(v) => set("shuffleMinutes", v)}
              unit={config.shuffleMinutes ? " min" : " (off)"}
            />
          </Card>
        )}
        {config.mode === "watchlist" && (
          <Card title="My watchlist">
            <SymbolList value={config.watchlist} onChange={(v) => set("watchlist", v)} />
          </Card>
        )}
        {config.mode === "custom" && (
          <Card title="Custom selection">
            <SymbolList value={config.symbols} onChange={(v) => set("symbols", v)} />
          </Card>
        )}
      </div>

      <div className="space-y-6">
        <Card title="ETFs">
          <Toggle
            label="Show ETF group first"
            checked={config.showEtfs}
            onChange={(v) => set("showEtfs", v)}
            hint="SPY, QQQ, DIA and IWM are ETF share prices and are labeled ETF. Index values (S&P 500, VIX…) need an index data entitlement Finnhub's free plan does not include."
          />
          <div className="flex flex-wrap gap-2">
            {etfSymbols.map((etf) => {
              const on = config.etfs.includes(etf);
              return (
                <button
                  key={etf}
                  type="button"
                  onClick={() =>
                    set("etfs", on ? config.etfs.filter((x) => x !== etf) : [...config.etfs, etf])
                  }
                  className={`rounded-md border px-3 py-1.5 text-sm ${on ? "border-foreground/60 bg-accent" : "border-border text-muted-foreground"}`}
                  title={registry[etf]?.name}
                >
                  {etf}
                </button>
              );
            })}
          </div>
        </Card>
        <Card title="Count">
          <Range
            label="Maximum stock entries"
            value={config.maxItems}
            range={limits.maxItems}
            onChange={(v) => set("maxItems", v)}
            unit=""
          />
          <p className="text-xs text-muted-foreground">
            Showing {shown.length} securities: {shown.join(", ") || "none"}. Finnhub's free stream
            allows 50 symbols.
          </p>
        </Card>
        <Card title="Pinned and hidden">
          <p className="text-xs text-muted-foreground">
            Pinned tickers always lead, in every mode. Hidden tickers are skipped everywhere until
            you unhide them.
          </p>
          <Field label="Pinned">
            <SymbolList
              value={config.pinned}
              onChange={(v) => set("pinned", v)}
              placeholder="Pin a ticker"
            />
          </Field>
          <Field label="Hidden">
            <SymbolList
              value={config.hidden}
              onChange={(v) => set("hidden", v)}
              placeholder="Hide a ticker"
            />
          </Field>
          <div className="flex flex-wrap gap-1.5">
            {shown.map((s) => (
              <span
                key={s}
                className="inline-flex items-center gap-1 rounded-md border border-border px-2 py-0.5 text-xs"
              >
                {s}
                <IconButton
                  label={`Pin ${s}`}
                  onClick={() => set("pinned", parseSymbolList([...config.pinned, s]))}
                  active={config.pinned.includes(s)}
                >
                  <Pin className="size-3" />
                </IconButton>
                <IconButton
                  label={`Hide ${s}`}
                  onClick={() => set("hidden", parseSymbolList([...config.hidden, s]))}
                >
                  <EyeOff className="size-3" />
                </IconButton>
              </span>
            ))}
          </div>
        </Card>
      </div>
    </div>
  );
}

function AppearancePanel({ config, setConfig }: PanelProps) {
  const set = <K extends keyof TickerConfig>(key: K, value: TickerConfig[K]) =>
    setConfig((c) => ({ ...c, [key]: value }));
  return (
    <div className="mt-4 grid gap-6 lg:grid-cols-2">
      <Card title="Size">
        <Range
          label="Ticker height"
          value={config.height}
          range={limits.height}
          onChange={(v) => set("height", v)}
        />
        <Range
          label="Font size"
          value={config.fontSize}
          range={limits.fontSize}
          onChange={(v) => set("fontSize", v)}
        />
        <Range
          label="Logo size"
          value={config.logoSize}
          range={limits.logoSize}
          onChange={(v) => set("logoSize", v)}
        />
        <Range
          label="Background opacity"
          value={config.opacity}
          range={limits.opacity}
          onChange={(v) => set("opacity", v)}
          unit="%"
        />
        <Range
          label="Safe area (kept clear for a webcam)"
          value={config.safeArea}
          range={limits.safeArea}
          onChange={(v) => set("safeArea", v)}
        />
        <Field label="Safe area side">
          <select
            className={selectClass}
            value={config.safeSide}
            onChange={(e) => set("safeSide", e.target.value as TickerConfig["safeSide"])}
          >
            <option value="right" className={optionClass}>
              Right
            </option>
            <option value="left" className={optionClass}>
              Left
            </option>
          </select>
        </Field>
      </Card>
      <Card title="Content and color">
        <Toggle
          label="Company logos"
          checked={config.showLogos}
          onChange={(v) => set("showLogos", v)}
        />
        <Toggle
          label="Short company names"
          checked={config.showNames}
          onChange={(v) => set("showNames", v)}
        />
        <Toggle
          label="Intraday sparklines"
          checked={config.showSparklines}
          onChange={(v) => set("showSparklines", v)}
          hint="Drawn from trades the overlay receives while it runs (one point per 30 s)."
        />
        <Toggle
          label="Market status and freshness cap"
          checked={config.showStatus}
          onChange={(v) => set("showStatus", v)}
          hint="Shows market session, Live / Last trade time, and reconnecting state."
        />
        <div className="grid grid-cols-3 gap-3">
          {(
            [
              ["textColor", "Text"],
              ["upColor", "Up"],
              ["downColor", "Down"],
            ] as const
          ).map(([key, label]) => (
            <Field key={key} label={label}>
              <input
                type="color"
                value={config[key]}
                onChange={(e) => set(key, e.target.value)}
                className="h-9 w-full cursor-pointer rounded-md border border-input bg-transparent"
              />
            </Field>
          ))}
        </div>
        <Button
          variant="ghost"
          size="sm"
          onClick={() =>
            setConfig((c) => ({
              ...c,
              textColor: defaultConfig.textColor,
              upColor: defaultConfig.upColor,
              downColor: defaultConfig.downColor,
            }))
          }
        >
          Reset colors
        </Button>
      </Card>
    </div>
  );
}

function MotionPanel({ config, setConfig }: PanelProps) {
  const set = <K extends keyof TickerConfig>(key: K, value: TickerConfig[K]) =>
    setConfig((c) => ({ ...c, [key]: value }));
  return (
    <div className="mt-4 grid gap-6 lg:grid-cols-2">
      <Card title="Speed">
        <div className="flex flex-wrap gap-2">
          {(["slow", "normal", "fast", "custom"] as const).map((preset) => (
            <Button
              key={preset}
              size="sm"
              variant={config.speedPreset === preset ? "default" : "outline"}
              onClick={() =>
                setConfig((c) => ({
                  ...c,
                  speedPreset: preset,
                  speed: preset === "custom" ? c.speed : speedPresets[preset],
                }))
              }
            >
              {preset[0]!.toUpperCase() + preset.slice(1)}
            </Button>
          ))}
        </div>
        {config.speedPreset === "custom" && (
          <Range
            label="Custom speed"
            value={config.speed}
            range={limits.speed}
            onChange={(v) => set("speed", v)}
            unit=" px/s"
          />
        )}
      </Card>
      <Card title="Direction and playback">
        <Field label="Direction">
          <select
            className={selectClass}
            value={config.direction}
            onChange={(e) => set("direction", e.target.value as TickerConfig["direction"])}
          >
            <option value="left" className={optionClass}>
              Right to left (standard)
            </option>
            <option value="right" className={optionClass}>
              Left to right
            </option>
          </select>
        </Field>
        <Toggle
          label="Paused"
          checked={config.paused}
          onChange={(v) => set("paused", v)}
          hint="The Pause / Resume and Reset buttons in the header act on the stream immediately."
        />
      </Card>
    </div>
  );
}

function LogoPanel({ config, setConfig, channelId }: PanelProps & { channelId: string }) {
  const symbols = [
    ...new Set([
      ...activeSymbols(config),
      ...Object.keys(config.domains),
      ...Object.keys(config.logos),
    ]),
  ];
  const setOverride = (field: "domains" | "logos", symbol: string, raw: string) =>
    setConfig((c) => {
      const next = { ...c[field] };
      const value = field === "domains" ? normalizeDomain(raw) : normalizeLogoUrl(raw);
      if (value) next[symbol] = value;
      else delete next[symbol];
      return { ...c, [field]: next };
    });
  return (
    <div className="mt-4">
      <Card title="Logos">
        <p className="text-xs text-muted-foreground">
          Logos come from Logo.dev using each company's verified domain (the key stays in Supabase).
          Override the domain, or paste an https image URL you are licensed to use. Unknown tickers
          show their initials instead of a guessed logo. Logo.dev's free tier asks for attribution;
          see logo.dev/pricing for commercial use.
        </p>
        <div className="divide-y divide-border rounded-md border border-border">
          {symbols.map((symbol) => (
            <div
              key={symbol}
              className="grid grid-cols-[48px_80px_1fr_1fr] items-center gap-3 px-3 py-2"
            >
              <img
                src={logoSrc(symbol, channelId, config)}
                alt=""
                className="size-8 rounded-md bg-white object-contain"
                onError={(e) => (e.currentTarget.style.visibility = "hidden")}
              />
              <div>
                <p className="text-sm font-medium">{symbol}</p>
                <p className="truncate text-xs text-muted-foreground">
                  {registry[symbol]?.domain || "no domain"}
                </p>
              </div>
              <OverrideInput
                placeholder="Domain override, e.g. tsmc.com"
                value={config.domains[symbol] ?? ""}
                onCommit={(v) => setOverride("domains", symbol, v)}
              />
              <OverrideInput
                placeholder="Logo URL override (https)"
                value={config.logos[symbol] ?? ""}
                onCommit={(v) => setOverride("logos", symbol, v)}
              />
            </div>
          ))}
        </div>
      </Card>
    </div>
  );
}

function OverrideInput({
  value,
  onCommit,
  placeholder,
}: {
  value: string;
  onCommit: (v: string) => void;
  placeholder: string;
}) {
  const [text, setText] = useState(value);
  useEffect(() => setText(value), [value]);
  return (
    <Input
      value={text}
      placeholder={placeholder}
      onChange={(e) => setText(e.target.value)}
      onBlur={() => text !== value && onCommit(text)}
      onKeyDown={(e) => e.key === "Enter" && onCommit(text)}
    />
  );
}

function NewsPanel({ config, setConfig }: PanelProps) {
  const set = <K extends keyof TickerConfig>(key: K, value: TickerConfig[K]) =>
    setConfig((c) => ({ ...c, [key]: value }));
  return (
    <div className="mt-4 max-w-2xl">
      <Card title="Financial headlines">
        <Toggle
          label="Show headlines"
          checked={config.news}
          onChange={(v) => set("news", v)}
          hint="Finnhub news, refreshed every 5 minutes, always with source and publication time."
        />
        <Field label="Placement">
          <select
            className={selectClass}
            value={config.newsPlacement}
            onChange={(e) => set("newsPlacement", e.target.value as TickerConfig["newsPlacement"])}
          >
            <option value="section" className={optionClass}>
              Separate section after the quotes
            </option>
            <option value="interleaved" className={optionClass}>
              One headline after every five quotes
            </option>
          </select>
        </Field>
        <Field label="Scope">
          <select
            className={selectClass}
            value={config.newsScope}
            onChange={(e) => set("newsScope", e.target.value as TickerConfig["newsScope"])}
          >
            <option value="general" className={optionClass}>
              General market news
            </option>
            <option value="selected" className={optionClass}>
              Headlines about the first five shown stocks
            </option>
          </select>
        </Field>
        <p className="text-xs text-muted-foreground">
          Headlines are shown exactly as the provider publishes them; nothing is generated or
          labeled "breaking" by this app. Check Finnhub's terms before redistributing news on a
          commercial stream.
        </p>
      </Card>
    </div>
  );
}

function PresetPanel({
  access,
  draft,
  setDraft,
  presets,
  setPresets,
}: {
  access: Access;
  draft: TickerConfig;
  setDraft: (c: TickerConfig) => void;
  presets: Record<string, TickerConfig>;
  setPresets: (p: Record<string, TickerConfig>) => void;
}) {
  const [name, setName] = useState("");
  const save = async () => {
    try {
      const data = await control<{ presets: Record<string, unknown> }>({
        action: "preset",
        ...access,
        name,
        config: draft,
      });
      setPresets(
        Object.fromEntries(Object.entries(data.presets).map(([k, v]) => [k, sanitizeConfig(v)])),
      );
      toast.success(`Saved preset "${name}"`);
      setName("");
    } catch (e) {
      toast.error((e as Error).message);
    }
  };
  const remove = async (preset: string) => {
    try {
      const data = await control<{ presets: Record<string, unknown> }>({
        action: "deletePreset",
        ...access,
        name: preset,
      });
      setPresets(
        Object.fromEntries(Object.entries(data.presets).map(([k, v]) => [k, sanitizeConfig(v)])),
      );
    } catch (e) {
      toast.error((e as Error).message);
    }
  };
  return (
    <div className="mt-4 max-w-2xl">
      <Card title="Presets">
        <p className="text-xs text-muted-foreground">
          Presets are stored in your Supabase database. Loading one changes the draft; press Apply
          to stream to publish it.
        </p>
        <div className="flex gap-2">
          <Input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Preset name, e.g. Earnings week"
            maxLength={40}
          />
          <Button onClick={save} disabled={!name.trim()}>
            Save draft as preset
          </Button>
        </div>
        <ul className="divide-y divide-border rounded-md border border-border">
          <li className="flex items-center justify-between px-3 py-2 text-sm">
            <span>
              Safe default{" "}
              <span className="text-xs text-muted-foreground">
                · Technology, 8 stocks, ETFs, news
              </span>
            </span>
            <Button size="sm" variant="outline" onClick={() => setDraft(defaultConfig)}>
              Load
            </Button>
          </li>
          {Object.entries(presets).map(([preset, config]) => (
            <li key={preset} className="flex items-center justify-between gap-2 px-3 py-2 text-sm">
              <span className="truncate">
                {preset}{" "}
                <span className="text-xs text-muted-foreground">· {modeLabels[config.mode]}</span>
              </span>
              <span className="flex gap-1">
                <Button size="sm" variant="outline" onClick={() => setDraft(config)}>
                  Load
                </Button>
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() => remove(preset)}
                  aria-label={`Delete ${preset}`}
                >
                  <Trash2 className="size-4" />
                </Button>
              </span>
            </li>
          ))}
        </ul>
      </Card>
    </div>
  );
}

// The server's sealed copy wins (it follows replacements made on other
// devices); a key only this browser knows is sealed and uploaded.
async function syncOverlayKey(access: Access, overlaySealed: string | null) {
  let local: string | null = null;
  try {
    local = localStorage.getItem(overlayKeyStorage(access.id));
  } catch {
    // storage unavailable
  }
  const opened = overlaySealed ? await openOverlayKey(access.key, overlaySealed) : null;
  if (opened) {
    try {
      localStorage.setItem(overlayKeyStorage(access.id), opened);
    } catch {
      // storage unavailable
    }
    return opened;
  }
  if (local && !overlaySealed)
    void control({
      action: "seal",
      ...access,
      overlaySealed: await sealOverlayKey(access.key, local),
    }).catch(() => {});
  return local;
}

function LinksPanel({
  access,
  relay,
  quotes,
  overlayKey,
  setOverlayKey,
}: {
  access: Access;
  relay: Relay;
  quotes: CachedQuote[];
  overlayKey: string | null;
  setOverlayKey: (key: string) => void;
}) {
  const copy = (text: string) =>
    navigator.clipboard.writeText(text).then(() => toast.success("Copied"));
  const rotate = async (role: "overlay" | "control") => {
    if (
      !confirm(
        role === "overlay"
          ? "Replace the overlay link? OBS keeps working only after you paste the new link into the Browser Source."
          : "Replace this dashboard link? The current link stops working.",
      )
    )
      return;
    const newKey = randomKey();
    try {
      // Re-seal the overlay key under whichever key is current afterwards.
      const overlaySealed =
        role === "overlay"
          ? await sealOverlayKey(access.key, newKey)
          : overlayKey
            ? await sealOverlayKey(newKey, overlayKey)
            : null;
      await control({ action: "rotate", ...access, role, newKey, overlaySealed });
      if (role === "overlay") {
        setOverlayKey(newKey);
        try {
          localStorage.setItem(overlayKeyStorage(access.id), newKey);
        } catch {
          // storage unavailable
        }
        toast.success("New overlay link created — paste it into OBS");
      } else {
        window.location.hash = `${access.id}.${newKey}`;
        window.location.reload();
      }
    } catch (e) {
      toast.error((e as Error).message);
    }
  };
  const newest = quotes.reduce((max, q) => Math.max(max, q.timestamp), 0);
  return (
    <div className="mt-4 grid gap-6 lg:grid-cols-2">
      <Card title="Overlay link (OBS Browser Source)">
        {linksNeedLogin() && (
          <p className="rounded-md border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-sm">
            This link is on Lovable&apos;s private preview address, which would ask OBS to log in.
            Publish the site and open this dashboard on the published address once; after that,
            links copied anywhere use the published address automatically.
          </p>
        )}
        <p className="text-xs text-muted-foreground">
          Treat it like a password: anyone with it can display your ticker (but cannot change it).
          It shows on any device you open this dashboard on. Creating a new one stops the old link,
          so OBS needs the new one pasted in.
        </p>
        {overlayKey ? (
          <div className="flex gap-2">
            <Input readOnly value={accessLink("/overlay", { id: access.id, key: overlayKey })} />
            <Button
              variant="secondary"
              onClick={() => copy(accessLink("/overlay", { id: access.id, key: overlayKey }))}
            >
              <Copy className="size-4" />
            </Button>
          </div>
        ) : (
          <Button variant="outline" onClick={() => rotate("overlay")}>
            Create a new overlay link
          </Button>
        )}
      </Card>
      <Card title="Dashboard link">
        <div className="flex gap-2">
          <Input readOnly value={accessLink("/dashboard", access)} />
          <Button variant="secondary" onClick={() => copy(accessLink("/dashboard", access))}>
            <Copy className="size-4" />
          </Button>
        </div>
        <Button variant="outline" onClick={() => rotate("control")}>
          Replace dashboard link
        </Button>
      </Card>
      <Card title="Health">
        <dl className="grid grid-cols-[160px_1fr] gap-y-1.5 text-sm">
          <dt className="text-muted-foreground">Relay</dt>
          <dd>
            {relay?.live
              ? `${relay.status}${relay.message ? ` — ${relay.message}` : ""}`
              : "offline (overlay not open)"}
          </dd>
          <dt className="text-muted-foreground">Streaming symbols</dt>
          <dd>{relay?.live ? relay.symbols.length : 0}</dd>
          <dt className="text-muted-foreground">Relay session started</dt>
          <dd>{relay?.startedAt ? new Date(relay.startedAt).toLocaleTimeString() : "—"}</dd>
          <dt className="text-muted-foreground">Newest quote</dt>
          <dd>{newest ? formatTime(newest) : "—"}</dd>
          <dt className="text-muted-foreground">Market</dt>
          <dd>
            {relay?.market
              ? `${relay.market.session}${relay.market.holiday ? ` (${relay.market.holiday})` : ""}`
              : "—"}
          </dd>
          <dt className="text-muted-foreground">Finnhub key</dt>
          <dd>{relay ? (relay.hasProviderKey ? "set" : "missing") : "—"}</dd>
          <dt className="text-muted-foreground">Logo.dev key</dt>
          <dd>{relay ? (relay.hasLogoKey ? "set" : "missing") : "—"}</dd>
        </dl>
      </Card>
      <Card title="OBS quick setup">
        <ol className="list-decimal space-y-1 pl-5 text-sm text-muted-foreground">
          <li>Sources → + → Browser.</li>
          <li>URL: the overlay link. Width 1920, Height 1080.</li>
          <li>
            Canvas bigger than 1080p (1440p, 4K)? Keep 1920 × 1080 and scale the source to fill the
            canvas (right-click → Transform → Fit to screen) so the text keeps its size.
          </li>
          <li>Leave Custom CSS empty (the page is already transparent).</li>
          <li>Keep "Shutdown source when not visible" off so it stays connected.</li>
          <li>
            Use one Browser Source with this link; add it to other scenes as a reference (Paste
            Reference), not a copy.
          </li>
        </ol>
      </Card>
    </div>
  );
}
