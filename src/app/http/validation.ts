import type { z } from "zod";
import { ValidationError } from "@/shared/errors";

export function parseWith<S extends z.ZodType>(schema: S, raw: unknown): z.output<S> {
  const result = schema.safeParse(raw);
  if (!result.success) {
    throw new ValidationError(result.error.issues.map((i) => ({ path: i.path.join("."), message: i.message })));
  }
  return result.data;
}

export async function parseBody<S extends z.ZodType>(req: Request, schema: S): Promise<z.output<S>> {
  let raw: unknown;
  try {
    raw = await req.json();
  } catch {
    throw new ValidationError([{ path: "", message: "JSON inválido." }]);
  }
  return parseWith(schema, raw);
}

/**
 * Lê um corpo multipart/form-data parando em `maxBytes`: um upload grande é recusado sem ser lido inteiro
 * para a memória. Confere o Content-Length (quando vem) e conta os bytes do stream (quando não vem ou mente).
 */
export async function parseFormData(req: Request, maxBytes: number, tooLargeMessage: string): Promise<FormData> {
  const tooLarge = () => new ValidationError([{ path: "file", message: tooLargeMessage }]);
  const declared = Number(req.headers.get("content-length"));
  if (Number.isFinite(declared) && declared > maxBytes) throw tooLarge();

  const chunks: Uint8Array[] = [];
  let total = 0;
  if (req.body) {
    const reader = req.body.getReader();
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      total += value.byteLength;
      if (total > maxBytes) {
        await reader.cancel();
        throw tooLarge();
      }
      chunks.push(value);
    }
  }
  try {
    const body = new Blob(chunks);
    const headers = { "content-type": req.headers.get("content-type") ?? "" };
    return await new Response(body, { headers }).formData();
  } catch {
    throw new ValidationError([{ path: "file", message: "Envie o arquivo como multipart/form-data." }]);
  }
}

export function parseQuery<S extends z.ZodType>(req: Request, schema: S): z.output<S> {
  return parseWith(schema, Object.fromEntries(new URL(req.url).searchParams));
}
