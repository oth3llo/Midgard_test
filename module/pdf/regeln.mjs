// Zerleger für Regelkapitel (Kodex, Arkanum): gliedert den Text an den Überschriften in
// Kapitel (≥ 24 pt), Abschnitte (14-18 pt) und Unterabschnitte (fette Grundschrift mit großem
// Abstand davor). Ergebnis ist eine Liste von Kapiteln mit Seiten für das Regel-Kompendium.
import { absaetze } from "./textzeilen.mjs";
import { unlesbar } from "./arkanum.mjs";
import { anfangMelden } from "./textpruefung.mjs";

/** Seitenbereiche der Regelkapitel je Buch. */
export const REGELBEREICHE = {
  "Der Kodex": [[50, 94, "Das Buch der Gesetze"], [96, 100, "Das Buch der Begabungen"], [148, 157, "Das Buch des Ruhmes"], [165, 168, "Das Buch des Ruhmes"]],
  "Das Arkanum": [[9, 24, "Die Regeln der Magie"], [26, 36, "Die Welt der Magie"], [37, 61, "Der Konspekt der Zauberer"]],
};

/**
 * Zierschrift mit falscher Zeichenzuordnung („Einfğhr§ng“ → „Einführung“, „Kraf¥“ → „Kraft“,
 * „t¢effen“ → „treffen“). Ersetzt wird nur innerhalb von Wörtern.
 */
const ZIER = { "ğ": "ü", "§": "u", "¥": "t", "¢": "r" };
const zierschrift = (t) => (/[ğ§¥¢]/.test(t) ? t.replace(/(?<=\p{L})[ğ§¥¢]|[ğ§¥¢](?=\p{L})/gu, (c) => ZIER[c]) : t);

/** Titel eines Aufzählungseintrags: „Alba*: …“ → „Alba“, sonst der fette Einstieg, sonst die ersten Wörter. */
function eintragTitel(z) {
  const m = z.text.match(/^([^:]{2,40}?)\*?\s*(\([^)]{1,20}\))?\s*:/);
  if (m) return `${m[1].replace(/\*/g, "").trim()}${m[2] ? " " + m[2] : ""}`;
  if (z.fett && z.fett.length <= 40) return z.fett.replace(/:.*$/, "").trim();
  return z.text.split(" ").slice(0, 5).join(" ").replace(/[,.;:]$/, "");
}

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
  let eltern = null; // Abschnitt, unter dem gerade Aufzählungseinträge gesammelt werden
  const laengeVon = (zeilenListe) => zeilenListe.reduce((n, l) => n + l.text.length, 0);
  // Aufzählungseintrag beenden: kurz → als Listenpunkt im Abschnitt, ausführlich → eigene Seite
  const kindAbschliessen = () => {
    if (!eltern || seite === eltern || !seite) return;
    const laenge = laengeVon(seite.text);
    // klein beginnende „Titel“ („mehr als die Hälfte“) sind Listenpunkte, keine benannten Einträge
    const eigeneSeite = /^[A-ZÄÖÜ]/.test(seite.titel) && ((seite.doppelpunkt && laenge >= 60) || (seite.mitFett && laenge >= 150));
    if (!eigeneSeite) {
      seite.text[0] = { ...seite.text[0], text: `• ${seite.text[0].text}`, abstand: 99 };
      eltern.text.push(...seite.text);
      if (seite.text.length > 1 || true) eltern.text.push({ text: "", abstand: 99, leer: true });
    } else {
      seite.absaetze = absaetze(seite.text, abstand);
      delete seite.text;
      eltern.kinder.push(seite);
    }
    seite = eltern;
  };
  const seiteAbschliessen = () => {
    kindAbschliessen();
    if (!seite) return;
    seite.absaetze = absaetze(seite.text.filter((l) => !l.leer), abstand);
    // Absatz beginnt klein mitten im Satz: Anfang verloren (Textprüfung meldet die Stelle)
    if (typeof seite.absaetze[0] === "string" && /^[a-zäöüß]/.test(seite.absaetze[0])) anfangMelden(seite.titel, seite.absaetze[0], seite.seite);
    if (seite.wert) seite.absaetze.unshift({ wert: seite.wert });
    delete seite.text;
    delete seite.wert;
    const laenge = seite.absaetze.reduce((n, a) => n + (typeof a === "string" ? a.length : JSON.stringify(a).length), 0);
    if (laenge >= 40 || seite.kinder?.length) kap.seiten.push(seite);
    else if (laenge && kap.seiten.length) kap.seiten.at(-1).absaetze.push(...seite.absaetze); // Splitter anhängen
    for (const k of seite.kinder ?? []) kap.seiten.push(k);
    delete seite.kinder;
    seite = null;
    eltern = null;
  };
  const neueSeite = (titel, ebene, z) => {
    seiteAbschliessen();
    if (!kap) { kap = { titel, seite: z.seite, seiten: [] }; kapitel.push(kap); }
    seite = { titel, ebene, seite: z.seite, text: [], kinder: [] };
  };
  let stoppSeite = null;
  for (let i = 0; i < teil.length; i++) {
    const z = teil[i];
    // „Allgemeine Fertigkeiten“ (Kodex S. 100) gehört zum Fertigkeitsimport, nicht zu den Regeln
    if (z.groesse >= 24 && z.text === "Allgemeine Fertigkeiten") { seiteAbschliessen(); stoppSeite = z.seite; continue; }
    if (z.seite === stoppSeite) continue;
    const folge = vorher && vorher.seite === z.seite && vorher.spalte === z.spalte;
    if (z.groesse >= 30 && z.text.length <= 2) continue;                     // Initiale (schon zugeordnet)
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
      kap = { titel: z.text, seite: z.seite, seiten: [], gross: z.groesse >= 29 };
      kapitel.push(kap);
      seite = { titel: z.text, ebene: 1, seite: z.seite, text: [], kinder: [] };
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
    // Überschriften eingerückter Kästen („Schaden durch Brände“) beginnen keinen Abschnitt
    const unter = kopfTauglich && (z.einzug ?? 0) < 8 && z.groesse >= 9.5 && z.groesse < 14 && (z.abstand ?? 99) > abstand * 2.2
      && (z.schrift === kopfSchrift || z.groesse > 10.5);
    // zweite Zeile einer Unterüberschrift, wenn die erste erkennbar weiterläuft („Wurfwaffen bei“ / „Sturmangriffen“)
    if (vorher?.unterKopf && folge && /\s(bei|und|von|der|des|im|mit|für|aus|in|zu|gegen)$/.test(seite.titel) && (z.abstand ?? 99) < abstand * 1.5 && z.text.length < 40 && !/[.,;]$/.test(z.text)) {
      seite.titel = `${seite.titel} ${z.text}`;
      vorher = { ...z, unterKopf: true };
      continue;
    }
    if (unter) {
      neueSeite(zierschrift(z.text).replace(/\s[+–-]\s?[(\d].*$/, ""), 3, z); // „Berserkergang +(18–Wk/5)“ → „Berserkergang“
      // Wertangabe („Einprägen +4“, „Hören +2 / –2 auf EW:Wahrnehmung …“) als eigener Wertblock
      if (z.groesse > 10.5 && z.text !== seite.titel) seite.wert = z.text.slice(seite.titel.length).trim() || null;
      vorher = { ...z, unterKopf: true };
      continue;
    }
    // Aufzählungseintrag (Land, Gilde, Gottheit, Orden …): eigene Seite unter dem laufenden Abschnitt
    if (z.aufzaehlung && z.groesse >= 8.5 && z.groesse <= 10.5 && seite) {
      if (eltern) kindAbschliessen(); else eltern = seite;
      // eigene Seite nur für benannte Einträge: „Name: …“ (Götter, Verletzungen) oder fetter Name (Gilden, Lehrmeister)
      const titel = eintragTitel(z);
      const gueltig = /^[A-Za-zÄÖÜäöü]/.test(titel) && titel.length >= 3 && !/^[IVX]+$/.test(titel);
      const doppelpunkt = gueltig && /^[^:]{3,40}?\*?\s*(\([^)]{1,20}\))?\s*:/.test(z.text);
      seite = { titel, ebene: 4, seite: z.seite, text: [{ ...z, abstand: null }], doppelpunkt, mitFett: gueltig && !!z.fett };
      vorher = z;
      continue;
    }
    // Absatz nach einer Aufzählung gehört wieder zum Abschnitt
    if (eltern && seite !== eltern && z.groesse >= 8.5 && z.groesse <= 10.5 && (z.abstand ?? 0) > abstand * 1.45 && !/^[a-zäöüß]/.test(z.text)) kindAbschliessen();
    // etwas größer gesetzte Textzeilen (Formeln, Hervorhebungen in 11 pt) gehören zum Text, sonst ginge
    // z. B. „Die Formel »Bewegen M Luft l Erde« - zu lesen als: „Be-“ verloren
    const groessererText = z.groesse > 10.5 && z.groesse < 14 && seite && (z.text.length > 30 || /\p{L}-$/u.test(z.text));
    if ((z.groesse < 8.5 || z.groesse > 10.5) && !groessererText) { vorher = z; continue; }
    if (!seite) { vorher = z; continue; }
    // zweite Zeile einer Wertangabe („Riechen +2 / –2 auf EW:Wahrnehmung“ / „von Geruch und Geschmack“)
    if (seite.wert && !seite.text.length && /^[a-zäöüß]/.test(z.text) && z.text.length < 40) { seite.wert = `${seite.wert} ${z.text}`; vorher = z; continue; }
    seite.text.push(/[ğ§¥¢]/.test(z.text) ? { ...z, text: zierschrift(z.text) } : z);
    vorher = z;
  }
  seiteAbschliessen();
  // Buchteil je Kapitel aus dem Seitenbereich (Ordner im Regel-Kompendium)
  for (const k of kapitel) k.teil = bereiche.find(([a, b]) => k.seite >= a && k.seite <= b)?.[2] ?? null;
  return kapitel.filter((k) => k.seiten.length);
}
