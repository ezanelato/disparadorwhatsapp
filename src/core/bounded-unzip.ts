import { unzipSync } from 'fflate';
// Build-time adapter for read-excel-file's unzip seam. Avoids Blob-created
// fflate workers prohibited by MV3 CSP, and caps decompressed XML locally.
export default async function unzip(buffer: ArrayBuffer, options: { filter?: (entry: any) => boolean } = {}) {
  let total = 0;
  return unzipSync(new Uint8Array(buffer), { filter: entry => {
    if (options.filter && !options.filter({ path: entry.name })) return false;
    total += entry.originalSize;
    if (entry.originalSize > 24 * 1024 * 1024 || total > 48 * 1024 * 1024) throw Error('Planilha expandida acima do limite local de 48 MB.');
    return true;
  } });
}
