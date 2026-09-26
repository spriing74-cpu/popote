// Copie les moteurs de scan dans public/scan pour qu'ils soient servis par l'app elle-même
// (aucun CDN : fonctionne hors ligne une fois mis en cache). Lancé automatiquement avant dev/build.
import { copyFileSync, existsSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const nm = join(root, 'node_modules');
const out = join(root, 'public', 'scan');

const files = [
  // Lecteur de codes-barres (ZXing-C++ en WebAssembly)
  ['zxing-wasm/dist/reader/zxing_reader.wasm', 'zxing_reader.wasm'],
  // OCR Tesseract : worker, moteurs LSTM (le navigateur choisit la variante SIMD adaptée), langue française
  ['tesseract.js/dist/worker.min.js', 'tesseract/worker.min.js'],
  ['tesseract.js-core/tesseract-core-lstm.wasm.js', 'tesseract/core/tesseract-core-lstm.wasm.js'],
  ['tesseract.js-core/tesseract-core-simd-lstm.wasm.js', 'tesseract/core/tesseract-core-simd-lstm.wasm.js'],
  ['tesseract.js-core/tesseract-core-relaxedsimd-lstm.wasm.js', 'tesseract/core/tesseract-core-relaxedsimd-lstm.wasm.js'],
  ['@tesseract.js-data/fra/4.0.0_best_int/fra.traineddata.gz', 'tesseract/lang/fra.traineddata.gz'],
];

for (const [from, to] of files) {
  const src = join(nm, from);
  if (!existsSync(src)) {
    console.error(`Fichier introuvable : ${src} (lancez npm install)`);
    process.exit(1);
  }
  const dest = join(out, to);
  mkdirSync(dirname(dest), { recursive: true });
  copyFileSync(src, dest);
}
console.log(`Moteurs de scan copiés dans ${out}`);
