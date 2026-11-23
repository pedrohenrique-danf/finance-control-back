import { describe, expect, it } from "vitest";
import { loadConfig } from "./env";

const base = {
  DATABASE_URL: "postgresql://u:p@h/db",
  BETTER_AUTH_SECRET: "x".repeat(32),
  BETTER_AUTH_URL: "http://localhost:3001",
};

describe("loadConfig", () => {
  it("aplica os valores padrão", () => {
    const config = loadConfig(base);
    expect(config).toMatchObject({ env: "development", port: 3001, logLevel: "info", corsOrigins: [] });
    expect(config.google).toBeUndefined();
  });

  it("falha quando o segredo é curto", () => {
    expect(() => loadConfig({ ...base, BETTER_AUTH_SECRET: "curto" })).toThrow(/BETTER_AUTH_SECRET/);
  });

  it("exige CLIENT_ID e CLIENT_SECRET do Google juntos", () => {
    expect(() => loadConfig({ ...base, GOOGLE_CLIENT_ID: "id" })).toThrow(/GOOGLE_CLIENT_ID/);
  });

  it("trata variáveis vazias como não informadas", () => {
    expect(loadConfig({ ...base, GOOGLE_CLIENT_ID: "", GOOGLE_CLIENT_SECRET: "" }).google).toBeUndefined();
  });

  it("exige CORS_ORIGINS em produção", () => {
    expect(() => loadConfig({ ...base, NODE_ENV: "production" })).toThrow(/CORS_ORIGINS/);
  });

  it("SMTP é opcional fora de produção e exige todas as variáveis juntas", () => {
    expect(loadConfig(base).mail).toBeUndefined();
    expect(() => loadConfig({ ...base, SMTP_HOST: "smtp.gmail.com" })).toThrow(/SMTP_HOST/);
  });

  it("exige SMTP em produção", () => {
    expect(() => loadConfig({ ...base, NODE_ENV: "production", CORS_ORIGINS: "https://app.com" })).toThrow(
      /SMTP é obrigatório/,
    );
  });

  it("monta a configuração de e-mail (porta 465 = TLS direto)", () => {
    const smtp = {
      SMTP_HOST: "smtp.gmail.com",
      SMTP_USER: "a@gmail.com",
      SMTP_PASS: "senha",
      MAIL_FROM: "App <a@gmail.com>",
    };
    expect(loadConfig({ ...base, ...smtp }).mail).toEqual({
      host: "smtp.gmail.com",
      port: 587,
      secure: false,
      user: "a@gmail.com",
      pass: "senha",
      from: "App <a@gmail.com>",
    });
    expect(loadConfig({ ...base, ...smtp, SMTP_PORT: "465" }).mail?.secure).toBe(true);
  });

  it("separa as origens de CORS por vírgula", () => {
    const config = loadConfig({ ...base, CORS_ORIGINS: "http://a.com, http://b.com" });
    expect(config.corsOrigins).toEqual(["http://a.com", "http://b.com"]);
  });
});
