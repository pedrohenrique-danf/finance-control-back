import { describe, expect, it } from "vitest";
import { ValidationError } from "@/shared/errors";
import { parseFormData } from "./validation";

function upload(bytes: number, headers: Record<string, string> = {}) {
  const form = new FormData();
  form.set("file", new File([new Uint8Array(bytes)], "a.csv", { type: "text/csv" }));
  return new Request("http://x/upload", { method: "POST", body: form, headers });
}

describe("parseFormData", () => {
  it("lê o multipart dentro do limite", async () => {
    const form = await parseFormData(upload(1000), 10_000, "grande");
    expect((form.get("file") as File).size).toBe(1000);
  });

  it("recusa pelo Content-Length declarado, sem ler o corpo", async () => {
    const req = upload(10, { "content-length": "999999" });
    await expect(parseFormData(req, 10_000, "Arquivo maior que 5 MB.")).rejects.toMatchObject({
      details: [{ path: "file", message: "Arquivo maior que 5 MB." }],
    });
  });

  it("recusa contando os bytes do stream quando o tamanho não é declarado", async () => {
    await expect(parseFormData(upload(20_000), 10_000, "grande")).rejects.toBeInstanceOf(ValidationError);
  });

  it("corpo que não é multipart vira 400 no campo file", async () => {
    const req = new Request("http://x/upload", {
      method: "POST",
      body: "{}",
      headers: { "content-type": "application/json" },
    });
    await expect(parseFormData(req, 10_000, "grande")).rejects.toMatchObject({
      details: [{ path: "file", message: "Envie o arquivo como multipart/form-data." }],
    });
  });
});
