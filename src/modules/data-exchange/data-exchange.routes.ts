import { json } from "@/app/http/responses";
import { type RouteDefinition, requireUser } from "@/app/http/types";
import { parseBody, parseQuery } from "@/app/http/validation";
import { ValidationError } from "@/shared/errors";
import { confirmImportSchema, exportQuerySchema } from "./exchange.schemas";
import type { ExchangeService } from "./exchange.service";
import type { ImportPreviewService } from "./import-preview.service";

/**
 * Importar e exportar (RF07, docs/07). A importação tem duas etapas: POST /imports/preview lê o arquivo e
 * devolve as linhas para revisão (sem gravar); POST /imports grava as linhas revisadas.
 */
export function createDataExchangeRoutes(deps: {
  preview: ImportPreviewService;
  exchange: ExchangeService;
}): RouteDefinition[] {
  return [
    {
      method: "POST",
      path: "/api/v1/imports/preview",
      access: "private",
      handler: async (req, ctx) => {
        requireUser(ctx);
        let form: FormData;
        try {
          form = await req.formData();
        } catch {
          throw new ValidationError([{ path: "file", message: "Envie o arquivo como multipart/form-data." }]);
        }
        const file = form.get("file");
        if (!(file instanceof File)) throw new ValidationError([{ path: "file", message: "Arquivo ausente." }]);
        const preview = await deps.preview.preview({
          name: file.name,
          type: file.type,
          bytes: new Uint8Array(await file.arrayBuffer()),
        });
        ctx.logger.info("import_preview", {
          requestId: ctx.requestId,
          source: preview.source,
          rows: preview.rows.length,
          errors: preview.errors.length,
        });
        return json(preview);
      },
    },
    {
      method: "POST",
      path: "/api/v1/imports",
      access: "private",
      handler: async (req, ctx) => {
        const input = await parseBody(req, confirmImportSchema);
        const operation = await deps.exchange.confirmImport(requireUser(ctx).id, input, ctx.now);
        ctx.logger.info("import_confirmed", { requestId: ctx.requestId, rows: operation.successRows });
        // Sem GET por id no MVP: o Location aponta o histórico, onde a operação aparece.
        return json(operation, { status: 201, headers: { Location: "/api/v1/data-operations" } });
      },
    },
    {
      method: "GET",
      path: "/api/v1/data-operations",
      access: "private",
      handler: async (_req, ctx) => json({ data: await deps.exchange.history(requireUser(ctx).id) }),
    },
    {
      method: "GET",
      path: "/api/v1/exports/transactions",
      access: "private",
      handler: async (req, ctx) => {
        const { month } = parseQuery(req, exportQuerySchema);
        const { fileName, content } = await deps.exchange.exportCsv(requireUser(ctx).id, month, ctx.now);
        return new Response(content, {
          headers: {
            "Content-Type": "text/csv; charset=utf-8",
            "Content-Disposition": `attachment; filename="${fileName}"`,
            "Cache-Control": "no-store",
          },
        });
      },
    },
  ];
}
