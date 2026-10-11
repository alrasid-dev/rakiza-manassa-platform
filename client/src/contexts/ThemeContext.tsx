import React, { createContext, useContext, useEffect, useState } from "react";
import { useAuth } from "@/_core/hooks/useAuth";
import { trpc } from "@/lib/trpc";

type Theme = "light" | "dark";

interface ThemeContextType {
  theme: Theme;
  toggleTheme?: () => void;
  switchable: boolean;
}

const ThemeContext = createContext<ThemeContextType | undefined>(undefined);

interface ThemeProviderProps {
  children: React.ReactNode;
  defaultTheme?: Theme;
  switchable?: boolean;
}

function themeStorageKey(userId?: number | string | null) {
  return userId != null ? `rakiza:theme:${userId}` : "rakiza:theme";
}

export function ThemeProvider({
  children,
  defaultTheme = "light",
  switchable = false,
}: ThemeProviderProps) {
  const { user } = useAuth();
  const prefs = trpc.court.workPreferences.mine.useQuery(undefined, { enabled: switchable && Boolean(user) });
  const updatePrefs = trpc.court.workPreferences.update.useMutation();

  const [theme, setTheme] = useState<Theme>(() => {
    if (!switchable) return defaultTheme;
    if (typeof window === "undefined") return defaultTheme;
    const stored = window.localStorage.getItem(themeStorageKey(user?.id));
    return stored === "dark" || stored === "light" ? stored : defaultTheme;
  });

  // عند وصول تفضيلات الخادم (المصدر الموثوق) → طبّقها وحدّث الـ cache
  useEffect(() => {
    if (switchable && prefs.data?.theme) {
      setTheme(prefs.data.theme);
    }
  }, [prefs.data?.theme, switchable]);

  useEffect(() => {
    const root = document.documentElement;
    root.dataset.theme = theme;
    root.style.colorScheme = theme;
    if (theme === "dark") {
      root.classList.add("dark");
    } else {
      root.classList.remove("dark");
    }

    if (switchable) {
      window.localStorage.setItem(themeStorageKey(user?.id), theme);
    }
  }, [theme, switchable, user?.id]);

  const toggleTheme = switchable
    ? () => {
        setTheme(prev => {
          const next: Theme = prev === "light" ? "dark" : "light";
          if (user) updatePrefs.mutate({ theme: next });
          return next;
        });
      }
    : undefined;

  return (
    <ThemeContext.Provider value={{ theme, toggleTheme, switchable }}>
      {children}
    </ThemeContext.Provider>
  );
}

export function useTheme() {
  const context = useContext(ThemeContext);
  return context ?? { theme: "light", toggleTheme: undefined, switchable: false };
}
