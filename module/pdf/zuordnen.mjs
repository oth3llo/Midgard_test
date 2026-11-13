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

/** „Begriff: Erklärung“ am Anfang: Begriff fett (kurz, ohne Satzzeichen, nicht „EW:Angriff“). */
function begriff(text, maxWoerter = 6) {
  const m = String(text).match(/^([A-ZÄÖÜ„(][^.:;!?]{1,40}?):\s+(\S.*)$/s);
  if (!m || m[1].split(/\s+/).length > maxWoerter || /^(EW|WW|PW)\b/.test(m[1])) return esc(text);
  return `<strong>${esc(m[1])}:</strong> ${esc(m[2])}`;
}

/**
 * Zeilen in Absätze und Listenpunkte zerlegen: „- Punkt“ am Zeilenanfang oder mitten in der Zeile
 * („Scheuen und Durchgehen - EW–4 … - Durchgehendes …“) wird zum Listenpunkt, wenn es mindestens
 * zwei solche Punkte gibt; ein einzelner Strich mitten in der Zeile („Adlergilde - Schwerpunkt
 * Erkennen“) bleibt Text, außer die Liste geht in der nächsten Zeile mit „- “ weiter.
 */
function zeilenMitStrichen(zeilen) {
  const STRICH = /(?:^|\s)-\s+(?=[A-ZÄÖÜ„(])/;
  const stuecke = [];
  zeilen.forEach((z, k) => {
    const teile = z.split(STRICH);
    if (teile.length === 2 && teile[0].trim() && !/^- /.test(zeilen[k + 1] ?? "")) { stuecke.push({ li: false, text: z.trim() }); return; }
    teile.forEach((t, n) => { if (t.trim()) stuecke.push({ li: n > 0, text: t.trim() }); });
  });
  if (stuecke.filter((x) => x.li).length < 2) return null;
  let html = "", offen = false;
  for (const x of stuecke) {
    if (x.li && !offen) { html += "<ul>"; offen = true; }
    if (!x.li && offen) { html += "</ul>"; offen = false; }
    html += x.li ? `<li>${begriff(x.text)}</li>` : `<p class="midgard-kasten-zwischen">${begriff(x.text)}</p>`;
  }
  return html + (offen ? "</ul>" : "");
}

/**
 * Kasten aus einzelnen Zeilen. Mit Stufen wie „sehr leicht (+4)“: Titel als Kopfleiste, jede Stufe als
 * farbige Marke (Zuschlag grün, Abzug rot), die Fälle darunter eingerückt als Aufzählung. Zeilen vor der
 * ersten Stufe gehören zum (umbrochenen) Titel; eine Zeile „Schwierigkeit …“ zwischen den Stufen beginnt
 * einen zweiten Teil mit eigener Kopfleiste (Fälschen: Einsatz und Widerstand). Ohne Stufen: Titel, dann
 * Strichaufzählung, Aufzählung oder Absätze; „Begriff: Erklärung“ mit fettem Begriff.
 */
function kastenHtml(zeilen) {
  const STUFE = /^(.*?)\s*\(([+–-]\d+)\)$/;
  const istTitel = (z) => z.length < 60 && !/[.,;:]$/.test(z) && !STUFE.test(z);
  if (zeilen.some((z) => STUFE.test(z))) {
    const teile = [];
    let teil = null;
    for (const z of zeilen) {
      const m = z.match(STUFE);
      if (m) {
        if (!teil) { teil = { titel: "", gruppen: [] }; teile.push(teil); }
        teil.gruppen.push({ name: m[1], wert: m[2], faelle: [] });
      } else if (!teil || (!teil.gruppen.length && istTitel(z))) {
        if (!teil) { teil = { titel: "", gruppen: [] }; teile.push(teil); }
        teil.titel = teil.titel ? `${teil.titel} ${z}` : z; // umbrochener Titel („… einer Spur mit“ / „Spurensuche“)
      } else if (/^Schwierigkeit\b/.test(z) && istTitel(z)) {
        teil = { titel: z, gruppen: [] };
        teile.push(teil);
      } else if (teil.gruppen.length) teil.gruppen.at(-1).faelle.push(z);
      else teil.titel += ` ${z}`;
    }
    return `<div class="midgard-kasten midgard-stufen">${teile.map((t) => `${t.titel ? `<p class="midgard-kasten-titel">${esc(t.titel)}</p>` : ""}<dl>${t.gruppen.map((g) => `<dt><span class="midgard-stufe ${/^\+/.test(g.wert) ? "plus" : "minus"}">${esc(g.wert)}</span> ${esc(g.name)}</dt><dd>${g.faelle.length ? `<ul>${g.faelle.map((f) => `<li>${esc(f)}</li>`).join("")}</ul>` : ""}</dd>`).join("")}</dl>`).join("")}</div>`;
  }
  let titel = zeilen.length > 1 && istTitel(zeilen[0]) && !/\s-\s/.test(zeilen[0]) ? zeilen[0] : null;
  let rest = titel ? zeilen.slice(1) : zeilen;
  // Titel, der mit der ersten Strichliste in einer Zeile steht („Reiten als ungelernte Fertigkeit - Bei …“)
  const m = !titel && rest[0]?.match(/^([A-ZÄÖÜ][^.:;!?-]{2,48}?)\s-\s+(?=[A-ZÄÖÜ])/);
  if (m && !/\d/.test(m[1])) { titel = m[1]; rest = [`- ${rest[0].slice(m[0].length)}`, ...rest.slice(1)]; }
  const kopf = titel ? `<p class="midgard-kasten-titel">${esc(titel)}</p>` : "";
  const inhalt = zeilenMitStrichen(rest)
    ?? (rest.length > 1 ? `<ul>${rest.map((z) => `<li>${begriff(z)}</li>`).join("")}</ul>` : rest.map((z) => `<p>${begriff(z)}</p>`).join(""));
  return `<div class="midgard-kasten">${kopf}${inhalt}</div>`;
}

/** Ein Block als HTML (Absatz, Tabelle, Kasten …; Blocktypen aus absaetze() und gliedern()). */
export function blockHtml(a) {
  if (typeof a === "string") return `<p>${esc(a)}</p>`;
  if (a.tabelle) return tabelleHtml(a.tabelle, a);
  if (a.wurftabelle) {
    const w = a.wurftabelle;
    // Würfelknopf des Systems (module/tabellenwurf.mjs): würfelt, sucht die Zeile und zeigt Ergebnis und Text im Chat
    return `<table class="midgard-tabelle midgard-wurftabelle" data-wuerfel="${w.wuerfel}"><caption><span class="midgard-tabellenkopf">${w.titel ? `<span class="midgard-tabellentitel">${esc(w.titel)}</span> ` : "<span></span>"}<a class="midgard-tabellenwurf" data-wuerfel="${w.wuerfel}" role="button" tabindex="0" title="Würfeln und Ergebnis in den Chat"><i class="fa-solid fa-dice-d20"></i> ${WUERFEL_NAME[w.wuerfel]} würfeln</a></span></caption>`
      + `<thead><tr><th>${WUERFEL_NAME[w.wuerfel]}</th><th>Ergebnis</th></tr></thead><tbody>${w.zeilen.map(([b, t, d]) => `<tr><td class="bereich">${esc(b)}</td><td>${d ? `<strong>${esc(t)}</strong> ${esc(d)}` : esc(t)}</td></tr>`).join("")}</tbody></table>`;
  }
  if (a.liste) return `<ul class="midgard-liste">${a.liste.map((z) => `<li>${begriff(z)}</li>`).join("")}</ul>`;
  if (a.schritte) return schrittHtml(a.schritte);
  if (a.wert) return `<p class="midgard-wert"><span>Wert</span> ${esc(a.wert)}</p>`;
  if (a.merk) return `<div class="midgard-merk"><p class="midgard-merk-titel">${esc(a.titel ?? "Auf einen Blick")}</p><dl>${a.merk.map(([k, v]) => `<dt>${esc(k)}</dt><dd>${esc(v)}</dd>`).join("")}</dl></div>`;
  if (a.beispiel) return `<details class="midgard-beispiel"><summary>Beispiel</summary><p>${esc(a.beispiel)}</p></details>`;
  if (a.randnotiz) return `<aside class="midgard-randnotiz"><p>${esc(a.randnotiz)}</p></aside>`;
  if (a.fussnote) return `<p class="midgard-fussnote">* ${esc(a.fussnote)}</p>`;
  // Kasten: Überschrift (erste kurze Zeile ohne Satzzeichen) und Stufen wie „(+4)“ fett
  if (a.kasten) return kastenHtml(a.kasten);
  if (a.box) return `<aside class="midgard-box">${a.box.titel ? `<p class="midgard-box-titel">${esc(a.box.titel)}</p>` : ""}<div class="midgard-box-inhalt">${a.box.bloecke.map(blockHtml).join("")}</div></aside>`;
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
