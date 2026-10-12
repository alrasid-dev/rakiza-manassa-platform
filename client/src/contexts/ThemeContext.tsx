import React, { createContext, useContext, useEffect, useRef, useState } from "react";
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

// يقرأ الثيم المخزَّن (rakiza:theme ثم legacy 'theme') مطابقًا لسكربت <head> — يمنع الوميض عند الإقلاع.
function readCachedTheme(defaultTheme: Theme): Theme {
  if (typeof window === "undefined") return defaultTheme;
  try {
    const unified = window.localStorage.getItem("rakiza:theme");
    if (unified === "dark" || unified === "light") return unified;
    const legacy = window.localStorage.getItem("theme");
    if (legacy === "dark" || legacy === "light") return legacy;
    return defaultTheme;
  } catch {
    return defaultTheme;
  }
}

export function ThemeProvider({
  children,
  defaultTheme = "light",
  switchable = false,
}: ThemeProviderProps) {
  const { user } = useAuth();
  const utils = trpc.useUtils();
  const justToggled = useRef(false);
  const prefs = trpc.court.workPreferences.mine.useQuery(undefined, { enabled: switchable && Boolean(user) });
  const updatePrefs = trpc.court.workPreferences.update.useMutation({
    onSuccess: () => utils.court.workPreferences.mine.invalidate(),
  });

  const [theme, setTheme] = useState<Theme>(() => {
    if (!switchable) return defaultTheme;
    return readCachedTheme(defaultTheme);
  });

  // عند وصول تفضيلات الخادم (المصدر الموثوق) → طبّقها وحدّث الـ cache
  useEffect(() => {
    if (justToggled.current) {
      justToggled.current = false;
      return;
    }
    if (switchable && prefs.data?.theme) {
      setTheme(prefs.data.theme);
    }
  }, [prefs.data?.theme, switchable]);

  useEffect(() => {
    const root = document.documentElement;
    root.style.colorScheme = theme;
    if (theme === "dark") {
      root.classList.add("dark");
    } else {
      root.classList.remove("dark");
    }

    if (switchable) {
      window.localStorage.setItem("rakiza:theme", theme);
    }
  }, [theme, switchable]);

  // تنظيف لمرة واحدة: إزالة المفاتيح القديمة rakiza:theme:{userId}
  useEffect(() => {
    try {
      const keys = Object.keys(window.localStorage);
      for (const key of keys) {
        if (key.startsWith("rakiza:theme:") && key !== "rakiza:theme") {
          window.localStorage.removeItem(key);
        }
      }
    } catch {
      /* ignore */
    }
  }, []);

  const toggleTheme = switchable
    ? () => {
        justToggled.current = true;
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
