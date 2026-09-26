import { it } from 'vitest';
import { CATALOG } from '../../data/catalog';
import { browse, lookupMeal, proposeImport } from '../themealdb';
it('live', async () => {
  const list = [...(await browse('c', 'Chicken'))!.slice(0, 10), ...(await browse('c', 'Beef'))!.slice(0, 10), ...(await browse('a', 'French'))!.slice(0, 10), ...(await browse('c', 'Vegetarian'))!.slice(0, 10)];
  let total = 0, mapped = 0, qty = 0; const unk = new Map<string, number>();
  for (const s of list) {
    const m = (await lookupMeal(s.id))!;
    for (const l of proposeImport(m, CATALOG)) { total++; if (l.ingredientId) { mapped++; if (l.qty) qty++; else unk.set(`NOQTY ${l.measure} | ${l.name} -> ${l.ingredientId}`, 1); } else unk.set(l.name.toLowerCase(), (unk.get(l.name.toLowerCase()) ?? 0) + 1); }
  }
  console.log({ meals: list.length, total, mapped, withQty: qty });
  console.log([...unk].sort((a, b) => b[1] - a[1]).slice(0, 60).map(([k, v]) => `${k}:${v}`).join(', '));
}, 120000);
