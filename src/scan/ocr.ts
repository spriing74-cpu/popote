// Lecture de texte (OCR) sur l'appareil avec Tesseract. Rien n'est envoyé sur internet :
// moteur et langue française sont servis par l'application puis gardés en cache.
import type { Worker } from 'tesseract.js';

let worker: Promise<Worker> | null = null;
let progressCb: ((p: number, status: string) => void) | null = null;

const STATUS: Record<string, string> = {
  'loading tesseract core': 'Chargement du moteur de lecture…',
  'initializing tesseract': 'Initialisation…',
  'loading language traineddata': 'Chargement du français…',
  'initializing api': 'Initialisation…',
  'recognizing text': 'Lecture du texte…',
};

function assetUrl(path: string): string {
  return new URL(`${import.meta.env.BASE_URL}${path}`, location.href).href;
}

function getWorker(): Promise<Worker> {
  if (!worker) {
    worker = (async () => {
      const { createWorker, OEM } = await import('tesseract.js');
      return createWorker('fra', OEM.LSTM_ONLY, {
        workerPath: assetUrl('scan/tesseract/worker.min.js'),
        corePath: assetUrl('scan/tesseract/core'),
        langPath: assetUrl('scan/tesseract/lang'),
        logger: (m: { status: string; progress: number }) => progressCb?.(m.progress, STATUS[m.status] ?? m.status),
      });
    })();
    worker.catch(() => (worker = null));
  }
  return worker;
}

export async function recognizeText(image: HTMLCanvasElement, onProgress?: (p: number, status: string) => void): Promise<string> {
  progressCb = onProgress ?? null;
  try {
    const w = await getWorker();
    const { data } = await w.recognize(image);
    return data.text;
  } finally {
    progressCb = null;
  }
}
