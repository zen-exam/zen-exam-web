import * as pdfjsLib from 'pdfjs-dist';

// Configure worker using CDN or fallback
try {
  if (typeof window !== 'undefined' && pdfjsLib.GlobalWorkerOptions) {
    pdfjsLib.GlobalWorkerOptions.workerSrc = `https://cdnjs.cloudflare.com/ajax/libs/pdf.js/${pdfjsLib.version || '4.10.38'}/pdf.worker.min.mjs`;
  }
} catch (e) {
  console.warn('PDF.js worker initialization warning:', e);
}

export interface ExtractedPage {
  pageNumber: number;
  text: string;
  imageDataUrl: string; // High-resolution render of the page for side-by-side inspection
  lines: string[];
}

export interface PdfExtractionResult {
  numPages: number;
  fullText: string;
  pages: ExtractedPage[];
  isScannedHeuristic: boolean; // True if page has very little extractable text despite having content
}

export async function extractPdfContent(
  fileOrBuffer: File | ArrayBuffer,
  onProgress?: (progress: number, status: string) => void
): Promise<PdfExtractionResult> {
  const data =
    fileOrBuffer instanceof File
      ? await fileOrBuffer.arrayBuffer()
      : fileOrBuffer;

  onProgress?.(10, 'Loading PDF document structure...');
  const loadingTask = pdfjsLib.getDocument({
    data: new Uint8Array(data),
    useSystemFonts: true,
  });

  const pdf = await loadingTask.promise;
  const numPages = pdf.numPages;
  const pages: ExtractedPage[] = [];
  let fullText = '';
  let totalCharacterCount = 0;

  for (let pageNum = 1; pageNum <= numPages; pageNum++) {
    const progressPercent = Math.round(15 + (pageNum / numPages) * 75);
    onProgress?.(progressPercent, `Extracting text and rendering page ${pageNum} of ${numPages}...`);

    const page = await pdf.getPage(pageNum);
    
    // 1. Extract text and layout positions
    const textContent = await page.getTextContent();
    const textItems = textContent.items as Array<{
      str: string;
      transform: number[];
      width: number;
      height: number;
    }>;

    // Group text items by line (similar Y coordinate)
    const lineMap = new Map<number, string[]>();
    for (const item of textItems) {
      if (!item.str || item.str.trim() === '') continue;
      // Y position is transform[5], invert to roughly match visual top-to-bottom
      const yKey = Math.round(item.transform[5] / 4) * 4;
      if (!lineMap.has(yKey)) {
        lineMap.set(yKey, []);
      }
      lineMap.get(yKey)!.push(item.str);
    }

    // Sort lines from top to bottom
    const sortedY = Array.from(lineMap.keys()).sort((a, b) => b - a);
    const lines = sortedY.map((y) => (lineMap.get(y) || []).join(' ').trim());
    const pageText = lines.join('\n');

    totalCharacterCount += pageText.length;
    fullText += `\n--- Page ${pageNum} ---\n` + pageText;

    // 2. Render high-resolution page canvas for side-by-side validation
    const viewport = page.getViewport({ scale: 1.5 });
    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d');
    canvas.width = viewport.width;
    canvas.height = viewport.height;

    let imageDataUrl = '';
    if (ctx) {
      // White background
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(0, 0, canvas.width, canvas.height);

      const renderContext = {
        canvasContext: ctx,
        viewport: viewport,
        canvas: canvas,
      };
      await page.render(renderContext).promise;
      imageDataUrl = canvas.toDataURL('image/jpeg', 0.85); // ~4x smaller than PNG: fits upload limits and the save request
    }

    pages.push({
      pageNumber: pageNum,
      text: pageText,
      imageDataUrl,
      lines,
    });
  }

  // Heuristic: If average character count per page is very low (< 100 chars), it is likely a scanned PDF
  const avgCharsPerPage = totalCharacterCount / (numPages || 1);
  const isScannedHeuristic = avgCharsPerPage < 120;

  onProgress?.(100, `Completed extracting ${numPages} page(s).`);

  return {
    numPages,
    fullText: fullText.trim(),
    pages,
    isScannedHeuristic,
  };
}
