"use client";

import React, { useEffect, useState } from "react";

export default function SplashScreen() {
  const [visible, setVisible] = useState(true);
  useEffect(() => {
    // Remover a splash após o load da janela ou após 1.2s
    const onLoad = () => setTimeout(() => setVisible(false), 600);
    if (typeof window !== "undefined") {
      if (document.readyState === "complete") {
        // já carregou
        onLoad();
      } else {
        window.addEventListener("load", onLoad, { once: true });
      }
    }
    // Fallback timeout
    const t = setTimeout(() => setVisible(false), 1200);
    return () => {
      clearTimeout(t);
      try {
        window.removeEventListener("load", onLoad);
      } catch { }
    };
  }, []);

  if (!visible) return null;

  return (
    <div className="splash-root" role="status" aria-live="polite">
      <div className="splash-content">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/budget-logo.png" alt="Logo" className="splash-image" />
      </div>
    </div>
  );
}
