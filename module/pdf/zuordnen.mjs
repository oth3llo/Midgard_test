// Ordnet aus einer PDF gelesene Beschreibungen den Kompendium-Einträgen zu und baut daraus HTML.
import { normName } from "./kodex.mjs";

/** Editierdistanz (für Tippfehler wie „Himmlicher“/„Himmlischer“). */
function distanz(a, b) {
  const d = Array.from({ length: a.length + 1 }, (_, i) => [i]);
  for (let j = 1; j <= b.length; j++) d[0][j] = j;
  for (let i = 1; i <= a.length; i++) {
    for (let j = 1; j <= b.length; j++) d[i][j] = Math.min(d[i - 1][j] + 1, d[i][j - 1] + 1, d[i - 1][j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
  }
  return d[a.length][b.length];
}

/**
 * @param {Array<{name, gruppe?}>} gelesen    Einträge aus der PDF (gruppe: Zaubergruppe oder Kategorie)
 * @param {Array<{_id, name, system}>} ziele  Kompendium-Einträge
 * @param {object} o  aliase: {Kodex-Name: Kompendium-Name}, gruppeVon: (ziel) => Gruppe
 * @returns {{paare: Array<[gelesen, ziel]>, nichtZugeordnet: Array, ohne: Array}}
 */
export function zuordnen(gelesen, ziele, { aliase = {}, gruppeVon = () => null } = {}) {
  const nachName = new Map();
  for (const z of ziele) {
    const k = normName(z.name);
    if (!nachName.has(k)) nachName.set(k, []);
    nachName.get(k).push(z);
  }
  for (const [von, nach] of Object.entries(aliase)) {
    const t = nachName.get(normName(nach));
    if (t && !nachName.has(normName(von))) nachName.set(normName(von), t);
  }
  const paare = [], nichtZugeordnet = [], vergeben = new Set();
  for (const g of gelesen) {
    let kandidaten = nachName.get(normName(g.name)) ?? [];
    if (!kandidaten.length) {
      // unscharf: genau ein Name mit Abstand höchstens 2 (bei kurzen Namen 1)
      const n = normName(g.name), grenze = n.length > 8 ? 2 : 1;
      kandidaten = [...nachName.entries()].filter(([k]) => Math.abs(k.length - n.length) <= grenze && distanz(k, n) <= grenze).flatMap(([, v]) => v);
    }
    if (kandidaten.length > 1 && g.gruppe) {
      const passend = kandidaten.filter((z) => gruppeVon(z) === g.gruppe);
      if (passend.length) kandidaten = passend;
    }
    kandidaten = kandidaten.filter((z) => !vergeben.has(z._id));
    if (kandidaten.length === 1) { paare.push([g, kandidaten[0]]); vergeben.add(kandidaten[0]._id); }
    else nichtZugeordnet.push(g);
  }
  const ohne = ziele.filter((z) => !vergeben.has(z._id));
  return { paare, nichtZugeordnet, ohne };
}

const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));

/** Absätze als HTML mit Fundstelle am Ende. */
export function alsHtml(absaetze, fundstelle) {
  return absaetze.map((a) => `<p>${esc(a)}</p>`).join("") + (fundstelle ? `<p class="midgard-fundstelle"><em>${esc(fundstelle)}</em></p>` : "");
}
