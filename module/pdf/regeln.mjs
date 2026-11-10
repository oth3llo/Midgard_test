// Zerleger für Regelkapitel (Kodex, Arkanum): gliedert den Text an den Überschriften in
// Kapitel (≥ 24 pt), Abschnitte (14-18 pt) und Unterabschnitte (fette Grundschrift mit großem
// Abstand davor). Ergebnis ist eine Liste von Kapiteln mit Seiten für das Regel-Kompendium.
import { absaetze } from "./textzeilen.mjs";
import { unlesbar } from "./arkanum.mjs";

/** Seitenbereiche der Regelkapitel je Buch. */
export const REGELBEREICHE = {
  "Der Kodex": [[50, 94], [96, 100], [148, 157], [165, 168]],
  "Das Arkanum": [[9, 24], [26, 36], [37, 61]],
};

/** Zierschrift mit falscher Zeichenzuordnung („Einfğhr§ng“ → „Einführung“). */
const zierschrift = (t) => (/[ğ§]/.test(t) ? t.replace(/ğ/g, "ü").replace(/§/g, "u") : t);

const median = (w) => { const s = [...w].sort((a, b) => a - b); return s.length ? s[Math.floor(s.length / 2)] : null; };

/**
 * @param {Array} zeilen  Ergebnis von textzeilen() über das ganze Buch
 * @param {Array<[number, number]>} bereiche  Seitenbereiche
 * @returns {Array<{titel, seite, seiten: Array<{titel, ebene, seite, absaetze}>}>}
 */
export function regelnAusBuch(zeilen, bereiche) {
  const imBereich = (s) => bereiche.some(([a, b]) => s >= a && s <= b);
  const teil = zeilen.filter((z) => imBereich(z.seite));
  const fliess = teil.filter((z) => z.groesse === 10);
  const abstand = median(fliess.map((z) => z.abstand).filter((a) => a > 5 && a < 20)) || 12;
  // Schrift der Unterüberschriften: häufigste Schrift kurzer Grundschriftzeilen mit großem Abstand
  const zaehl = new Map();
  for (const z of fliess) if ((z.abstand ?? 0) > abstand * 3 && z.text.length < 50 && /^[A-ZÄÖÜ]/.test(z.text)) zaehl.set(z.schrift, (zaehl.get(z.schrift) || 0) + 1);
  const grund = new Map();
  for (const z of fliess) grund.set(z.schrift, (grund.get(z.schrift) || 0) + 1);
  const grundSchrift = [...grund].sort((a, b) => b[1] - a[1])[0]?.[0];
  const kopfSchrift = [...zaehl].filter(([s]) => s !== grundSchrift).sort((a, b) => b[1] - a[1])[0]?.[0];

  const kapitel = [];
  let kap = null, seite = null, vorher = null;
  const seiteAbschliessen = () => {
    if (!seite) return;
    seite.absaetze = absaetze(seite.text, abstand).filter((a) => a.length > 1);
    delete seite.text;
    const laenge = seite.absaetze.join(" ").length;
    if (laenge >= 40) kap.seiten.push(seite);
    else if (laenge && kap.seiten.length) kap.seiten.at(-1).absaetze.push(...seite.absaetze); // Splitter anhängen
    seite = null;
  };
  const neueSeite = (titel, ebene, z) => {
    seiteAbschliessen();
    if (!kap) { kap = { titel, seite: z.seite, seiten: [] }; kapitel.push(kap); }
    seite = { titel, ebene, seite: z.seite, text: [] };
  };
  let stoppSeite = null;
  for (let i = 0; i < teil.length; i++) {
    const z = teil[i];
    // „Allgemeine Fertigkeiten“ (Kodex S. 100) gehört zum Fertigkeitsimport, nicht zu den Regeln
    if (z.groesse >= 24 && z.text === "Allgemeine Fertigkeiten") { seiteAbschliessen(); stoppSeite = z.seite; continue; }
    if (z.seite === stoppSeite) continue;
    const folge = vorher && vorher.seite === z.seite && vorher.spalte === z.spalte;
    if (z.groesse >= 30 && z.text.length <= 2) continue;                     // Initiale
    if (/^\d{1,3}$/.test(z.text) && z.groesse >= 14) continue;                 // Seitenzahl
    if (unlesbar(z.text)) continue;
    // mehrzeilige Überschrift („Der Schaden“ / „und die Folgen“) zusammenführen
    if (z.groesse >= 14 && vorher?.kopf && folge && Math.abs(vorher.groesse - z.groesse) < 0.5 && (z.abstand ?? 99) < z.groesse * 1.8
      && `${vorher.kopf.seite.titel} ${z.text}`.length <= 60) {
      const k = vorher.kopf;
      k.seite.titel = `${k.seite.titel} ${z.text}`.replace(/\s+/g, " ");
      if (k.kapitel) k.kapitel.titel = k.seite.titel;
      vorher = { ...z, kopf: k };
      continue;
    }
    if (z.groesse >= 24) {                                                     // Kapitel (auch Buchtitel)
      seiteAbschliessen();
      kap = { titel: z.text, seite: z.seite, seiten: [] };
      kapitel.push(kap);
      seite = { titel: z.text, ebene: 1, seite: z.seite, text: [] };
      vorher = { ...z, kopf: { kapitel: kap, seite } };
      continue;
    }
    // Seitenzahlen, Tabellenköpfe, Tabellenzeilen mit Symbolzeichen am Ende („Magan Schwarz v“)
    if (z.groesse >= 14 && (/^\d+$/.test(z.text) || z.text.length > 60 || /\s\S$/.test(z.text.trim()))) { vorher = z; continue; }
    if (z.groesse >= 14) {                                                     // Abschnitt
      neueSeite(zierschrift(z.text), 2, z);
      vorher = { ...z, kopf: { seite } };
      continue;
    }
    // Wertangabe hinter dem Namen abtrennen („Hören +2 / –2 auf EW:Wahrnehmung …“ → „Hören“)
    const kopfText = z.groesse > 10.5 ? z.text.replace(/\s[+–-]\s?[(\d].*$/, "") : z.text;
    const naechste = teil[i + 1]?.text ?? "";
    const kopfTauglich = kopfText.length <= 55 && /^[A-ZÄÖÜ]/.test(kopfText) && !/[.,;:!*-]$|[»«„“"=:]/.test(kopfText) && !/^(EW|WW|PW)\b|^\d/.test(kopfText)
      && !(kopfText.length > 40 && /^[a-zäöüß]/.test(naechste)); // lange Zeile, Satz läuft klein weiter: keine Überschrift
    const unter = kopfTauglich && z.groesse >= 9.5 && z.groesse < 14 && (z.abstand ?? 99) > abstand * 2.2
      && (z.schrift === kopfSchrift || z.groesse > 10.5);
    // zweite Zeile einer Unterüberschrift, wenn die erste erkennbar weiterläuft („Wurfwaffen bei“ / „Sturmangriffen“)
    if (vorher?.unterKopf && folge && /\s(bei|und|von|der|des|im|mit|für|aus|in|zu|gegen)$/.test(seite.titel) && (z.abstand ?? 99) < abstand * 1.5 && z.text.length < 40 && !/[.,;]$/.test(z.text)) {
      seite.titel = `${seite.titel} ${z.text}`;
      vorher = { ...z, unterKopf: true };
      continue;
    }
    if (unter) {
      neueSeite(zierschrift(z.text).replace(/\s[+–-]\s?[(\d].*$/, ""), 3, z); // „Berserkergang +(18–Wk/5)“ → „Berserkergang“
      if (z.groesse > 10.5 && z.text !== seite.titel) seite.text.push({ ...z, abstand: null }); // Wertangabe behalten
      vorher = { ...z, unterKopf: true };
      continue;
    }
    if (z.groesse < 8.5 || z.groesse > 10.5) { vorher = z; continue; }
    if (!seite) { vorher = z; continue; }
    seite.text.push(z);
    vorher = z;
  }
  seiteAbschliessen();
  return kapitel.filter((k) => k.seiten.length);
}
