import Link from "next/link";

export default function Home() {
  return (
    <section className="flex w-full max-w-xl flex-col gap-5 pt-6">
      <h1 className="text-3xl font-bold leading-tight">Lightning payments for everyone, on any phone.</h1>
      <p className="text-[var(--muted)]">
        This is the shared starter for Konfam, Kàddu and NdoxWatch. It connects to your own Lightning wallet over
        Nostr Wallet Connect. We never hold your money, and your wallet connection stays on this device.
      </p>
      <Link
        href="/wallet"
        className="inline-flex min-h-12 w-fit items-center rounded-xl bg-[var(--accent)] px-6 text-lg font-semibold text-[var(--accent-fg)]"
      >
        Open wallet →
      </Link>
      <ul className="list-disc space-y-1 pl-6 text-sm text-[var(--muted)]">
        <li>Receive and send sats with QR codes</li>
        <li>Amounts shown in sats and ≈ naira / FCFA</li>
        <li>Works on slow networks; installs as an app</li>
      </ul>
    </section>
  );
}
