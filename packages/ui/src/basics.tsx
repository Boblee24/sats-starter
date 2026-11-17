"use client";
import { useEffect, useRef, useState, type ButtonHTMLAttributes, type ReactNode } from "react";
import { QRCodeSVG } from "qrcode.react";
import { formatFiat, formatSats, priceFor, satsToFiat, t, type Fiat, type Rates } from "@sats/core";
import { useOnline } from "./hooks";

/** "2,500 sats ≈ ₦3,750". Fiat is omitted until rates load. */
export function SatsAmount({
  sats,
  rates,
  currency = "NGN",
  size = "md",
}: {
  sats: number;
  rates?: Rates | null;
  currency?: Fiat;
  size?: "sm" | "md" | "lg" | "xl";
}) {
  const big = { sm: "text-base", md: "text-xl", lg: "text-3xl", xl: "text-5xl" }[size];
  const fiat = rates ? formatFiat(satsToFiat(sats, priceFor(rates, currency)), currency) : null;
  return (
    <span className="inline-flex flex-col leading-tight">
      <span className={`${big} font-bold tabular-nums`}>{formatSats(sats)}</span>
      {fiat && <span className="text-sm text-[var(--muted)] tabular-nums">≈ {fiat}</span>}
    </span>
  );
}

type BigButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: "primary" | "secondary" | "danger" | "ghost";
  icon?: ReactNode;
};

/** 48px+ tap target, high contrast. */
export function BigButton({ variant = "primary", icon, className = "", children, ...rest }: BigButtonProps) {
  const styles = {
    primary: "bg-[var(--accent)] text-[var(--accent-fg)] hover:brightness-110",
    secondary: "bg-[var(--surface-2)] text-[var(--fg)] border border-[var(--border)] hover:brightness-95",
    danger: "bg-[var(--danger)] text-white hover:brightness-110",
    ghost: "bg-transparent text-[var(--fg)] underline-offset-4 hover:underline",
  }[variant];
  return (
    <button
      type="button"
      className={`min-h-12 rounded-xl px-5 py-3 text-lg font-semibold inline-flex items-center justify-center gap-2 transition disabled:opacity-50 disabled:cursor-not-allowed focus-visible:outline-3 focus-visible:outline-offset-2 focus-visible:outline-[var(--focus)] ${styles} ${className}`}
      {...rest}
    >
      {icon}
      {children}
    </button>
  );
}

/** QR for invoices/receipts. Uppercases bolt11 so the QR uses the denser alphanumeric mode. */
export function QR({ value, size = 260, label }: { value: string; size?: number; label?: string }) {
  const v = /^(lightning:)?ln/i.test(value) ? value.toUpperCase() : value;
  return (
    <div className="inline-block rounded-xl bg-white p-3" role="img" aria-label={label ?? "QR code"}>
      <QRCodeSVG value={v} size={size} level="M" marginSize={0} />
    </div>
  );
}

export function CopyButton({ text, lang = "en" }: { text: string; lang?: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <BigButton
      variant="secondary"
      onClick={async () => {
        try {
          await navigator.clipboard.writeText(text);
          setCopied(true);
          setTimeout(() => setCopied(false), 1500);
        } catch {
          /* clipboard blocked */
        }
      }}
    >
      {copied ? t("wallet.copied", lang) : t("wallet.copy", lang)}
    </BigButton>
  );
}

export function OfflineBanner({ lang = "en" }: { lang?: string }) {
  const online = useOnline();
  if (online) return null;
  return (
    <div role="status" className="bg-[var(--warn)] text-black px-4 py-2 text-center text-sm font-medium">
      {t("offline.banner", lang)}
    </div>
  );
}

export function DemoBanner({ lang = "en", show }: { lang?: string; show: boolean }) {
  if (!show) return null;
  return (
    <div className="bg-[var(--surface-2)] border-b border-[var(--border)] px-4 py-1 text-center text-xs text-[var(--muted)]">
      {t("demo.banner", lang)}
    </div>
  );
}

const LANG_NAMES: Record<string, string> = {
  en: "English",
  pcm: "Pidgin",
  fr: "Français",
  yo: "Yorùbá",
  ha: "Hausa",
  wo: "Wolof",
};

export function LanguageSwitch({
  value,
  onChange,
  langs = ["en", "pcm", "fr"],
}: {
  value: string;
  onChange: (l: string) => void;
  langs?: string[];
}) {
  return (
    <label className="inline-flex items-center gap-2 text-sm">
      <span className="sr-only">{t("lang.label", value)}</span>
      <span aria-hidden>🌐</span>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="min-h-12 rounded-lg border border-[var(--border)] bg-[var(--surface)] px-2 text-base"
      >
        {langs.map((l) => (
          <option key={l} value={l}>
            {LANG_NAMES[l] ?? l}
          </option>
        ))}
      </select>
    </label>
  );
}

type BarcodeDetectorLike = { detect(src: CanvasImageSource): Promise<Array<{ rawValue: string }>> };

/**
 * Scan a QR with the camera using the browser's built-in BarcodeDetector (Chrome on Android).
 * Renders nothing where unsupported, so paste is always the fallback. No extra JS library.
 */
export function ScanButton({ onResult, label = "Scan QR" }: { onResult: (text: string) => void; label?: string }) {
  const [supported, setSupported] = useState(false);
  const [open, setOpen] = useState(false);
  const videoRef = useRef<HTMLVideoElement>(null);

  useEffect(() => setSupported(typeof window !== "undefined" && "BarcodeDetector" in window), []);

  useEffect(() => {
    if (!open) return;
    let stream: MediaStream | undefined;
    let timer: ReturnType<typeof setInterval> | undefined;
    let done = false;
    (async () => {
      try {
        stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: "environment" } });
        if (!videoRef.current) return;
        videoRef.current.srcObject = stream;
        await videoRef.current.play();
        const Detector = (window as unknown as { BarcodeDetector: new (o: object) => BarcodeDetectorLike }).BarcodeDetector;
        const detector = new Detector({ formats: ["qr_code"] });
        timer = setInterval(async () => {
          if (done || !videoRef.current) return;
          const codes = await detector.detect(videoRef.current).catch(() => []);
          if (codes[0]?.rawValue) {
            done = true;
            setOpen(false);
            onResult(codes[0].rawValue);
          }
        }, 300);
      } catch {
        setOpen(false);
      }
    })();
    return () => {
      if (timer) clearInterval(timer);
      stream?.getTracks().forEach((tr) => tr.stop());
    };
  }, [open, onResult]);

  if (!supported) return null;
  return (
    <>
      <BigButton variant="secondary" icon={<span aria-hidden>📷</span>} onClick={() => setOpen(true)}>
        {label}
      </BigButton>
      {open && (
        <div className="fixed inset-0 z-50 flex flex-col items-center justify-center gap-4 bg-black/90 p-4">
          <video ref={videoRef} className="w-full max-w-md rounded-xl" playsInline muted />
          <BigButton variant="secondary" onClick={() => setOpen(false)}>
            ✕
          </BigButton>
        </div>
      )}
    </>
  );
}
