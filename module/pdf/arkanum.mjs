// Zerleger für „Das Arkanum“ (M5): findet die Zauberbeschreibungen der Kapitel Zaubersprüche,
// Wundertaten, Dweomer und Zauberlieder. Ein Zauber beginnt mit seinem Namen, gefolgt von
// „Wortzauber/Gestenzauber/Gedankenzauber/Zauberlied der Stufe N“, optional der Materialzeile,
// der Zeile „Gruppe M Agens l Reagens“ und dem Datenblock bis „Ursprung:“. Danach folgt der Text.
import { absaetze } from "./textzeilen.mjs";

const KOPF = /^(Wort|Gesten|Gedanken)zauber (der )+Stufe (\d+)$|^(Zauberlied) der Stufe (\d+)$/;
const KAPITEL = { "Zaubersprüche": null, "Wundertaten": "Wundertaten", "Dweomer": "Dweomer", "Zauberlieder der Barden": "Zauberlieder" };
const DATEN = /^(AP-Verbrauch|Zauberdauer|Reichweite|Wirkungsziel|Wirkungsbereich|Wirkungsdauer|Ursprung):/;

/** Erkennt das Arkanum an seinen Kapitelüberschriften. */
export function istArkanum(zeilen) {
  const titel = new Set(zeilen.filter((z) => z.groesse >= 24).map((z) => z.text));
  return titel.has("Zaubersprüche") && titel.has("Wundertaten") && titel.has("Dweomer");
}

/**
 * @param {Array} zeilen  Ergebnis von textzeilen() über das ganze Buch
 * @returns {Array<{name, kategorie, gruppe, art, stufe, absaetze, seite}>}
 */
export function zauberAusArkanum(zeilen) {
  const ergebnis = [];
  let kapitel, imKapitel = false, akt = null, phase = null;
  // Grundtext: häufigste Schriftgröße, Zeilenabstand innerhalb von Absätzen
  const fliess = zeilen.filter((z) => z.groesse === 10);
  const abstand = median(fliess.map((z) => z.abstand).filter((a) => a > 5 && a < 20)) || 12;
  const abschliessen = () => {
    if (!akt) return;
    akt.absaetze = absaetze(akt.text, abstand).filter((a) => a.length > 1);
    delete akt.text;
    delete akt.datenX;
    ergebnis.push(akt);
    akt = null;
  };
  for (let i = 0; i < zeilen.length; i++) {
    const z = zeilen[i];
    if (z.groesse >= 30 && z.text.length <= 2) continue;          // Initiale des Alphabets
    if (z.groesse >= 24) {             // Kapitelüberschrift
      abschliessen();
      if (z.text in KAPITEL) { kapitel = KAPITEL[z.text]; imKapitel = true; } else if (imKapitel && !Object.keys(KAPITEL).some((k) => k.startsWith(z.text))) imKapitel = false;
      continue;
    }
    if (!imKapitel) continue;
    if (/^\d{1,3}$/.test(z.text) && z.groesse >= 14) continue;   // Seitenzahl
    const kopf = zeilen[i + 1]?.text.match(KOPF);
    if (kopf && z.groesse >= 10.5 && z.text.length < 60) {
      abschliessen();
      akt = { name: z.text, kategorie: kapitel, gruppe: null, art: kopf[1] ? { Wort: "Wort", Gesten: "Geste", Gedanken: "Gedanke" }[kopf[1]] : "Zauberlied", stufe: Number(kopf[3] ?? kopf[5]), seite: z.seite, text: [] };
      phase = "kopf";
      i++;
      continue;
    }
    if (!akt) continue;
    if (phase === "kopf") {
      const g = z.text.match(/^(\S+) M \S+ l \S+/);
      if (g) { akt.gruppe = g[1]; continue; }
      if (DATEN.test(z.text)) { akt.datenX = z.x; if (z.text.startsWith("Ursprung:")) phase = "text"; continue; }
      if (z.groesse === 10 && !akt.gruppe) continue;              // Materialzeile
      // umbrochener Datenwert: eingerückt auf die Wertspalte (Zauberlieder haben keine Ursprung-Zeile)
      if (akt.datenX !== undefined && z.x > akt.datenX + 20 && z.spalte === zeilen[i - 1]?.spalte) continue;
      phase = "text";
    }
    if (z.groesse < 9 || z.groesse > 10.5) continue;              // Kästen, Tabellenköpfe, Überschriften
    if (unlesbar(z.text)) continue;                               // Werteblöcke in Sonderschrift
    akt.text.push(z);
  }
  abschliessen();
  return ergebnis;
}

/** Zeilen in Schriften ohne Unicode-Zuordnung (z. B. Kapitälchen in Werteblöcken) ergeben Zeichensalat. */
export function unlesbar(text) {
  const fremd = [...text].filter((c) => /[^\u0000-\u024F\u2000-\u206F\u20AC\u2190-\u21FF\u2212\u00A0-\u00FF]/.test(c)).length;
  return fremd > 0 && fremd / text.length > 0.1;
}

function median(werte) {
  if (!werte.length) return null;
  const s = [...werte].sort((a, b) => a - b);
  return s[Math.floor(s.length / 2)];
}
