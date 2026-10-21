import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { TickerBar } from "@/components/ticker/TickerBar";
import { type Access, defaultConfig, parseAccess } from "@/lib/market";
import { useTickerFeed } from "@/lib/use-ticker-feed";

// OBS Browser Source: 1920 × 1080, transparent everywhere except the ticker.
// The link is /overlay#<id>.<overlay key>; nothing here is interactive.
export const Route = createFileRoute("/overlay")({
  head: () => ({
    meta: [
      { title: "Javon Journey | Live ticker overlay" },
      {
        name: "description",
        content: "Transparent Javon Journey market ticker overlay for OBS broadcasts.",
      },
      { property: "og:title", content: "Javon Journey | Live ticker overlay" },
      {
        property: "og:description",
        content: "Live market prices in a transparent broadcast overlay.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
      { name: "robots", content: "noindex, nofollow" },
    ],
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

  // The hosting badge must never appear on the broadcast canvas.
  useEffect(() => {
    const hide = () => {
      for (const el of document.querySelectorAll<HTMLElement>(
        '#lovable-badge, [id^="lovable-badge"], a[href*="lovable.dev"]',
      )) {
        el.style.setProperty("display", "none", "important");
      }
    };
    hide();
    const observer = new MutationObserver(hide);
    observer.observe(document.body, { childList: true, subtree: true });
    return () => observer.disconnect();
  }, []);

  return (
    <div style={{ position: "fixed", inset: 0, overflow: "hidden", background: "transparent" }}>
      <style>
        {
          'html,body{background:transparent!important;margin:0;overflow:hidden}#lovable-badge,[id^="lovable-badge"]{display:none!important}'
        }
      </style>
      {access === null && (
        <Notice text="Overlay link missing its key. Copy the overlay link from your dashboard." />
      )}
      {/* Draw the bar from the first frame (default look until the relay sends the
          saved settings) so OBS always shows the ticker or a status explaining why not. */}
      {access && (
        <TickerBar
          config={feed.config ?? defaultConfig}
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
