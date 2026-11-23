import { describe, expect, it } from "vitest";
import { TERMS_VERSION, termsAcceptance } from "./terms";

const now = new Date("2026-11-23T12:00:00Z");

describe("aceite dos termos", () => {
  it("cadastro por e-mail exige a versão vigente", () => {
    expect(() => termsAcceptance({}, "/sign-up/email", now)).toThrow(/Aceite os termos/);
    expect(() => termsAcceptance({ termsVersion: "2000-01-01" }, "/sign-up/email", now)).toThrow();
    expect(termsAcceptance({ termsVersion: TERMS_VERSION }, "/sign-up/email", now)).toEqual({
      termsVersion: TERMS_VERSION,
      termsAcceptedAt: now,
    });
  });

  it("login social grava a versão vigente (a tela avisa que continuar é aceitar)", () => {
    expect(termsAcceptance({}, "/callback/:id", now)).toEqual({ termsVersion: TERMS_VERSION, termsAcceptedAt: now });
  });
});
