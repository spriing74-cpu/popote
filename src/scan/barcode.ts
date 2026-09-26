// Lecture de codes-barres EAN/UPC. Safari (iOS) ne fournit pas l'API BarcodeDetector :
// on utilise l'implémentation ZXing en WebAssembly, servie par l'application (hors ligne).

interface Detector {
  detect(source: ImageBitmapSource): Promise<{ rawValue: string }[]>;
}

let detector: Promise<Detector> | null = null;

function assetUrl(path: string): string {
  return new URL(`${import.meta.env.BASE_URL}${path}`, location.href).href;
}

export function getDetector(): Promise<Detector> {
  if (!detector) {
    detector = (async () => {
      const mod = await import('barcode-detector/ponyfill');
      mod.prepareZXingModule({
        overrides: {
          locateFile: (path: string, prefix: string) => (path.endsWith('.wasm') ? assetUrl('scan/zxing_reader.wasm') : prefix + path),
        },
      });
      return new mod.BarcodeDetector({ formats: ['ean_13', 'ean_8', 'upc_a', 'upc_e'] }) as Detector;
    })();
    detector.catch(() => (detector = null));
  }
  return detector;
}

export async function detectBarcode(source: ImageBitmapSource): Promise<string | null> {
  const d = await getDetector();
  const found = await d.detect(source);
  const code = found.map((f) => f.rawValue).find((v) => /^\d{8,14}$/.test(v));
  return code ?? null;
}

/** La caméra en direct n'est autorisée par iOS qu'en HTTPS (ou sur localhost). */
export function canUseLiveCamera(): boolean {
  return typeof window !== 'undefined' && window.isSecureContext && !!navigator.mediaDevices?.getUserMedia;
}
