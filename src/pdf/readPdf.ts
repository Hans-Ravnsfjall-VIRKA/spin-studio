import { itemsToLines, type PdfTextItem } from '../models/planPdfModel';

interface RawItem {
  str?: string;
  width?: number;
  transform?: number[];
}

/** Text of a PDF, one line per row of the page. Loaded on demand so the app stays small. */
export async function readPdfText(file: File): Promise<string> {
  const pdfjs = await import('pdfjs-dist');
  const worker = await import('pdfjs-dist/build/pdf.worker.min.mjs?url');
  pdfjs.GlobalWorkerOptions.workerSrc = worker.default;
  const data = new Uint8Array(await file.arrayBuffer());
  const doc = await pdfjs.getDocument({ data }).promise;
  const pages: string[] = [];
  for (let n = 1; n <= doc.numPages; n++) {
    const page = await doc.getPage(n);
    const content = await page.getTextContent();
    const items: PdfTextItem[] = [];
    for (const raw of content.items as RawItem[]) {
      if (typeof raw.str !== 'string' || !raw.transform) continue;
      items.push({ str: raw.str, x: raw.transform[4], y: raw.transform[5], width: raw.width });
    }
    pages.push(itemsToLines(items).join('\n'));
  }
  return pages.join('\n');
}
