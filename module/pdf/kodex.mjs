// Zerleger für „Der Kodex“ (M5): Beschreibungen der allgemeinen Fertigkeiten (ab „Allgemeine
// Fertigkeiten“, S. 100) und der Waffenfertigkeiten (bis zum Buch des Ruhmes). Eine Beschreibung
// beginnt mit einer fetten Überschrift wie „Klettern (St) Bewegung ungelernt+(6)“ bzw.
// „Einhandschwerter“. Als Überschrift zählt nur, was einem bekannten Fertigkeitsnamen entspricht.
import { absaetze } from "./textzeilen.mjs";
import { unlesbar } from "./arkanum.mjs";

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
  const abschliessen = () => {
    if (!akt) return;
    akt.absaetze = absaetze(akt.text, abstand).filter((a) => a.length > 1);
    delete akt.text;
    if (akt.absaetze.length) ergebnis.push(akt);
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
        akt = { name, titel: z.text, seite: z.seite, text: [] };
        continue;
      }
    }
    if (!akt || z.groesse < 9 || z.groesse > 10.5 || unlesbar(z.text)) continue;
    akt.text.push(z);
  }
  abschliessen();
  return ergebnis;
}
