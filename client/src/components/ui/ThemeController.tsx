'use client';

import { useEffect, useRef } from 'react';
import { readPreferences, usePreferences } from '@/lib/preferences';

/**
 * Runs before first paint (inlined in <head>) so the saved theme and accent apply
 * without a flash of the default colors. Keep in sync with ThemeController below.
 */
export const themeBootScript = `try{var p=JSON.parse(localStorage.getItem('cengine_prefs')||'{}'),d=document.documentElement;if(p.theme==='light'||p.theme==='dark')d.dataset.theme=p.theme;if(p.accent)d.dataset.accent=p.accent;}catch(e){}`;

/** Applies the theme and accent preferences to <html> whenever they change. */
export function ThemeController() {
  const { prefs } = usePreferences();
  const mounted = useRef(false);

  useEffect(() => {
    const root = document.documentElement;
    // Read storage directly: during hydration `prefs` is still the server default, and
    // applying that would undo what the boot script set and cause a flash.
    const apply = () => {
      const { theme, accent } = readPreferences();
      if (theme === 'system') delete root.dataset.theme;
      else root.dataset.theme = theme;
      root.dataset.accent = accent;
    };

    if (!mounted.current) {
      mounted.current = true;
      apply();
      return;
    }
    // Fade colors briefly when the user switches themes
    root.classList.add('theme-transition');
    apply();
    const t = setTimeout(() => root.classList.remove('theme-transition'), 250);
    return () => clearTimeout(t);
  }, [prefs.theme, prefs.accent]);

  return null;
}
