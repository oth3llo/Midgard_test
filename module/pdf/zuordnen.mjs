// Ordnet aus einer PDF gelesene Beschreibungen den Kompendium-Einträgen zu und baut daraus HTML.
import { normName } from "./kodex.mjs";
import { gliedern } from "./gliedern.mjs";

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
      const passend = kandidaten.filter((z) => normName(gruppeVon(z) ?? "") === normName(g.gruppe));
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
const WUERFEL_NAME = { "1d6": "W6", "1d10": "W10", "1d20": "W20", "1d100": "W%" };
// Zahl, Würfel oder kurzer Wert: Zelle rechtsbündig und schmal
const istWert = (c) => /^[+–-]?[\d.,]+%?$|^\d*W\d+|^\d*W%|^[–-]$/.test(String(c).trim());

function tabelleHtml(reihen, { titel, kopfSpalte } = {}) {
  const breite = Math.max(...reihen.map((r) => r.length));
  // Kopfzeile: erste Zeile ohne Zahlenwerte, darunter Zeilen mit Werten
  const kopf = !kopfSpalte && reihen.length >= 3 && reihen[0].filter(Boolean).length >= 2 && reihen[0].every((c) => !istWert(c))
    && reihen.slice(1).some((r) => r.some(istWert));
  const zelle = (c, k) => (kopfSpalte && k === 0 ? `<th scope="row">${esc(c)}</th>` : `<td${istWert(c) ? ' class="wert"' : c.length <= 12 ? ' class="kurz"' : ""}>${esc(c)}</td>`);
  const zeile = (r) => `<tr>${r.length === 1 || (r.filter(Boolean).length === 1 && r[0] && breite > 1 && r.slice(1).every((c) => !c))
    ? `<th colspan="${breite}" class="zwischen">${esc(r[0])}</th>` : r.map(zelle).join("")}</tr>`;
  const rumpf = kopf ? reihen.slice(1) : reihen;
  return `<table class="midgard-tabelle">${titel ? `<caption>${esc(titel)}</caption>` : ""}${kopf ? `<thead><tr>${reihen[0].map((c) => `<th>${esc(c)}</th>`).join("")}</tr></thead>` : ""}<tbody>${rumpf.map(zeile).join("")}</tbody></table>`;
}

const schrittHtml = (punkte) => `<ol class="midgard-schritte">${punkte.map((p) => `<li><span class="marke">${esc(p.marke)}</span> ${esc(p.text)}${p.unter.length ? schrittHtml(p.unter) : ""}</li>`).join("")}</ol>`;

/** Ein Block als HTML (Absatz, Tabelle, Kasten …; Blocktypen aus absaetze() und gliedern()). */
export function blockHtml(a) {
  if (typeof a === "string") return `<p>${esc(a)}</p>`;
  if (a.tabelle) return tabelleHtml(a.tabelle, a);
  if (a.wurftabelle) {
    const w = a.wurftabelle;
    // Inline-Wurf: Foundry macht daraus einen anklickbaren Würfel
    return `<table class="midgard-tabelle midgard-wurftabelle"><caption><span class="midgard-tabellenkopf">${w.titel ? `<span>${esc(w.titel)}</span> ` : ""}<span class="midgard-wurf">[[/r ${w.wuerfel}]]{${WUERFEL_NAME[w.wuerfel]} würfeln}</span></span></caption>`
      + `<thead><tr><th>${WUERFEL_NAME[w.wuerfel]}</th><th>Ergebnis</th></tr></thead><tbody>${w.zeilen.map(([b, t, d]) => `<tr><td class="bereich">${esc(b)}</td><td>${d ? `<strong>${esc(t)}</strong> ${esc(d)}` : esc(t)}</td></tr>`).join("")}</tbody></table>`;
  }
  if (a.liste) return `<ul class="midgard-liste">${a.liste.map((z) => `<li>${esc(z)}</li>`).join("")}</ul>`;
  if (a.schritte) return schrittHtml(a.schritte);
  if (a.wert) return `<p class="midgard-wert"><span>Wert</span> ${esc(a.wert)}</p>`;
  if (a.merk) return `<div class="midgard-merk"><p class="midgard-merk-titel">${esc(a.titel ?? "Auf einen Blick")}</p><dl>${a.merk.map(([k, v]) => `<dt>${esc(k)}</dt><dd>${esc(v)}</dd>`).join("")}</dl></div>`;
  if (a.beispiel) return `<details class="midgard-beispiel"><summary>Beispiel</summary><p>${esc(a.beispiel)}</p></details>`;
  if (a.randnotiz) return `<aside class="midgard-randnotiz"><p>${esc(a.randnotiz)}</p></aside>`;
  if (a.fussnote) return `<p class="midgard-fussnote">* ${esc(a.fussnote)}</p>`;
  // Kasten: Überschrift (erste kurze Zeile ohne Satzzeichen) und Stufen wie „(+4)“ fett
  if (a.kasten) return `<div class="midgard-kasten">${a.kasten.map((z, i) => (/\([+–-]\d+\)$/.test(z) || (i === 0 && a.kasten.length > 1 && z.length < 50 && !/[.,;:]$/.test(z)) ? `<p><strong>${esc(z)}</strong></p>` : `<p>${esc(z)}</p>`)).join("")}</div>`;
  if (a.einschub) return blockHtml(a.klein ? { beispiel: a.einschub } : { randnotiz: a.einschub });
  return "";
}

/** Absätze als HTML mit Fundstelle am Ende; die Blöcke werden vorher gegliedert (gliedern.mjs). */
export function alsHtml(absaetze, fundstelle) {
  return gegliedertAlsHtml(gliedern(absaetze), fundstelle);
}

/** Bereits gegliederte Blöcke als HTML (wenn die Blöcke auch für andere Zwecke gebraucht werden). */
export function gegliedertAlsHtml(bloecke, fundstelle) {
  return bloecke.map(blockHtml).join("") + (fundstelle ? `<p class="midgard-fundstelle"><em>${esc(fundstelle)}</em></p>` : "");
}
