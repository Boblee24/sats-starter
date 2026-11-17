"use client";
import { createContext, useContext, useEffect, type ReactNode } from "react";
import Link from "next/link";
import { DemoBanner, LanguageSwitch, OfflineBanner, useLang } from "@sats/ui";

const LangCtx = createContext<string>("en");
export const useAppLang = () => useContext(LangCtx);

export function Shell({ children, demo }: { children: ReactNode; demo: boolean; nonce?: string }) {
  const [lang, setLang] = useLang("en");

  useEffect(() => {
    if ("serviceWorker" in navigator && process.env.NODE_ENV === "production") {
      navigator.serviceWorker.register("/sw.js").catch(() => {});
    }
  }, []);

  return (
    <LangCtx.Provider value={lang}>
      <DemoBanner show={demo} lang={lang} />
      <OfflineBanner lang={lang} />
      <header className="mx-auto flex max-w-3xl items-center justify-between gap-3 px-4 py-3">
        <Link href="/" className="text-lg font-bold">
          ⚡ sats-starter
        </Link>
        <nav className="flex items-center gap-3">
          <Link href="/wallet" className="font-medium underline-offset-4 hover:underline">
            Wallet
          </Link>
          <LanguageSwitch value={lang} onChange={setLang} />
        </nav>
      </header>
      <main className="mx-auto flex max-w-3xl flex-col items-center gap-6 px-4 pb-16">{children}</main>
    </LangCtx.Provider>
  );
}
