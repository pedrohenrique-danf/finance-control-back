import { json } from "@/app/http/responses";
import { type RouteDefinition, requireUser } from "@/app/http/types";
import { ValidationError } from "@/shared/errors";
import type { ImportPreviewService } from "./import-preview.service";

/**
 * POST /api/v1/imports/preview — multipart/form-data com o campo `file` (CSV ou PDF do Nubank).
 * Devolve as linhas lidas para o usuário revisar; a confirmação é feita em POST /api/v1/imports.
 */
export function createDataExchangeRoutes(service: ImportPreviewService): RouteDefinition[] {
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
        const preview = await service.preview({
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
  ];
}
