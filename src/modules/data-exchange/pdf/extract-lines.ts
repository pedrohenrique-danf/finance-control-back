import { getDocument } from "pdfjs-dist/legacy/build/pdf.mjs";
import type { PdfLine } from "../import.types";

/** Tolerância vertical (pt) para considerar dois trechos de texto na mesma linha. */
const SAME_LINE = 2.5;
/** Limite de páginas lidas por arquivo (extratos longos são divididos pelo banco). */
export const MAX_PAGES = 40;

interface TextItemLike {
  str: string;
  transform: number[];
  width: number;
}

function isTextItem(item: unknown): item is TextItemLike {
  return typeof item === "object" && item !== null && "str" in item && "transform" in item;
}

/**
 * Extrai o texto do PDF como linhas (de cima para baixo), cada uma com as células na ordem horizontal.
 * Só leitura de texto: não carrega fontes nem formulários XFA do arquivo.
 */
export async function extractPdfLines(data: Uint8Array): Promise<PdfLine[]> {
  const task = getDocument({
    data,
    disableFontFace: true,
    useSystemFonts: false,
    enableXfa: false,
    stopAtErrors: false,
  });
  const pdf = await task.promise;
  try {
    const lines: PdfLine[] = [];
    const pages = Math.min(pdf.numPages, MAX_PAGES);
    for (let pageNumber = 1; pageNumber <= pages; pageNumber++) {
      const page = await pdf.getPage(pageNumber);
      const height = page.getViewport({ scale: 1 }).height;
      const content = await page.getTextContent();
      const pageLines: PdfLine[] = [];
      for (const item of content.items) {
        if (!isTextItem(item) || item.str.trim() === "") continue;
        const x = item.transform[4] ?? 0;
        const top = height - (item.transform[5] ?? 0);
        const cell = { x, width: item.width, text: item.str };
        const line = pageLines.find((l) => Math.abs(l.top - top) <= SAME_LINE);
        if (line) line.cells.push(cell);
        else pageLines.push({ page: pageNumber, top, cells: [cell] });
      }
      pageLines.sort((a, b) => a.top - b.top);
      for (const line of pageLines) line.cells.sort((a, b) => a.x - b.x);
      lines.push(...pageLines);
      page.cleanup();
    }
    return lines;
  } finally {
    await task.destroy();
  }
}
