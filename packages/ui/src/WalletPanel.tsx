"use client";
import { useCallback, useEffect, useState, type ReactNode } from "react";
import { errorCode, formatSats, t, type Fiat, type Rates } from "@sats/core";
import {
  canSpend,
  decodeBolt11,
  verifyPreimage,
  watchPayments,
  type DecodedBolt11,
  type Tx,
  type Wallet,
  type WalletInfo,
} from "@sats/lightning";
import { BigButton, CopyButton, QR, SatsAmount, ScanButton } from "./basics";
import { useWalletConnection } from "./hooks";

type Props = {
  /** IndexedDB slot, so one app can hold several connections (e.g. "merchant" and "customer"). */
  slot?: string;
  lang?: string;
  rates?: Rates | null;
  currency?: Fiat;
  /** Show a red banner when the connection can spend (Konfam wants receive-only). */
  warnIfCanSpend?: boolean;
  allowSend?: boolean;
  /** Extra actions under the balance (e.g. a Claim button). */
  children?: (ctx: { wallet: Wallet; info: WalletInfo; refresh: () => void }) => ReactNode;
  onConnected?: (wallet: Wallet, info: WalletInfo) => void;
};

const MAX_RECEIVE_SATS = 1_000_000;

function errText(code: string | null, lang: string): string {
  if (!code) return "";
  if (code === "INVALID_NWC_URL") return t("wallet.invalid_url", lang);
  if (code === "QUOTA_EXCEEDED") return t("error.budget", lang);
  return `${t("error.generic", lang)} (${code})`;
}

/** The wallet implementation: connect, permissions, balance, receive, send, history, disconnect. */
export function WalletPanel({
  slot = "wallet",
  lang = "en",
  rates,
  currency = "NGN",
  warnIfCanSpend = false,
  allowSend = true,
  children,
  onConnected,
}: Props) {
  const conn = useWalletConnection(slot);
  const [tab, setTab] = useState<"receive" | "send" | "history">("receive");
  const [balance, setBalance] = useState<number | null>(null);
  const [tick, setTick] = useState(0);
  const refresh = useCallback(() => setTick((n) => n + 1), []);

  useEffect(() => {
    if (conn.status === "connected" && conn.wallet && conn.info) onConnected?.(conn.wallet, conn.info);
  }, [conn.status]);

  useEffect(() => {
    const w = conn.wallet;
    if (!w || !conn.info?.methods.includes("get_balance")) return;
    let cancelled = false;
    w.balanceSats()
      .then((b) => !cancelled && setBalance(b))
      .catch(() => !cancelled && setBalance(null));
    return () => {
      cancelled = true;
    };
  }, [conn.wallet, conn.info, tick]);

  if (conn.status === "loading") return <Card><p className="text-[var(--muted)]">…</p></Card>;

  if (conn.status !== "connected" || !conn.wallet || !conn.info) {
    return <ConnectForm lang={lang} busy={conn.status === "connecting"} error={errText(conn.error, lang)} onConnect={conn.connect} />;
  }

  const { wallet, info } = conn;
  const spends = canSpend(info);

  return (
    <Card>
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-sm text-[var(--muted)]">{info.alias ?? t("wallet.title", lang)}</p>
          {balance !== null ? <SatsAmount sats={balance} rates={rates} currency={currency} size="lg" /> : <p className="text-3xl font-bold">—</p>}
        </div>
        <BigButton variant="ghost" onClick={conn.disconnect}>
          {t("wallet.disconnect", lang)}
        </BigButton>
      </div>

      {warnIfCanSpend && spends && (
        <p role="alert" className="rounded-lg bg-[var(--danger)] px-3 py-2 font-medium text-white">
          ⚠ {t("wallet.can_spend", lang)}
        </p>
      )}

      <details className="text-sm">
        <summary className="cursor-pointer py-2 text-[var(--muted)]">{t("wallet.permissions", lang)}</summary>
        <ul className="flex flex-wrap gap-1 pb-2">
          {info.methods.map((m) => (
            <li key={m} className={`rounded px-2 py-0.5 font-mono text-xs ${m.startsWith("pay") ? "bg-[var(--danger)] text-white" : "bg-[var(--surface-2)]"}`}>
              {m}
            </li>
          ))}
        </ul>
        <p className="text-xs text-[var(--muted)]">
          payment_received: {info.notifications.includes("payment_received") ? "✓" : "✗ (polling)"}
        </p>
      </details>

      {children?.({ wallet, info, refresh })}

      <div role="tablist" className="grid grid-cols-3 gap-1 rounded-xl bg-[var(--surface-2)] p-1">
        {(["receive", ...(allowSend ? (["send"] as const) : []), "history"] as const).map((k) => (
          <button
            key={k}
            role="tab"
            aria-selected={tab === k}
            onClick={() => setTab(k)}
            className={`min-h-12 rounded-lg text-base font-semibold ${tab === k ? "bg-[var(--surface)] shadow" : "text-[var(--muted)]"}`}
          >
            {t(`wallet.${k}`, lang)}
          </button>
        ))}
      </div>

      {tab === "receive" && <ReceiveTab wallet={wallet} lang={lang} rates={rates} currency={currency} onPaid={refresh} />}
      {tab === "send" && allowSend && <SendTab wallet={wallet} lang={lang} rates={rates} currency={currency} onPaid={refresh} />}
      {tab === "history" && <HistoryTab wallet={wallet} lang={lang} rates={rates} currency={currency} tick={tick} />}
    </Card>
  );
}

function Card({ children }: { children: ReactNode }) {
  return <section className="flex w-full max-w-md flex-col gap-4 rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-4 shadow-sm">{children}</section>;
}

function ConnectForm({ lang, busy, error, onConnect }: { lang: string; busy: boolean; error: string; onConnect: (u: string) => Promise<boolean> }) {
  const [url, setUrl] = useState("");
  return (
    <Card>
      <h2 className="text-xl font-bold">{t("wallet.connect", lang)}</h2>
      <label className="flex flex-col gap-2">
        <span className="text-sm text-[var(--muted)]">{t("wallet.paste", lang)}</span>
        <textarea
          value={url}
          onChange={(e) => setUrl(e.target.value)}
          rows={3}
          autoComplete="off"
          spellCheck={false}
          className="rounded-lg border border-[var(--border)] bg-[var(--surface)] p-3 font-mono text-sm"
        />
      </label>
      {error && <p role="alert" className="text-[var(--danger)]">{error}</p>}
      <div className="flex flex-wrap gap-2">
        <BigButton disabled={busy || !url.trim()} onClick={() => void onConnect(url)}>
          {busy ? "…" : t("wallet.connect", lang)}
        </BigButton>
        <ScanButton onResult={(text) => { setUrl(text); void onConnect(text); }} />
      </div>
      <p className="text-xs text-[var(--muted)]">🔒 Stored only on this device. Never sent to our server.</p>
    </Card>
  );
}

function ReceiveTab({ wallet, lang, rates, currency, onPaid }: { wallet: Wallet; lang: string; rates?: Rates | null; currency: Fiat; onPaid: () => void }) {
  const [amount, setAmount] = useState("");
  const [inv, setInv] = useState<{ bolt11: string; paymentHash: string; sats: number } | null>(null);
  const [paid, setPaid] = useState<Tx | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const sats = Number(amount);
  const valid = Number.isInteger(sats) && sats > 0 && sats <= MAX_RECEIVE_SATS;

  useEffect(() => {
    if (!inv) return;
    return watchPayments(wallet, {
      paymentHash: inv.paymentHash,
      sinceUnix: Math.floor(Date.now() / 1000) - 60,
      onPaid: (tx) => {
        setPaid(tx);
        onPaid();
      },
    });
  }, [inv, wallet, onPaid]);

  if (paid) {
    return (
      <div className="flex flex-col items-center gap-3 py-4 text-center">
        <p className="text-4xl">✅</p>
        <p className="text-2xl font-bold">{t("wallet.received", lang)}</p>
        <SatsAmount sats={paid.sats} rates={rates} currency={currency} size="lg" />
        <BigButton variant="secondary" onClick={() => { setInv(null); setPaid(null); setAmount(""); }}>OK</BigButton>
      </div>
    );
  }

  if (inv) {
    return (
      <div className="flex flex-col items-center gap-3 text-center">
        <SatsAmount sats={inv.sats} rates={rates} currency={currency} size="lg" />
        <QR value={`lightning:${inv.bolt11}`} label="Lightning invoice" />
        <p className="animate-pulse text-[var(--muted)]">{t("wallet.waiting", lang)}</p>
        <div className="flex gap-2">
          <CopyButton text={inv.bolt11} lang={lang} />
          <BigButton variant="ghost" onClick={() => setInv(null)}>{t("wallet.cancel", lang)}</BigButton>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-3">
      <label className="flex flex-col gap-2">
        <span className="text-sm text-[var(--muted)]">{t("wallet.amount", lang)}</span>
        <input
          inputMode="numeric"
          pattern="[0-9]*"
          value={amount}
          onChange={(e) => setAmount(e.target.value.replace(/\D/g, "").slice(0, 7))}
          className="min-h-12 rounded-lg border border-[var(--border)] bg-[var(--surface)] px-3 text-2xl tabular-nums"
        />
      </label>
      {valid && <SatsAmount sats={sats} rates={rates} currency={currency} size="sm" />}
      {error && <p role="alert" className="text-[var(--danger)]">{error}</p>}
      <BigButton
        disabled={!valid || busy}
        onClick={async () => {
          setBusy(true);
          setError(null);
          try {
            const r = await wallet.makeInvoice({ sats, memo: "sats-starter", expirySec: 600 });
            setInv({ ...r, sats });
          } catch (err) {
            setError(errText(errorCode(err), lang));
          } finally {
            setBusy(false);
          }
        }}
      >
        {busy ? "…" : t("wallet.create_invoice", lang)}
      </BigButton>
    </div>
  );
}

function SendTab({ wallet, lang, rates, currency, onPaid }: { wallet: Wallet; lang: string; rates?: Rates | null; currency: Fiat; onPaid: () => void }) {
  const [text, setText] = useState("");
  const [decoded, setDecoded] = useState<DecodedBolt11 | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<{ preimage: string; ok: boolean } | null>(null);

  const check = (raw: string) => {
    setText(raw);
    setResult(null);
    setError(null);
    setDecoded(null);
    if (!raw.trim()) return;
    try {
      const d = decodeBolt11(raw);
      if (d.sats === null || d.sats <= 0) return setError(t("wallet.invalid_invoice", lang));
      if (d.expiresAt * 1000 < Date.now()) return setError(t("wallet.expired", lang));
      setDecoded(d);
    } catch {
      setError(t("wallet.invalid_invoice", lang));
    }
  };

  if (result && decoded) {
    return (
      <div className="flex flex-col gap-3 text-center">
        <p className="text-4xl">✅</p>
        <p className="text-2xl font-bold">{t("wallet.paid", lang)}</p>
        <SatsAmount sats={decoded.sats ?? 0} rates={rates} currency={currency} size="lg" />
        <p className="text-sm text-[var(--muted)]">{t("wallet.preimage", lang)} {result.ok ? "✓" : "✗"}</p>
        <code className="break-all rounded bg-[var(--surface-2)] p-2 text-xs">{result.preimage}</code>
        <BigButton variant="secondary" onClick={() => check("")}>OK</BigButton>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-3">
      <label className="flex flex-col gap-2">
        <span className="text-sm text-[var(--muted)]">{t("wallet.paste_invoice", lang)}</span>
        <textarea
          value={text}
          onChange={(e) => check(e.target.value)}
          rows={3}
          spellCheck={false}
          className="rounded-lg border border-[var(--border)] bg-[var(--surface)] p-3 font-mono text-sm"
        />
      </label>
      <ScanButton onResult={check} />
      {error && <p role="alert" className="text-[var(--danger)]">{error}</p>}
      {decoded && (
        <div className="flex flex-col gap-3 rounded-xl border border-[var(--border)] p-3">
          <p className="text-lg font-semibold">{t("wallet.confirm_pay", lang, { sats: formatSats(decoded.sats ?? 0) })}</p>
          <SatsAmount sats={decoded.sats ?? 0} rates={rates} currency={currency} size="lg" />
          {decoded.description && <p className="text-sm text-[var(--muted)]">“{decoded.description.slice(0, 120)}”</p>}
          <BigButton
            disabled={busy}
            onClick={async () => {
              setBusy(true);
              setError(null);
              try {
                const r = await wallet.payInvoice(text);
                setResult({ preimage: r.preimage, ok: verifyPreimage(r.preimage, decoded.paymentHash) });
                onPaid();
              } catch (err) {
                setError(errText(errorCode(err), lang));
              } finally {
                setBusy(false);
              }
            }}
          >
            {busy ? "…" : t("wallet.pay", lang)}
          </BigButton>
        </div>
      )}
    </div>
  );
}

function HistoryTab({ wallet, lang, rates, currency, tick }: { wallet: Wallet; lang: string; rates?: Rates | null; currency: Fiat; tick: number }) {
  const [txs, setTxs] = useState<Tx[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    let cancelled = false;
    wallet
      .listTransactions({ limit: 20 })
      .then((list) => !cancelled && setTxs(list))
      .catch((err) => !cancelled && setError(errText(errorCode(err), lang)));
    return () => {
      cancelled = true;
    };
  }, [wallet, tick, lang]);

  if (error) return <p role="alert" className="text-[var(--danger)]">{error}</p>;
  if (!txs) return <p className="text-[var(--muted)]">…</p>;
  if (txs.length === 0) return <p className="text-[var(--muted)]">{t("wallet.no_tx", lang)}</p>;
  return (
    <ul className="divide-y divide-[var(--border)]">
      {txs.map((tx) => (
        <li key={tx.paymentHash + tx.type} className="flex items-center justify-between gap-3 py-2">
          <span className="text-2xl" aria-label={t(tx.type === "incoming" ? "wallet.in" : "wallet.out", lang)}>
            {tx.type === "incoming" ? "⬇️" : "⬆️"}
          </span>
          <span className="flex-1">
            <SatsAmount sats={tx.sats} rates={rates} currency={currency} size="sm" />
          </span>
          <span className="text-right text-xs text-[var(--muted)]">
            {new Date((tx.settledAt ?? tx.createdAt) * 1000).toLocaleString(lang === "fr" ? "fr-FR" : "en-GB", { dateStyle: "short", timeStyle: "short" })}
            <br />
            {tx.state !== "settled" && tx.state}
          </span>
        </li>
      ))}
    </ul>
  );
}
