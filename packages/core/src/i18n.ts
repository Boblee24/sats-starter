/** Tiny i18n: t(key, lang, vars). Falls back to English, then to the key itself. */
export const LANGS = ["en", "pcm", "fr"] as const;
export type Lang = (typeof LANGS)[number];
export type Dict = Record<string, string>;

const base: Record<Lang, Dict> = {
  en: {
    "demo.banner": "Demo: test sats, sample data",
    "offline.banner": "You are offline. We'll retry when you have signal.",
    "wallet.title": "Wallet",
    "wallet.connect": "Connect wallet",
    "wallet.paste": "Paste your wallet connection (nostr+walletconnect://…)",
    "wallet.disconnect": "Disconnect",
    "wallet.balance": "Balance",
    "wallet.receive": "Receive",
    "wallet.send": "Send",
    "wallet.history": "History",
    "wallet.amount": "Amount (sats)",
    "wallet.create_invoice": "Create invoice",
    "wallet.copy": "Copy",
    "wallet.copied": "Copied",
    "wallet.paste_invoice": "Paste a Lightning invoice (lnbc…)",
    "wallet.confirm_pay": "Pay {sats}?",
    "wallet.pay": "Pay",
    "wallet.cancel": "Cancel",
    "wallet.paid": "Paid",
    "wallet.preimage": "Proof of payment (preimage)",
    "wallet.permissions": "Permissions",
    "wallet.can_spend": "This connection can spend money. For real use, create a receive-only connection.",
    "wallet.no_tx": "No transactions yet",
    "wallet.waiting": "Waiting for payment…",
    "wallet.received": "Received!",
    "wallet.invalid_url": "That doesn't look like a wallet connection (nostr+walletconnect://…).",
    "wallet.invalid_invoice": "That isn't a valid Lightning invoice with an amount.",
    "wallet.expired": "This invoice has expired.",
    "wallet.in": "In",
    "wallet.out": "Out",
    "error.generic": "Something went wrong. Please try again.",
    "error.budget": "Sponsor budget reached for today. Your sats are saved; claim tomorrow.",
    "lang.label": "Language",
  },
  pcm: {
    "demo.banner": "Demo: na test sats, sample data",
    "offline.banner": "Network no dey. We go try again when signal come.",
    "wallet.connect": "Connect wallet",
    "wallet.disconnect": "Comot wallet",
    "wallet.balance": "Wetin dey inside",
    "wallet.receive": "Collect money",
    "wallet.send": "Send money",
    "wallet.history": "Wetin don happen",
    "wallet.create_invoice": "Make invoice",
    "wallet.copied": "E don copy",
    "wallet.paid": "E don pay",
    "wallet.can_spend": "This connection fit spend money. For real use, make receive-only connection.",
    "wallet.no_tx": "Nothing never happen yet",
    "wallet.waiting": "We dey wait for the money…",
    "wallet.received": "E don land!",
    "error.generic": "Wahala dey. Try again.",
    "error.budget": "Sponsor money don finish for today. Your sats dey safe; claim tomorrow.",
  },
  fr: {
    "demo.banner": "Démo : sats de test, données d'exemple",
    "offline.banner": "Hors ligne. Nouvel essai dès que le réseau revient.",
    "wallet.title": "Portefeuille",
    "wallet.connect": "Connecter le portefeuille",
    "wallet.paste": "Collez votre connexion (nostr+walletconnect://…)",
    "wallet.disconnect": "Déconnecter",
    "wallet.balance": "Solde",
    "wallet.receive": "Recevoir",
    "wallet.send": "Envoyer",
    "wallet.history": "Historique",
    "wallet.amount": "Montant (sats)",
    "wallet.create_invoice": "Créer la facture",
    "wallet.copy": "Copier",
    "wallet.copied": "Copié",
    "wallet.paste_invoice": "Collez une facture Lightning (lnbc…)",
    "wallet.confirm_pay": "Payer {sats} ?",
    "wallet.pay": "Payer",
    "wallet.cancel": "Annuler",
    "wallet.paid": "Payé",
    "wallet.preimage": "Preuve de paiement (préimage)",
    "wallet.permissions": "Autorisations",
    "wallet.can_spend": "Cette connexion peut dépenser de l'argent. Pour un usage réel, créez une connexion en réception seule.",
    "wallet.no_tx": "Aucune transaction",
    "wallet.waiting": "En attente du paiement…",
    "wallet.received": "Reçu !",
    "wallet.invalid_url": "Ce n'est pas une connexion de portefeuille (nostr+walletconnect://…).",
    "wallet.invalid_invoice": "Facture Lightning invalide ou sans montant.",
    "wallet.expired": "Cette facture a expiré.",
    "wallet.in": "Reçu",
    "wallet.out": "Envoyé",
    "error.generic": "Une erreur est survenue. Réessayez.",
    "error.budget": "Budget du sponsor atteint pour aujourd'hui. Vos sats sont gardés ; réclamez demain.",
    "lang.label": "Langue",
  },
};

const extra: Partial<Record<string, Dict>> = {};

/** Apps add their own strings (and languages such as yo/ha/wo) here. */
export function extendDict(lang: string, dict: Dict): void {
  extra[lang] = { ...extra[lang], ...dict };
}

export function isLang(x: unknown): x is Lang {
  return typeof x === "string" && (LANGS as readonly string[]).includes(x);
}

export function t(key: string, lang: string = "en", vars?: Record<string, string | number>): string {
  const s =
    extra[lang]?.[key] ?? (base as Record<string, Dict>)[lang]?.[key] ?? extra.en?.[key] ?? base.en[key] ?? key;
  return vars ? s.replace(/\{(\w+)\}/g, (m, k: string) => (k in vars ? String(vars[k]) : m)) : s;
}
