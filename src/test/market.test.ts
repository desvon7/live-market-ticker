import { describe, expect, it } from "vitest";
import {
  activeSymbols,
  defaultConfig,
  formatTime,
  parseAccess,
  sanitizeConfig,
  securityKind,
  stocksForConfig,
  tradeBaseline,
  withChange,
} from "@/lib/market";

describe("market config", () => {
  it("launches with the Technology preset: 8 stocks plus the ETF group", () => {
    expect(activeSymbols(defaultConfig)).toEqual([
      "SPY",
      "QQQ",
      "DIA",
      "IWM",
      "NVDA",
      "AAPL",
      "MSFT",
      "GOOGL",
      "AMZN",
      "META",
      "AVGO",
      "ORCL",
    ]);
  });

  it("labels SPY, QQQ, DIA and IWM as ETFs, not indices", () => {
    for (const symbol of ["SPY", "QQQ", "DIA", "IWM"]) expect(securityKind(symbol)).toBe("ETF");
    expect(securityKind("NVDA")).toBe("stock");
  });

  it("repairs bad stored config field by field", () => {
    const config = sanitizeConfig({
      mode: "nope",
      speed: 9999,
      symbols: ["aapl", "bad symbol!", "AAPL"],
      domains: { nvda: "https://www.NVIDIA.com/x", X: "not a domain" },
    });
    expect(config.mode).toBe(defaultConfig.mode);
    expect(config.symbols).toEqual(["AAPL"]);
    expect(config.domains).toEqual({ NVDA: "nvidia.com" });
  });

  it("applies pinned, hidden and the item limit in every mode", () => {
    const config = sanitizeConfig({
      ...defaultConfig,
      pinned: ["TSLA"],
      hidden: ["AAPL"],
      maxItems: 3,
    });
    expect(stocksForConfig(config)).toEqual(["TSLA", "NVDA", "MSFT"]);
  });

  it("shuffles deterministically and avoids the previous draw", () => {
    const config = sanitizeConfig({
      ...defaultConfig,
      mode: "random",
      randomCount: 10,
      shuffleSeed: 42,
    });
    expect(stocksForConfig(config)).toEqual(stocksForConfig(config));
    const next = stocksForConfig({ ...config, shuffleSeed: 43 });
    expect(next).toHaveLength(10);
  });

  it("caps subscriptions at Finnhub's 50-symbol limit", () => {
    expect(
      activeSymbols(sanitizeConfig({ ...defaultConfig, mode: "all", maxItems: 46 })).length,
    ).toBeLessThanOrEqual(50);
  });
});

describe("quotes and links", () => {
  it("computes daily change from the previous close", () => {
    const q = withChange("NVDA", 110, 0, 100, "trade");
    expect(q.change).toBeCloseTo(10);
    expect(q.percent).toBeCloseTo(10);
    expect(withChange("X", 5, 0, null, "trade").change).toBeNull();
  });

  it("parses secret links from the URL fragment", () => {
    const key = "a".repeat(43);
    expect(parseAccess(`#11111111-2222-3333-4444-555555555555.${key}`)).toEqual({
      id: "11111111-2222-3333-4444-555555555555",
      key,
    });
    expect(parseAccess("#nope")).toBeNull();
  });
});

describe("quote dates", () => {
  // 2026-10-16 is a Friday; 20:00 UTC is 4:00 PM ET.
  const fridayClose = Date.UTC(2026, 9, 16, 20, 0);
  const mondayPremarket = Date.UTC(2026, 9, 19, 12, 0);

  it("adds the day only when a time is not from today in ET", () => {
    expect(formatTime(fridayClose, fridayClose + 60_000)).toBe("4:00 PM ET");
    expect(formatTime(fridayClose, mondayPremarket)).toBe("Fri, Oct 16, 4:00 PM ET");
    // 11:30 PM ET is still the same ET day even though it is the next UTC day.
    const lateEt = Date.UTC(2026, 9, 17, 3, 30);
    expect(formatTime(lateEt, Date.UTC(2026, 9, 16, 14, 0))).toBe("11:30 PM ET");
  });

  it("measures a new day's trades against the latest close", () => {
    const snapshot = withChange("NVDA", 105, fridayClose, 100, "snapshot");
    expect(tradeBaseline(snapshot, fridayClose + 3_600_000)).toBe(100);
    expect(tradeBaseline(snapshot, mondayPremarket)).toBe(105);
    expect(tradeBaseline(null, mondayPremarket)).toBeNull();
  });
});
