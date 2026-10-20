import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { TickerBar } from "@/components/ticker/TickerBar";
import { type Access, parseAccess } from "@/lib/market";
import { useTickerFeed } from "@/lib/use-ticker-feed";

// OBS Browser Source: 1920 × 1080, transparent everywhere except the ticker.
// The link is /overlay#<id>.<overlay key>; nothing here is interactive.
export const Route = createFileRoute("/overlay")({
  head: () => ({
    meta: [{ title: "Ticker overlay" }, { name: "robots", content: "noindex, nofollow" }],
    links: [
      { rel: "preconnect", href: "https://fonts.googleapis.com" },
      { rel: "preconnect", href: "https://fonts.gstatic.com", crossOrigin: "anonymous" },
      {
        rel: "stylesheet",
        href: "https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&display=swap",
      },
    ],
  }),
  component: Overlay,
});

function Overlay() {
  const [access, setAccess] = useState<Access | null | undefined>(undefined);
  useEffect(() => {
    const read = () => setAccess(parseAccess(window.location.hash));
    read();
    window.addEventListener("hashchange", read);
    return () => window.removeEventListener("hashchange", read);
  }, []);
  const feed = useTickerFeed(access ?? null);

  return (
    <div style={{ position: "fixed", inset: 0, overflow: "hidden", background: "transparent" }}>
      <style>{"html,body{background:transparent!important;margin:0;overflow:hidden}"}</style>
      {access === null && (
        <Notice text="Overlay link missing its key. Copy the overlay link from your dashboard." />
      )}
      {access && feed.config && (
        <TickerBar
          config={feed.config}
          channelId={access.id}
          quotes={feed.quotes}
          sparks={feed.sparks}
          news={feed.news}
          status={feed.status}
          message={feed.message}
          market={feed.market}
        />
      )}
      {access && !feed.config && feed.status === "error" && (
        <Notice text={feed.message ?? "This overlay link is invalid or has been replaced."} />
      )}
    </div>
  );
}

// Only shown when the overlay cannot run at all, so it is visible while setting up OBS.
function Notice({ text }: { text: string }) {
  return (
    <div
      style={{
        position: "absolute",
        left: 24,
        bottom: 24,
        padding: "10px 14px",
        borderRadius: 8,
        background: "rgba(10,10,12,0.9)",
        color: "#f5f5f7",
        font: '500 16px "Inter", -apple-system, sans-serif',
      }}
    >
      {text}
    </div>
  );
}
