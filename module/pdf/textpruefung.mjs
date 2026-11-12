// Textprüfung beim Import: Ein Wörterbuch aus dem ganzen Buch entscheidet, ob ein am Zeilenende
// getrenntes Wort zusammengehört („Fertigkei-“ + „ten“), ob ein Bindestrich bleibt („Nahkampf-Waffe“),
// ob ein zerrissenes Wort zu verbinden ist („Pfl anzenkunde“) und ob am Absatzanfang ein Buchstabe
// fehlt („at ein Abenteurer“ → „Hat ein Abenteurer“). Was sich nicht sicher entscheiden lässt, wird
// als verdächtig gemeldet. Läuft rein auf Daten (Node und Browser).

let WB = null;                 // Map: Wort (klein) → Anzahl im Buch
let bericht = leererBericht();

function leererBericht() {
  return { anzahl: {}, trennungen: [], ohneBeleg: [], bindestriche: [], zusammengefuegt: [], anfaenge: [], umbrueche: [], verdaechtig: [] };
}
// zählt jede Stelle, behält aber höchstens 200 Beispiele je Art
const merke = (liste, eintrag) => {
  const art = Object.keys(bericht).find((k) => bericht[k] === liste);
  bericht.anzahl[art] = (bericht.anzahl[art] || 0) + 1;
  if (liste.length < 200) liste.push(eintrag);
};
const n = (art) => bericht.anzahl[art] || 0;

const WORT = /\p{L}+/gu;
const klein = (w) => w.toLocaleLowerCase("de");
export const anzahl = (w) => (WB ? WB.get(klein(w)) ?? 0 : 0);

/**
 * Wörterbuch aus allen Zeilen des Buches. Bruchstücke an Trennstellen (Wort vor „-“ am Zeilenende
 * und das erste Wort der Folgezeile) zählen nicht, damit sie nicht als echte Wörter gelten.
 */
export function woerterbuchBauen(zeilen) {
  const wb = new Map();
  let vorherGetrennt = false;
  for (const z of zeilen) {
    const t = String(z.text ?? "");
    const treffer = [...t.matchAll(WORT)];
    const getrennt = /\p{L}-$/u.test(t);
    treffer.forEach((m, i) => {
      if (i === 0 && vorherGetrennt) return;
      if (getrennt && i === treffer.length - 1) return;
      const w = klein(m[0]);
      wb.set(w, (wb.get(w) || 0) + 1);
    });
    vorherGetrennt = getrennt;
  }
  // Bindestrich-Wörter („Nahkampf-Angriff“) getrennt zählen: an Trennstellen entscheiden sie über den Strich
  wb.strich = new Map();
  for (const z of zeilen) for (const m of String(z.text ?? "").matchAll(/\p{L}+-\p{L}+/gu)) wb.strich.set(klein(m[0]), (wb.strich.get(klein(m[0])) || 0) + 1);
  return wb;
}

/** Wörterbuch für die folgenden Zerlegungen setzen und den Bericht zurücksetzen. */
export function woerterbuchSetzen(wb) { WB = wb; bericht = leererBericht(); }
export function woerterbuchLoeschen() { WB = null; }
export const woerterbuchAktiv = () => WB !== null;

/** Bericht der Prüfung (Anzahlen und Beispiele). */
export function pruefbericht() {
  return {
    ...bericht,
    anzahl: { ...bericht.anzahl },
    zusammenfassung: `${n("trennungen") + n("bindestriche") + n("ohneBeleg")} Trennungen geprüft (${n("ohneBeleg")} ohne Beleg im Buch), ${n("zusammengefuegt")} zerrissene Wörter verbunden, ${n("anfaenge")} fehlende Anfangsbuchstaben ergänzt, ${n("umbrueche")} vorzeitige Umbrüche zusammengeführt, ${n("verdaechtig")} verdächtige Stellen`,
  };
}

/**
 * Entscheidung an einer Trennstelle (Zeile endet auf „-“). Gibt den verbundenen Text zurück oder
 * null, wenn die übliche Regel greifen soll (ohne Wörterbuch immer null).
 */
export function trennstelle(akt, text) {
  if (!WB) return null;
  const vorne = akt.match(/(\p{L}+)-$/u), hinten = text.match(/^(\p{L}+)/u);
  if (!vorne || !hinten) return null;
  const [stamm, rest] = [vorne[1], hinten[1]];
  if (/^(und|oder|bzw|sowie)$/i.test(rest)) return null;          // „Schuss- oder Wurfwaffen“
  const ganz = stamm + rest, mitStrich = `${stamm}-${rest}`;
  const nGanz = anzahl(ganz), nStrich = anzahlMitStrich(mitStrich);
  if (/^\p{Lu}/u.test(rest)) {
    // „Nahkampf-“ + „Waffe“: Bindestrich-Wort nur, wenn das Buch es so schreibt
    if (nStrich > 0) { merke(bericht.bindestriche, mitStrich); return `${akt}${text}`; }
    return null;
  }
  if (nGanz > 0 || nStrich === 0) {
    // seltene Wörter stehen oft nur einmal und getrennt im Buch: verbunden, aber als „ohne Beleg“ gezählt
    merke(nGanz > 0 ? bericht.trennungen : bericht.ohneBeleg, ganz);
    return `${akt.slice(0, -1)}${text}`;
  }
  merke(bericht.bindestriche, mitStrich);                         // „E-Mail“, „Lebens-Energie“ wie im Buch
  return `${akt}${text}`;
}

function anzahlMitStrich(w) { return WB?.strich?.get(klein(w)) ?? 0; }

/** Wörterbuch einschließlich der Bindestrich-Wörter („Nahkampf-Waffe“) aus den Zeilen bauen und setzen. */
export function textPruefen(zeilen, { reparieren = true } = {}) {
  woerterbuchSetzen(woerterbuchBauen(zeilen));
  if (reparieren) anfaengePruefen(zeilen);
  return pruefbericht();
}

const BUCHSTABEN = "abcdefghijklmnopqrstuvwxyzäöü";

/**
 * Fehlender Anfangsbuchstabe am Absatzanfang (Initiale nicht erkannt): Das erste Wort kommt im Buch
 * nicht vor, mit genau einem vorangestellten Buchstaben aber häufig. Ersetzt wird nur bei eindeutigem
 * Ergebnis; sonst wird die Stelle gemeldet.
 */
export function anfaengePruefen(zeilen) {
  for (let i = 0; i < zeilen.length; i++) {
    const z = zeilen[i], vor = zeilen[i - 1];
    // Absatzanfang: neben einer Initiale oder nach einem Satzende. Beginnt ein Satz klein, fehlt der
    // Anfangsbuchstabe (oder der Text läuft aus einer anderen Spalte weiter: dann gibt es kein Satzende davor)
    const absatzanfang = z.nebenInitiale || !vor || /[.!?:“"]$/.test(vor.text);
    if (!absatzanfang) continue;
    const m = String(z.text).match(/^(\p{L}{2,})(?=[\s,.;:!?]|$)/u);
    if (!m || (!z.nebenInitiale && !/^\p{Ll}/u.test(m[1])) || anzahl(m[1]) > 1) continue;
    const kandidaten = [...BUCHSTABEN].map((b) => [b, anzahl(b + m[1])]).filter(([, n]) => n > 0).sort((a, b) => b[1] - a[1]);
    if (!kandidaten.length) continue;
    const [beste, zweite] = kandidaten;
    if (beste[1] >= 5 && (!zweite || beste[1] >= zweite[1] * 3)) {
      // Absatzanfang: großer Anfangsbuchstabe, Rest klein („at“ → „Hat“, „Ufgabe“ → „Aufgabe“)
      const neu = beste[0].toLocaleUpperCase("de") + klein(m[1]);
      merke(bericht.anfaenge, { alt: m[1], neu, seite: z.seite });
      z.text = neu + z.text.slice(m[1].length);
    } else merke(bericht.verdaechtig, { art: "Absatzanfang", text: z.text.slice(0, 40), seite: z.seite });
  }
}

/**
 * Zerrissene Wörter in einem fertigen Absatz verbinden („Pfl anzenkunde“ → „Pflanzenkunde“):
 * Ein Teil kommt im Buch allein nicht vor, die Verbindung aber mindestens zweimal.
 */
export function woerterVerbinden(text) {
  if (!WB || typeof text !== "string") return text;
  // jedes benachbarte Wortpaar prüfen (auch überlappend: „Die Pfl anzenkunde“)
  const teile = text.split(/(\p{L}+)/u); // gerade Indizes: Zwischenraum, ungerade: Wörter
  for (let i = 1; i + 2 < teile.length; i += 2) {
    const a = teile[i], b = teile[i + 2];
    if (teile[i + 1] !== " " || (anzahl(a) > 1 && anzahl(b) > 1)) continue;
    const verbunden = a + b;
    if (anzahl(verbunden) < 2) continue;
    merke(bericht.zusammengefuegt, `${a} ${b} → ${verbunden}`);
    teile.splice(i, 3, verbunden);
    i -= 2;
  }
  return teile.join("");
}

/** Vorzeitigen Umbruch melden (wird von gliedern() zusammengeführt). */
export function umbruchMelden(a, b) { merke(bericht.umbrueche, `${a.slice(-30)} | ${b.slice(0, 30)}`); }

/**
 * Gehört der Rest zu einem anderen Wort des Buches („tigkeitswert“ in „Fertigkeitswert“, „troffen“ in
 * „getroffen“), während Anfang und Rest zusammen kein Wort ergeben? Dann fehlt dazwischen Text.
 */
export function wortLuecke(stamm, rest) {
  if (!WB || anzahl(stamm + rest) > 0) return false;
  const r = klein(rest);
  for (const w of WB.keys()) if (w.length > r.length && w.endsWith(r)) return true;
  return false;
}

/** Textlücke zwischen zwei Absätzen („keinen so-“ | „tigkeitswert“): nicht verbinden, melden. */
export function lueckeMelden(a, b) { merke(bericht.verdaechtig, { art: "Textlücke", text: `${a.slice(-25)} | ${b.slice(0, 25)}` }); }

/** Absatz, der mitten im Satz klein beginnt (verlorener Anfang), melden. */
export function anfangMelden(titel, text, seite) { merke(bericht.verdaechtig, { art: "Textanfang", text: `${titel}: ${text.slice(0, 40)}`, seite }); }
