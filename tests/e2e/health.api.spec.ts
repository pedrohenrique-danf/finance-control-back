import { expect, test } from "@playwright/test";

test("health responde 200", async ({ request }) => {
  const res = await request.get("/api/v1/health");
  expect(res.status()).toBe(200);
  expect(await res.json()).toEqual({ status: "ok" });
});

test("rota inexistente responde 404 no envelope padrão", async ({ request }) => {
  const res = await request.get("/api/v1/nao-existe");
  expect(res.status()).toBe(404);
  expect(await res.json()).toMatchObject({ error: { code: "NOT_FOUND" } });
});
