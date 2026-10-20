import { describe, expect, it } from "vitest";
import {
  activeSymbols,
  defaultConfig,
  parseAccess,
  sanitizeConfig,
  securityKind,
  stocksForConfig,
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
