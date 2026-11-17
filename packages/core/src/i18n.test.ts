import { describe, expect, it } from "vitest";
import { extendDict, t } from "./i18n";

describe("i18n", () => {
  it("translates and falls back to en, then key", () => {
    expect(t("wallet.send", "fr")).toBe("Envoyer");
    expect(t("wallet.paste", "pcm")).toBe(t("wallet.paste", "en"));
    expect(t("nope.key", "fr")).toBe("nope.key");
    expect(t("wallet.send", "zz")).toBe("Send");
  });
  it("interpolates vars", () => {
    expect(t("wallet.confirm_pay", "en", { sats: "21 sats" })).toBe("Pay 21 sats?");
  });
  it("supports app extensions and extra languages", () => {
    extendDict("yo", { "wallet.send": "Fi ranṣẹ" });
    expect(t("wallet.send", "yo")).toBe("Fi ranṣẹ");
    expect(t("wallet.receive", "yo")).toBe("Receive");
  });
});
