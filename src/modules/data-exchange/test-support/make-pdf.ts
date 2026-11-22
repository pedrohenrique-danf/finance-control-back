// Só para testes: gera um PDF mínimo (Helvetica, WinAnsiEncoding) com textos em posições fixas,
// reproduzindo o layout dos extratos sem depender de arquivos reais de clientes.

export interface PdfText {
  /** Distância da margem esquerda (pt). */
  x: number;
  /** Distância do topo da página (pt). */
  top: number;
  text: string;
  size?: number;
}

const PAGE_HEIGHT = 842;
const WIN_ANSI: Readonly<Record<string, number>> = { "•": 0x95, "—": 0x97, "–": 0x96 };

function encode(text: string): string {
  let out = "";
  for (const char of text) {
    const code = WIN_ANSI[char] ?? char.charCodeAt(0);
    if (code > 0xff) throw new Error(`Caractere fora do WinAnsi: ${char}`);
    const c = String.fromCharCode(code);
    out += c === "(" || c === ")" || c === "\\" ? `\\${c}` : c;
  }
  return out;
}

/** Cada item de `pages` é a lista de textos de uma página. */
export function makePdf(pages: PdfText[][]): Uint8Array {
  const objects: string[] = [];
  const pageIds = pages.map((_, i) => 4 + i * 2);
  objects[1] = "<< /Type /Catalog /Pages 2 0 R >>";
  objects[2] = `<< /Type /Pages /Kids [${pageIds.map((id) => `${id} 0 R`).join(" ")}] /Count ${pages.length} >>`;
  objects[3] = "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>";
  pages.forEach((texts, i) => {
    const pageId = 4 + i * 2;
    const contentId = pageId + 1;
    const stream = texts
      .map((t) => `BT /F1 ${t.size ?? 9} Tf 1 0 0 1 ${t.x} ${PAGE_HEIGHT - t.top} Tm (${encode(t.text)}) Tj ET`)
      .join("\n");
    objects[pageId] =
      `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 ${PAGE_HEIGHT}] ` +
      `/Resources << /Font << /F1 3 0 R >> >> /Contents ${contentId} 0 R >>`;
    objects[contentId] = `<< /Length ${stream.length} >>\nstream\n${stream}\nendstream`;
  });

  let body = "%PDF-1.4\n";
  const offsets: number[] = [];
  for (let id = 1; id < objects.length; id++) {
    offsets[id] = body.length;
    body += `${id} 0 obj\n${objects[id]}\nendobj\n`;
  }
  const xref = body.length;
  body += `xref\n0 ${objects.length}\n0000000000 65535 f \n`;
  for (let id = 1; id < objects.length; id++) body += `${String(offsets[id]).padStart(10, "0")} 00000 n \n`;
  body += `trailer\n<< /Size ${objects.length} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`;
  return Uint8Array.from(body, (c) => c.charCodeAt(0));
}
