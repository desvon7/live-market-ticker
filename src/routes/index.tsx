import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { Copy } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { type Access, accessLink, control, randomKey } from "@/lib/market";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [{ title: "Market ticker for OBS" }, { name: "robots", content: "noindex, nofollow" }],
  }),
  component: Setup,
});

// One-time setup: creates the ticker and shows its two secret links. The
// backend refuses a second ticker, so this page is harmless once used.
function Setup() {
  const [links, setLinks] = useState<{ dashboard: string; overlay: string } | null>(null);
  const [saved, setSaved] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [needsCode, setNeedsCode] = useState(false);
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    try {
      setSaved(localStorage.getItem("ticker-dashboard-link"));
    } catch {
      // storage unavailable
    }
  }, []);

  const create = async () => {
    setBusy(true);
    setError(null);
    const controlKey = randomKey();
    const overlayKey = randomKey();
    try {
      const { id } = await control<{ id: string }>({
        action: "create",
        controlKey,
        overlayKey,
        ...(code ? { setupCode: code } : {}),
      });
      const dashboard: Access = { id, key: controlKey };
      const overlay: Access = { id, key: overlayKey };
      try {
        localStorage.setItem("ticker-dashboard-link", accessLink("/dashboard", dashboard));
        localStorage.setItem(`ticker-overlay-key:${id}`, overlayKey);
      } catch {
        // storage unavailable
      }
      setLinks({
        dashboard: accessLink("/dashboard", dashboard),
        overlay: accessLink("/overlay", overlay),
      });
    } catch (e) {
      const err = e as Error & { data?: { needsSetupCode?: boolean } };
      if (err.data?.needsSetupCode) setNeedsCode(true);
      setError(err.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="dark min-h-screen bg-background text-foreground">
      <main className="mx-auto max-w-xl px-6 py-20">
        <p className="text-xs font-semibold uppercase tracking-[0.18em] text-muted-foreground">
          OBS market ticker
        </p>
        <h1 className="mt-3 text-3xl font-semibold tracking-tight">
          A broadcast ticker for the bottom of your stream
        </h1>
        <p className="mt-3 text-sm text-muted-foreground">
          Live Finnhub trades relayed by your Supabase project, verified company logos, and a
          private dashboard. The overlay runs on its own in OBS; the dashboard can stay closed.
        </p>

        {links ? (
          <div className="mt-10 space-y-6">
            <div className="rounded-lg border border-amber-500/40 bg-amber-500/10 px-4 py-3 text-sm">
              Save both links now (a password manager is ideal). They are the only way in; nothing
              else identifies you.
            </div>
            <LinkRow
              label="Private dashboard"
              hint="Open on your second monitor. Never show it on stream."
              value={links.dashboard}
            />
            <LinkRow
              label="OBS overlay"
              hint="Paste into an OBS Browser Source at 1920 × 1080."
              value={links.overlay}
            />
            <Button asChild>
              <a href={links.dashboard.replace(window.location.origin, "")}>Open dashboard</a>
            </Button>
          </div>
        ) : (
          <div className="mt-10 space-y-4">
            {saved && (
              <Button asChild variant="secondary">
                <a href={saved.replace(window.location.origin, "")}>Open my dashboard</a>
              </Button>
            )}
            {needsCode && (
              <Input
                value={code}
                onChange={(e) => setCode(e.target.value)}
                placeholder="Setup code (TICKER_SETUP_CODE)"
              />
            )}
            <div>
              <Button onClick={create} disabled={busy}>
                {busy ? "Creating…" : "Create my ticker"}
              </Button>
            </div>
            {error && <p className="text-sm text-red-400">{error}</p>}
            <p className="text-xs text-muted-foreground">
              One ticker per Supabase project. Lost your links? Delete the row in the{" "}
              <code>ticker_channels</code> table and create it again.
            </p>
          </div>
        )}
      </main>
    </div>
  );
}

function LinkRow({ label, hint, value }: { label: string; hint: string; value: string }) {
  return (
    <div className="space-y-1.5">
      <p className="text-sm font-medium">{label}</p>
      <div className="flex gap-2">
        <Input readOnly value={value} onFocus={(e) => e.currentTarget.select()} />
        <Button
          variant="secondary"
          onClick={() => navigator.clipboard.writeText(value)}
          aria-label={`Copy ${label} link`}
        >
          <Copy className="size-4" />
        </Button>
      </div>
      <p className="text-xs text-muted-foreground">{hint}</p>
    </div>
  );
}
