import { describe, expect, it } from "vitest";
import { isTestEmail } from "./test-users";

describe("usuários de teste", () => {
  it("reconhece só os e-mails gerados pelos testes", () => {
    expect(isTestEmail("e2e+1763900000000-abc123@financecontrol.local")).toBe(true);
    expect(isTestEmail("it+1763900000000-x9@financecontrol.local")).toBe(true);
    expect(isTestEmail("demo@financecontrol.local")).toBe(false);
    expect(isTestEmail("e2e+1@gmail.com")).toBe(false);
    expect(isTestEmail("pessoa.e2e+1@financecontrol.local")).toBe(false);
    expect(isTestEmail("e2e+1@financecontrolXlocal")).toBe(false);
  });
});
