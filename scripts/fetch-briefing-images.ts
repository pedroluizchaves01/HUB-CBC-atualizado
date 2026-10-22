// scripts/fetch-briefing-images.ts
//
// Baixa as imagens de referência do Briefing de Interiores para
// public/briefing-interiores/ (servidas pelo próprio app — a CSP só aceita
// imagens do mesmo domínio). Fonte: Pexels, licença livre para uso comercial.
//
// Uso:  npx tsx scripts/fetch-briefing-images.ts         (pula as que já existem)
//       npx tsx scripts/fetch-briefing-images.ts --force (baixa tudo de novo)
//
// Para trocar uma foto por uma da CBC, salve o arquivo com o MESMO nome em
// public/briefing-interiores/ — o script não sobrescreve sem --force.

import { mkdir, writeFile, access } from 'node:fs/promises';
import path from 'node:path';
import { STYLE_CARDS, KID_BEDS, type RefImage } from '../src/lib/interiorBriefing';

const force = process.argv.includes('--force');
const outDir = path.resolve(process.cwd(), 'public', 'briefing-interiores');

const images: RefImage[] = [
  ...STYLE_CARDS.map(c => c.image),
  ...KID_BEDS.flatMap(k => (k.image ? [k.image] : [])),
];

const exists = (p: string) => access(p).then(() => true, () => false);

async function main() {
  await mkdir(outDir, { recursive: true });
  let ok = 0, skipped = 0, failed = 0;
  for (const img of images) {
    const dest = path.join(outDir, path.basename(img.file));
    if (!force && await exists(dest)) { skipped++; continue; }
    const url = `https://images.pexels.com/photos/${img.pexelsId}/pexels-photo-${img.pexelsId}.jpeg?auto=compress&cs=tinysrgb&w=1200`;
    try {
      const res = await fetch(url);
      const type = res.headers.get('content-type') || '';
      if (!res.ok || !type.startsWith('image/')) throw new Error(`HTTP ${res.status} ${type}`);
      await writeFile(dest, Buffer.from(await res.arrayBuffer()));
      console.log(`✓ ${path.basename(dest)}  ←  ${img.source}`);
      ok++;
    } catch (e: any) {
      console.error(`✗ ${path.basename(dest)}: ${e?.message || e}  (${img.source})`);
      failed++;
    }
  }
  console.log(`\n${ok} baixada(s), ${skipped} já existia(m), ${failed} falha(s). Pasta: ${outDir}`);
  if (failed) process.exitCode = 1;
}

main();
