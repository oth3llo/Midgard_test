// Zerlegt PDF-Seiten (pdf.js) in Textzeilen in Lesereihenfolge: zweispaltiger Satz,
// linke Spalte von oben nach unten, dann rechte. Läuft im Browser (Foundry) und in Node (Tests).

/**
 * @param {object} doc        pdf.js-Dokument
 * @param {number} von, bis   Seitennummern (1-basiert, einschließlich)
 * @returns {Promise<Array<{text, x, y, groesse, schrift, seite, spalte, abstand}>>}
 */
export async function textzeilen(doc, von = 1, bis = doc.numPages) {
  const alle = [];
  for (let n = von; n <= Math.min(bis, doc.numPages); n++) {
    const seite = await doc.getPage(n);
    const breite = seite.view[2] - seite.view[0];
    const hoehe = seite.view[3] - seite.view[1];
    const inhalt = await seite.getTextContent();
    const stuecke = inhalt.items.filter((i) => i.str !== undefined && (i.str.trim() || i.hasEOL)).map((i) => ({
      text: i.str, x: i.transform[4], y: i.transform[5], groesse: Math.round(Math.hypot(i.transform[2], i.transform[3]) * 10) / 10,
      schrift: i.fontName, breite: i.width,
    }));
    const mitte = breite / 2;
    for (const spalte of [0, 1]) {
      const teil = stuecke.filter((s) => s.text.trim() && (spalte === 0 ? s.x < mitte - 5 : s.x >= mitte - 5));
      // Zeilen: gleiche Grundlinie (Toleranz 2 pt)
      teil.sort((a, b) => b.y - a.y || a.x - b.x);
      const zeilen = [];
      for (const s of teil) {
        const z = zeilen.find((l) => Math.abs(l.y - s.y) < 2);
        if (z) z.teile.push(s); else zeilen.push({ y: s.y, teile: [s] });
      }
      zeilen.sort((a, b) => b.y - a.y);
      let vorher = null;
      for (const z of zeilen) {
        z.teile.sort((a, b) => a.x - b.x);
        let text = "";
        let ende = null;
        for (const t of z.teile) {
          if (ende !== null && t.x - ende > t.groesse * 0.15 && !text.endsWith(" ") && !t.text.startsWith(" ")) text += " ";
          text += t.text;
          ende = t.x + t.breite;
        }
        text = text.replace(/\s+/g, " ").trim();
        if (!text) continue;
        const kopf = z.teile.reduce((a, b) => (b.groesse > a.groesse ? b : a));
        alle.push({ text, x: z.teile[0].x, y: z.y, groesse: kopf.groesse, schrift: kopf.schrift, seite: n, spalte, hoehe, abstand: vorher === null ? null : vorher - z.y });
        vorher = z.y;
      }
    }
  }
  ligaturenReparieren(alle);
  return alle;
}

/**
 * Manche PDFs geben die Ligaturen fl, ff, fi mit einem Leerzeichen dahinter aus („Pfl anzenkunde“).
 * Verbunden wird nur, wenn das Bruchstück danach im Buch nicht als eigenes Wort vorkommt;
 * so bleibt „Angriff mit“ getrennt, „Angriff e“ wird zu „Angriffe“.
 */
export function ligaturenReparieren(zeilen) {
  const LIG = /(ffi|ffl|ff|fl|fi) ([a-zäöüß][a-zäöüß-]*)/g;
  const woerter = new Map();
  for (const z of zeilen) {
    for (const m of z.text.matchAll(/(^|[\s(„"])([a-zäöüß]+)/g)) {
      const vorher = z.text.slice(Math.max(0, m.index - 4), m.index + m[1].length);
      if (/(ffi|ffl|ff|fl|fi) $/.test(vorher)) continue; // Bruchstück nach Ligatur zählt nicht
      woerter.set(m[2], (woerter.get(m[2]) || 0) + 1);
    }
  }
  // kurze Bruchstücke wie „s“, „e“, „en“ sind Wortenden, außer echten Kurzwörtern
  const KURZ = new Set(["in", "an", "am", "um", "zu", "so", "da", "ob", "es", "er", "im", "ab", "je", "ja", "wo", "du", "wir", "ihr", "sie"]);
  for (const z of zeilen) {
    z.text = z.text.replace(LIG, (ganz, lig, rest) => {
      const wort = rest.replace(/-$/, "");
      const eigenes = wort.length <= 2 ? KURZ.has(wort) : woerter.has(wort);
      return eigenes ? ganz : lig + rest;
    });
  }
}

/** Fügt Zeilen zu Absätzen zusammen und löst Silbentrennung am Zeilenende auf. */
export function absaetze(zeilen, zeilenabstand) {
  const out = [];
  let akt = "";
  for (const z of zeilen) {
    // Großer Abstand beginnt einen Absatz, außer der Satz läuft erkennbar weiter (Kasten oder
    // Beispiel mitten in der Spalte): voriger Text ohne Satzende und Zeile beginnt klein.
    const satzLaeuft = !/[.!?:“")]$/.test(akt) && /^[a-zäöüß]/.test(z.text);
    const neuerAbsatz = akt && z.abstand !== null && (z.abstand > zeilenabstand * 1.45 || z.abstand < 0) && !satzLaeuft;
    if (neuerAbsatz) { out.push(akt); akt = ""; }
    if (!akt) { akt = z.text; continue; }
    if (/[a-zäöüß]-$/.test(akt) && /^[a-zäöüß]/.test(z.text) && !/^(und|oder|bzw\.|sowie)\b/.test(z.text)) akt = akt.slice(0, -1) + z.text;
    else akt += " " + z.text;
  }
  if (akt) out.push(akt);
  return out;
}
