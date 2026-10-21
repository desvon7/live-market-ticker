import {
  memo,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type ReactNode,
} from "react";
import {
  activeSymbols,
  formatChange,
  formatDate,
  formatPrice,
  formatTime,
  freshness,
  initials,
  logoSrc,
  type FeedStatus,
  type MarketSession,
  type NewsItem,
  type Quote,
  registry,
  securityKind,
  type TickerConfig,
} from "@/lib/market";

export type TickerBarProps = {
  config: TickerConfig;
  channelId: string;
  quotes: Record<string, Quote>;
  sparks?: Record<string, number[]>;
  news?: NewsItem[];
  status: FeedStatus;
  message?: string | null;
  market?: MarketSession | null;
  // Dashboard preview renders inside a scaled box instead of the 1920 canvas.
  embedded?: boolean;
};

const font = '"Inter", "SF Pro Display", -apple-system, "Helvetica Neue", Arial, sans-serif';

// The broadcast strip: a fixed status cap on the left and a seamless scroller.
export function TickerBar(props: TickerBarProps) {
  const { config } = props;
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 15_000);
    return () => clearInterval(timer);
  }, []);
  const symbols = useMemo(() => activeSymbols(config, now), [config, Math.floor(now / 60_000)]); // eslint-disable-line react-hooks/exhaustive-deps

  const height = config.height;
  const style: CSSProperties = {
    position: props.embedded ? "relative" : "absolute",
    bottom: 0,
    [config.safeSide === "right" ? "left" : "right"]: 0,
    width: `calc(100% - ${config.safeArea}px)`,
    height,
    display: "flex",
    alignItems: "stretch",
    overflow: "hidden",
    color: config.appearance === "dark" ? config.textColor : "var(--ticker-foreground)",
    fontFamily: font,
    fontSize: config.fontSize,
    fontFeatureSettings: '"tnum" 1, "lnum" 1',
    background: `linear-gradient(180deg, color-mix(in oklab, var(--ticker-top) ${config.opacity}%, transparent), color-mix(in oklab, var(--ticker-bottom) ${config.opacity}%, transparent))`,
    borderTop: "1px solid var(--ticker-border)",
    boxShadow: "var(--ticker-shadow)",
    WebkitFontSmoothing: "antialiased",
  };

  const items: ReactNode[] = [];
  const headlines = config.news ? (props.news ?? []) : [];
  symbols.forEach((symbol, index) => {
    items.push(
      <TickerItem
        key={symbol}
        symbol={symbol}
        quote={props.quotes[symbol]}
        spark={config.showSparklines ? props.sparks?.[symbol] : undefined}
        config={config}
        channelId={props.channelId}
        now={now}
      />,
    );
    // Interleaved: one headline after every five quotes.
    if (config.newsPlacement === "interleaved" && headlines.length && (index + 1) % 5 === 0) {
      const item = headlines[Math.floor(index / 5) % headlines.length];
      if (item) items.push(<Headline key={`n-${index}-${item.id}`} item={item} config={config} />);
    }
  });
  if (config.newsPlacement === "section" && headlines.length) {
    items.push(<SectionLabel key="news-label" config={config} label="Headlines" />);
    headlines
      .slice(0, 6)
      .forEach((item) => items.push(<Headline key={`n-${item.id}`} item={item} config={config} />));
  }

  return (
    <div style={style} data-ticker-bar data-overlay-mode={config.appearance ?? "dark"}>
      {config.showStatus && <StatusCap {...props} now={now} />}
      <Scroller config={config}>{items}</Scroller>
    </div>
  );
}

function Scroller({ config, children }: { config: TickerConfig; children: ReactNode }) {
  const viewport = useRef<HTMLDivElement>(null);
  const track = useRef<HTMLDivElement>(null);
  const first = useRef<HTMLDivElement>(null);
  const [copies, setCopies] = useState(2);
  const motion = useRef({
    speed: config.speed,
    paused: config.paused,
    direction: config.direction,
    offset: 0,
    width: 0,
  });
  motion.current.speed = config.speed;
  motion.current.paused = config.paused;
  motion.current.direction = config.direction;

  useEffect(() => {
    motion.current.offset = 0;
  }, [config.resetAt]);

  // Measure once per layout change, never per frame.
  useLayoutEffect(() => {
    const measure = () => {
      const width = first.current?.offsetWidth ?? 0;
      const view = viewport.current?.offsetWidth ?? 0;
      motion.current.width = width;
      if (width > 0) setCopies(Math.max(2, Math.ceil(view / width) + 1));
    };
    measure();
    const observer = new ResizeObserver(measure);
    if (first.current) observer.observe(first.current);
    if (viewport.current) observer.observe(viewport.current);
    return () => observer.disconnect();
  }, []);

  // A single rAF loop writes the transform directly; quote updates re-render
  // items but never restart or reset the motion.
  useEffect(() => {
    let frame = 0;
    let last = performance.now();
    const step = (time: number) => {
      const m = motion.current;
      const dt = Math.min(0.1, (time - last) / 1000);
      last = time;
      if (m.width > 0) {
        if (!m.paused) m.offset += (m.direction === "left" ? -1 : 1) * m.speed * dt;
        m.offset = (((m.offset % m.width) + m.width) % m.width) - m.width;
        if (track.current)
          track.current.style.transform = `translate3d(${m.offset.toFixed(2)}px,0,0)`;
      }
      frame = requestAnimationFrame(step);
    };
    frame = requestAnimationFrame(step);
    return () => cancelAnimationFrame(frame);
  }, []);

  return (
    <div
      ref={viewport}
      style={{
        position: "relative",
        flex: 1,
        overflow: "hidden",
        maskImage:
          "linear-gradient(90deg, transparent 0, #000 28px, #000 calc(100% - 28px), transparent 100%)",
      }}
    >
      <div
        ref={track}
        style={{
          position: "absolute",
          inset: 0,
          display: "flex",
          alignItems: "center",
          willChange: "transform",
          whiteSpace: "nowrap",
        }}
      >
        {Array.from({ length: copies }, (_, i) => (
          <div
            key={i}
            ref={i === 0 ? first : undefined}
            aria-hidden={i > 0}
            style={{ display: "flex", alignItems: "center", flexShrink: 0 }}
          >
            {children}
          </div>
        ))}
      </div>
    </div>
  );
}

const Divider = () => (
  <span
    style={{
      width: 1,
      alignSelf: "stretch",
      margin: "22% 0",
      background: "var(--ticker-border)",
    }}
  />
);

const TickerItem = memo(function TickerItem({
  symbol,
  quote,
  spark,
  config,
  channelId,
  now,
}: {
  symbol: string;
  quote: Quote | undefined;
  spark: number[] | undefined;
  config: TickerConfig;
  channelId: string;
  now: number;
}) {
  const kind = securityKind(symbol);
  const change = quote ? formatChange(quote) : null;
  const direction = !quote?.change ? 0 : quote.change > 0 ? 1 : -1;
  const color =
    direction > 0 ? config.upColor : direction < 0 ? config.downColor : "var(--ticker-muted)";
  const fresh = freshness(quote, now);
  const flash = useFlash(quote?.price);
  const name = registry[symbol]?.name;
  const fs = config.fontSize;
  return (
    <>
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: fs * 0.5,
          padding: `0 ${fs * 1.1}px`,
          flexShrink: 0,
        }}
      >
        {config.showLogos && (
          <Logo symbol={symbol} size={config.logoSize} src={logoSrc(symbol, channelId, config)} />
        )}
        <span style={{ fontWeight: 650, letterSpacing: "0.02em" }}>{symbol}</span>
        {kind === "ETF" && (
          <span
            style={{
              fontSize: fs * 0.5,
              fontWeight: 600,
              letterSpacing: "0.08em",
              padding: "0.15em 0.45em",
              borderRadius: 4,
              border: "1px solid var(--ticker-border)",
              color: "var(--ticker-muted)",
            }}
          >
            ETF
          </span>
        )}
        {config.showNames && name && (
          <span
            style={{
              fontSize: fs * 0.72,
              color: "var(--ticker-muted)",
              maxWidth: fs * 12,
              overflow: "hidden",
              textOverflow: "ellipsis",
            }}
          >
            {name}
          </span>
        )}
        <span
          style={{
            fontWeight: 500,
            fontVariantNumeric: "tabular-nums",
            opacity: fresh === "stale" ? 0.62 : 1,
            transition: "color 600ms ease",
            color: flash ? (flash > 0 ? config.upColor : config.downColor) : undefined,
          }}
        >
          {quote ? formatPrice(quote.price) : <span style={{ opacity: 0.4 }}>—</span>}
        </span>
        {change && (
          <span
            style={{
              color,
              fontWeight: 500,
              fontSize: fs * 0.82,
              fontVariantNumeric: "tabular-nums",
              display: "inline-flex",
              alignItems: "center",
              gap: fs * 0.3,
            }}
          >
            <Arrow direction={direction} size={fs * 0.42} />
            {change.abs}
            <span style={{ opacity: 0.85 }}>({change.pct})</span>
          </span>
        )}
        {spark && spark.length > 2 && <Sparkline points={spark} color={color} height={fs * 0.9} />}
      </div>
      <Divider />
    </>
  );
});

// Brief color hint when a price moves; the value itself updates in place.
function useFlash(price: number | undefined) {
  const previous = useRef(price);
  const [flash, setFlash] = useState(0);
  useEffect(() => {
    if (price === undefined || previous.current === undefined || price === previous.current) {
      previous.current = price;
      return;
    }
    setFlash(price > previous.current ? 1 : -1);
    previous.current = price;
    const timer = setTimeout(() => setFlash(0), 700);
    return () => clearTimeout(timer);
  }, [price]);
  return flash;
}

function Arrow({ direction, size }: { direction: number; size: number }) {
  if (!direction) return null;
  return (
    <svg width={size * 1.6} height={size} viewBox="0 0 16 10" aria-hidden>
      <path d={direction > 0 ? "M8 0 L16 10 L0 10 Z" : "M0 0 L16 0 L8 10 Z"} fill="currentColor" />
    </svg>
  );
}

const Logo = memo(function Logo({
  symbol,
  size,
  src,
}: {
  symbol: string;
  size: number;
  src: string;
}) {
  const [failed, setFailed] = useState(false);
  useEffect(() => setFailed(false), [src]);
  // Fixed box so loading or failed logos never shift the layout.
  const box: CSSProperties = {
    width: size,
    height: size,
    borderRadius: size * 0.24,
    flexShrink: 0,
    overflow: "hidden",
    display: "grid",
    placeItems: "center",
  };
  if (failed) {
    return (
      <span
        style={{
          ...box,
          background: "linear-gradient(180deg,#3a3a3c,#2c2c2e)",
          border: "1px solid rgba(255,255,255,0.14)",
          fontSize: size * 0.38,
          fontWeight: 700,
          color: "rgba(235,235,245,0.85)",
          letterSpacing: "0.02em",
        }}
      >
        {initials(symbol)}
      </span>
    );
  }
  return (
    <span style={{ ...box, background: "#fff" }}>
      <img
        src={src}
        alt=""
        width={size}
        height={size}
        decoding="async"
        onError={() => setFailed(true)}
        style={{ width: "100%", height: "100%", objectFit: "contain" }}
      />
    </span>
  );
});

function Sparkline({ points, color, height }: { points: number[]; color: string; height: number }) {
  const width = height * 2.6;
  const min = Math.min(...points);
  const max = Math.max(...points);
  const range = max - min || 1;
  const d = points
    .map(
      (p, i) =>
        `${((i / (points.length - 1)) * width).toFixed(1)},${(height - ((p - min) / range) * (height - 2) - 1).toFixed(1)}`,
    )
    .join(" ");
  return (
    <svg width={width} height={height} aria-hidden style={{ opacity: 0.85 }}>
      <polyline
        points={d}
        fill="none"
        stroke={color}
        strokeWidth={1.4}
        strokeLinejoin="round"
        strokeLinecap="round"
      />
    </svg>
  );
}

function SectionLabel({ label, config }: { label: string; config: TickerConfig }) {
  return (
    <>
      <span
        style={{
          padding: `0 ${config.fontSize * 0.9}px`,
          fontSize: config.fontSize * 0.58,
          fontWeight: 700,
          letterSpacing: "0.14em",
          textTransform: "uppercase",
          color: "var(--ticker-muted)",
        }}
      >
        {label}
      </span>
    </>
  );
}

function Headline({ item, config }: { item: NewsItem; config: TickerConfig }) {
  const fs = config.fontSize;
  return (
    <>
      <div
        style={{
          display: "flex",
          alignItems: "baseline",
          gap: fs * 0.55,
          padding: `0 ${fs * 1.1}px`,
          flexShrink: 0,
        }}
      >
        <span
          style={{
            fontSize: fs * 0.82,
            fontWeight: 500,
            maxWidth: fs * 34,
            overflow: "hidden",
            textOverflow: "ellipsis",
          }}
        >
          {item.headline}
        </span>
        <span style={{ fontSize: fs * 0.6, color: "var(--ticker-muted)", letterSpacing: "0.04em" }}>
          {item.source} · {formatTime(item.datetime * 1000)}
        </span>
      </div>
      <Divider />
    </>
  );
}

const sessionLabel: Record<MarketSession["session"], string> = {
  "pre-market": "Pre-market",
  regular: "Market open",
  "post-market": "After hours",
  closed: "Market closed",
};

function StatusCap({
  config,
  quotes,
  status,
  message,
  market,
  now,
}: TickerBarProps & { now: number }) {
  const latest = Object.values(quotes).reduce((max, q) => Math.max(max, q.timestamp), 0);
  const anyLive = Object.values(quotes).some((q) => freshness(q, now) === "live");
  let dot = "#8e8e93";
  let title = market ? sessionLabel[market.session] : "Markets";
  let detail = latest ? `As of ${formatTime(latest)}` : "Loading quotes";
  if (status === "connected" && anyLive) {
    dot = config.upColor;
    detail = "Live trades";
  } else if (market?.isOpen === false || market?.session === "closed") {
    detail = latest ? `Last trade ${formatTime(latest)}` : "Last close";
  }
  if (status === "reconnecting" || status === "connecting") {
    dot = "#ffd60a";
    detail = status === "connecting" && !latest ? "Connecting" : "Reconnecting";
  } else if (status === "duplicate") {
    dot = "#ff9f0a";
    title = "Paused";
    detail = "Another copy is live";
  } else if (status === "offline") {
    // Only the dashboard preview is "offline": no overlay is open, so prices are REST snapshots.
    detail = latest ? `Last price ${formatTime(latest)}` : "Open the overlay to load prices";
  } else if (status === "error") {
    dot = config.downColor;
    detail = latest ? `Offline · ${formatTime(latest)}` : "Data unavailable";
  }
  const fs = config.fontSize;
  return (
    <div
      title={[title, detail, message].filter(Boolean).join(" · ")}
      aria-label={`Subscribe to Javon Journey. ${title}. ${detail}${latest ? `. ${formatDate(latest)}` : ""}`}
      style={{
        display: "flex",
        flexDirection: "column",
        justifyContent: "center",
        gap: fs * 0.18,
        padding: `0 ${fs * 1.1}px`,
        minWidth: fs * 9.5,
        flexShrink: 0,
        borderRight: "1px solid var(--ticker-border)",
        background: "var(--ticker-cap)",
      }}
    >
      <span
        style={{
          display: "flex",
          alignItems: "center",
          gap: fs * 0.4,
          fontSize: fs * 0.62,
          fontWeight: 700,
          letterSpacing: "0.12em",
          textTransform: "uppercase",
        }}
      >
        <span
          style={{
            width: fs * 0.38,
            height: fs * 0.38,
            borderRadius: "50%",
            background: dot,
            boxShadow: dot === config.upColor ? `0 0 0 3px ${dot}22` : undefined,
          }}
        />
        Subscribe
      </span>
      <span style={{ fontSize: fs * 0.74, fontWeight: 650, whiteSpace: "nowrap" }}>
        Javon Journey
      </span>
      <span style={{ fontSize: fs * 0.58, color: "var(--ticker-muted)", whiteSpace: "nowrap" }}>
        {detail}
      </span>
      {latest > 0 && (
        <span style={{ fontSize: fs * 0.52, color: "var(--ticker-muted)", whiteSpace: "nowrap" }}>
          {formatDate(latest)}
        </span>
      )}
    </div>
  );
}
