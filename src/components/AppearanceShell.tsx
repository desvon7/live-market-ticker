import { useEffect, useState, type ReactNode } from "react";
import { Moon, Sun, Sparkles } from "lucide-react";
import { Toaster } from "sonner";
import { Button } from "@/components/ui/button";

type Appearance = "dark" | "light" | "glass";
const modes = [
  { value: "dark", label: "Dark", icon: Moon },
  { value: "light", label: "Light", icon: Sun },
  { value: "glass", label: "Apple Glass", icon: Sparkles },
] as const;

export function AppearanceShell({ children }: { children?: ReactNode }) {
  const [appearance, setAppearance] = useState<Appearance>("dark");
  useEffect(() => {
    try {
      const saved = localStorage.getItem("javon-journey-appearance");
      if (saved === "dark" || saved === "light" || saved === "glass") setAppearance(saved);
    } catch { /* Keep the default when storage is unavailable. */ }
  }, []);

  const select = (value: Appearance) => {
    setAppearance(value);
    try { localStorage.setItem("javon-journey-appearance", value); } catch { /* Session-only choice. */ }
  };

  return (
    <div data-appearance={appearance} className={`appearance-shell min-h-screen bg-background text-foreground ${appearance === "dark" ? "dark" : ""}`}>
      <div className="appearance-bar border-b border-border">
        <div className="mx-auto flex max-w-[1400px] flex-wrap items-center justify-between gap-3 px-6 py-3">
          <span className="font-semibold">Javon Journey</span>
          <div role="group" aria-label="Appearance" className="flex items-center gap-1">
            {modes.map(({ value, label, icon: Icon }) => (
              <Button key={value} variant={appearance === value ? "secondary" : "ghost"} size="sm" aria-pressed={appearance === value} onClick={() => select(value)}>
                <Icon className="size-4" />{label}
              </Button>
            ))}
          </div>
        </div>
      </div>
      <Toaster theme={appearance === "dark" ? "dark" : "light"} position="bottom-right" />
      {children}
    </div>
  );
}