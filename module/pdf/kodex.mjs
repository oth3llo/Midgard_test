// Zerleger für „Der Kodex“ (M5): Beschreibungen der allgemeinen Fertigkeiten (ab „Allgemeine
// Fertigkeiten“, S. 100) und der Waffenfertigkeiten (bis zum Buch des Ruhmes). Eine Beschreibung
// beginnt mit einer fetten Überschrift wie „Klettern (St) Bewegung ungelernt+(6)“ bzw.
// „Einhandschwerter“. Als Überschrift zählt nur, was einem bekannten Fertigkeitsnamen entspricht.
import { absaetze } from "./textzeilen.mjs";
import { unlesbar } from "./arkanum.mjs";

const WAFFE_KOPF = /^([A-ZÄÖÜ][^()]+?) \((\d?W\d[^)]*|[–-]|Gift)\)( .*)?$/;

export const normName = (s) => String(s).toLowerCase().replace(/[^a-zäöüß0-9]/g, "");

export function istKodex(zeilen) {
  const titel = new Set(zeilen.filter((z) => z.groesse >= 24).map((z) => z.text));
  return titel.has("Allgemeine Fertigkeiten") && titel.has("Das Buch der Begabungen");
}

/**
 * @param {Array} zeilen  Ergebnis von textzeilen() über das ganze Buch
 * @param {string[]} namen  bekannte Fertigkeits- und Waffenfertigkeitsnamen (auch Kodex-Schreibweisen)
 */
export function fertigkeitenAusKodex(zeilen, namen) {
  const bekannt = new Set(namen.map(normName));
  const fliess = zeilen.filter((z) => z.groesse === 10);
  const abstaende = fliess.map((z) => z.abstand).filter((a) => a > 5 && a < 20).sort((a, b) => a - b);
  const abstand = abstaende[Math.floor(abstaende.length / 2)] || 12;
  const ergebnis = [];
  let aktiv = false, akt = null;
  let waffe = null;
  const waffeAbschliessen = () => {
    if (!waffe) return;
    waffe.absaetze = absaetze(waffe.text, abstand).filter((a) => a.length > 1);
    delete waffe.text;
    if (waffe.absaetze.length) akt.waffen.push(waffe);
    waffe = null;
  };
  const abschliessen = () => {
    if (!akt) return;
    waffeAbschliessen();
    akt.absaetze = absaetze(akt.text, abstand).filter((a) => a.length > 1);
    delete akt.text;
    if (akt.absaetze.length || akt.waffen.length) ergebnis.push(akt);
    akt = null;
  };
  for (const z of zeilen) {
    if (z.groesse >= 30 && z.text.length <= 2) continue;     // Initiale
    if (z.groesse >= 24) {
      if (z.text === "Allgemeine Fertigkeiten") aktiv = true;
      else if (aktiv && z.groesse >= 30) { abschliessen(); aktiv = false; }
      continue;
    }
    if (!aktiv) continue;
    if (/^\d{1,3}$/.test(z.text) && z.groesse >= 14) continue;
    if (z.groesse > 10.5 && z.groesse < 13) {
      // Überschrift: Name vor der Leiteigenschaft in Klammern bzw. die ganze Zeile
      const name = z.text.replace(/\s*\((St|Gs|Gw|Ko|In|Zt|Au|pA|Wk)(\/\w+)?\).*$/, "").trim();
      if (bekannt.has(normName(name))) {
        abschliessen();
        akt = { name, titel: z.text, seite: z.seite, text: [], waffen: [] };
        continue;
      }
    }
    if (!akt || z.groesse < 9 || z.groesse > 10.5 || unlesbar(z.text)) continue;
    // Unter einer Waffenfertigkeit: Kopfzeile einer einzelnen Waffe, z. B. „Langschwert (1W6+1) St31, Gs21“
    const w = z.text.match(WAFFE_KOPF);
    if (w && w[1].length < 40) {
      waffeAbschliessen();
      waffe = { name: w[1].trim(), fertigkeit: akt.name, kopf: z.text, seite: z.seite, text: [] };
      continue;
    }
    (waffe ?? akt).text.push(z);
  }
  abschliessen();
  return ergebnis;
}

const RASSEN = { Elfen: "Elf", Gnome: "Gnom", Halblinge: "Halbling", Zwerge: "Zwerg" };

/**
 * Beschreibungen der Abenteurertypen (Kapitel „Mit Schwert und Magie“, S. 13-17) und der
 * nichtmenschlichen Rassen (S. 18-19). Ein Eintrag beginnt mit einem fett gesetzten Anfang
 * im Fließtext, z. B. „Assassinen (As) …“ oder „Zwerge hatten …“.
 * @returns {{typen: Array<{kuerzel: string[], name, absaetze, seite}>, rassen: Array<{name, absaetze, seite}>}}
 */
export function typenUndRassenAusKodex(zeilen) {
  const abstaende = zeilen.filter((z) => z.groesse === 10).map((z) => z.abstand).filter((a) => a > 5 && a < 20).sort((a, b) => a - b);
  const abstand = abstaende[Math.floor(abstaende.length / 2)] || 12;
  const typen = [], rassen = [];
  let aktiv = false, bereich = null, akt = null, kastenSpalte = null;
  // Schrift des fetten Einstiegs: die der ersten Zeile im Muster „Name (Kürzel)“
  let start = -1;
  for (let i = 0; i < zeilen.length; i++) if (zeilen[i].text === "Mit Schwert und Magie") { start = i; break; }
  if (start < 0) return { typen, rassen };
  // Einträge beginnen mit einem Aufzählungszeichen (Symbolschrift) und fettem Einstieg
  const fett = zeilen.slice(start, start + 400).find((z) => z.groesse === 10 && /^[^\p{L}\p{N}„(\s]/u.test(z.text))?.schrift;
  const abschliessen = () => {
    if (!akt) return;
    if (!akt.rasse) {
      // Kürzel steht im ersten Satz, nicht immer in der ersten Zeile
      const anfang = akt.text.slice(0, 3).map((z) => z.text).join(" ");
      const m = anfang.match(/([A-ZÄÖÜ][a-zäöüß]+) \(([A-Z][A-Za-zäö]?)( und ([A-Z][A-Za-zäö]?))?\)/);
      if (!m) { akt = null; return; }
      akt.name = m[1]; akt.kuerzel = [m[2], m[4]].filter(Boolean);
    }
    akt.absaetze = absaetze(akt.text, abstand).filter((a) => a.length > 1);
    delete akt.text;
    (akt.rasse ? rassen : typen).push(akt);
    akt = null;
  };
  for (const z of zeilen.slice(start)) {
    if (z.groesse >= 30 && z.text.length <= 2) continue;   // Initiale
    if (z.groesse >= 24) { if (aktiv) { abschliessen(); break; } aktiv = true; continue; }
    if (z.groesse > 13) {                          // Zwischenüberschrift oder Seitenzahl
      if (z.text === "Kämpfer" || z.text === "Zauberer") { abschliessen(); bereich = "typen"; }
      else if (z.text === "Nichtmenschliche Rassen") { abschliessen(); bereich = "rassen"; }
      continue;
    }
    if (!bereich || z.groesse < 9 || z.groesse > 10.5 || unlesbar(z.text)) continue;
    // Kasten (z. B. „Die Würfel“): kurze Überschriftzeile mit großem Abstand, Rest der Spalte überspringen
    if (kastenSpalte && kastenSpalte === `${z.seite}/${z.spalte}`) continue;
    if (z.schrift !== fett && z.text.length < 40 && (z.abstand ?? 0) > 30 && !/[.,;:!?-]$/.test(z.text)) { kastenSpalte = `${z.seite}/${z.spalte}`; continue; }
    const text = z.text.replace(/^[^A-Za-zÄÖÜäöü„(]+/, "");
    if (z.schrift === fett) {
      // die zuerst genannte Rasse („Gnome sind als Begleiter der Elfen …“ ist der Gnom)
      const r = bereich === "rassen" && Object.keys(RASSEN).map((n) => [n, text.slice(0, 40).search(new RegExp(`\\b${n}\\b`))]).filter(([, i]) => i >= 0).sort((a, b) => a[1] - b[1])[0]?.[0];
      if (bereich === "typen") { abschliessen(); akt = { seite: z.seite, text: [] }; }
      else if (r) { abschliessen(); akt = { name: RASSEN[r], rasse: true, seite: z.seite, text: [] }; }
    }
    if (akt) akt.text.push({ ...z, text });
  }
  abschliessen();
  for (const r of rassen) delete r.rasse;
  return { typen, rassen };
}

const RUESTUNG_START = /^\W*(OR|TR|LR|KR|PR|VR|RR) = [^:]{3,30}: ?/;

/** Beschreibungen der Rüstklassen (Kodex „Die Rüstklassen“, S. 72-73), nach Kürzel. */
export function ruestungenAusKodex(zeilen) {
  const abstaende = zeilen.filter((z) => z.groesse === 10).map((z) => z.abstand).filter((a) => a > 5 && a < 20).sort((a, b) => a - b);
  const abstand = abstaende[Math.floor(abstaende.length / 2)] || 12;
  const ergebnis = [];
  let akt = null, aktiv = false;
  const abschliessen = () => {
    if (!akt) return;
    akt.absaetze = absaetze(akt.text, abstand).filter((a) => a.length > 1);
    delete akt.text;
    ergebnis.push(akt);
    akt = null;
  };
  for (const z of zeilen) {
    if (z.text === "Die Rüstklassen") { aktiv = true; continue; }
    if (!aktiv) continue;
    if (/^\d{1,3}$/.test(z.text) && z.groesse >= 14) continue;
    const m = z.text.match(RUESTUNG_START);
    if (m) { abschliessen(); akt = { kuerzel: m[1], seite: z.seite, text: [{ ...z, text: z.text.replace(RUESTUNG_START, "") }] }; continue; }
    // nächste Zwischenüberschrift („Einschränkungen und Nachteile …“) beendet den Abschnitt
    if (akt && z.text.length < 45 && (z.abstand ?? 0) > 30 && !/[.,;:!?-]$/.test(z.text)) { abschliessen(); aktiv = false; break; }
    if (akt && z.groesse >= 9 && z.groesse <= 10.5 && !unlesbar(z.text)) akt.text.push(z);
  }
  abschliessen();
  return ergebnis;
}
