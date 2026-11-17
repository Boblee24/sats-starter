"use client";
import { WalletPanel, useRates } from "@sats/ui";
import { useAppLang } from "../shell";

export default function WalletPage() {
  const lang = useAppLang();
  const rates = useRates();
  return (
    <>
      <h1 className="sr-only">Wallet</h1>
      <WalletPanel slot="wallet" lang={lang} rates={rates} currency={lang === "fr" ? "XOF" : "NGN"} warnIfCanSpend={false} />
    </>
  );
}
