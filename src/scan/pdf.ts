// Lecture des tickets PDF (commandes drive, tickets envoyés par e-mail) directement sur le téléphone.
// Un PDF « numérique » contient déjà le texte : pas besoin d'OCR. Une page scannée (image seule)
// est rendue en image puis lue comme une photo.

export interface PdfTextItem {
  str: string;
  x: number;
  y: number;
  width: number;
  height: number;
}

/**
 * Reconstitue les lignes d'une page à partir des morceaux de texte positionnés :
 * même hauteur (à une demi-ligne près) = même ligne, triés de gauche à droite.
 * Les tickets PDF placent souvent le prix dans une colonne à droite du libellé.
 */
export function linesFromItems(items: PdfTextItem[]): string[] {
  const parts = items.filter((i) => i.str.trim());
  if (parts.length === 0) return [];
  const sorted = [...parts].sort((a, b) => b.y - a.y || a.x - b.x);
  const rows: PdfTextItem[][] = [];
  for (const it of sorted) {
    const row = rows[rows.length - 1];
    const tol = Math.max(2, (it.height || 10) * 0.5);
    if (row && Math.abs(row[0].y - it.y) <= tol) row.push(it);
    else rows.push([it]);
  }
  return rows.map((row) => {
    row.sort((a, b) => a.x - b.x);
    let line = '';
    let end = -Infinity;
    for (const it of row) {
      // Espace entre deux colonnes éloignées, rien entre deux morceaux collés.
      if (line && it.x - end > 1) line += ' ';
      line += it.str;
      end = it.x + it.width;
    }
    return line.replace(/\s+/g, ' ').trim();
  });
}

export interface PdfReadResult {
  text: string;
  /** Pages sans texte, rendues en image pour l'OCR. */
  scannedPages: HTMLCanvasElement[];
  pages: number;
}

export async function readPdf(file: File, maxPages = 10): Promise<PdfReadResult> {
  const pdfjs = await import('pdfjs-dist');
  const worker = await import('pdfjs-dist/build/pdf.worker.min.mjs?url');
  pdfjs.GlobalWorkerOptions.workerSrc = worker.default;
  const task = pdfjs.getDocument({ data: new Uint8Array(await file.arrayBuffer()) });
  const doc = await task.promise;
  const lines: string[] = [];
  const scannedPages: HTMLCanvasElement[] = [];
  const count = Math.min(doc.numPages, maxPages);
  for (let n = 1; n <= count; n++) {
    const page = await doc.getPage(n);
    const content = await page.getTextContent();
    const items: PdfTextItem[] = [];
    for (const it of content.items) {
      if (!('str' in it)) continue;
      items.push({ str: it.str, x: it.transform[4], y: it.transform[5], width: it.width, height: it.height });
    }
    const pageLines = linesFromItems(items);
    if (pageLines.join('').replace(/\s/g, '').length > 20) {
      lines.push(...pageLines);
    } else {
      const viewport = page.getViewport({ scale: 2.5 });
      const canvas = document.createElement('canvas');
      canvas.width = Math.ceil(viewport.width);
      canvas.height = Math.ceil(viewport.height);
      await page.render({ canvas, viewport }).promise;
      scannedPages.push(canvas);
    }
  }
  const pages = doc.numPages;
  await task.destroy();
  return { text: lines.join('\n'), scannedPages, pages };
}
