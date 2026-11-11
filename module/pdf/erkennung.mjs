// Erkennt, welches Regelwerk eine PDF enthält – nur am Inhalt, nie am Dateinamen – und ob es die
// Ausgabe ist, gegen die die Zerleger geprüft sind. Eine Prüfung der Rechtmäßigkeit ist damit nicht
// möglich (eine Kopie ist inhaltlich identisch); der Fingerabdruck dient der Qualität des Imports.

const norm = (s) => String(s).toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^a-z0-9]+/g, " ").trim();

/** Merkmale je Buch: Überschriften und feste Regelsätze, die in jeder Auflage vorkommen sollten. */
export const MERKMALE = {
  "Der Kodex": ["Das Buch der Gesetze", "Das Buch der Begabungen", "Das Buch des Ruhmes", "Allgemeine Fertigkeiten", "Die Kampfregeln",
    "Kritische Kampfereignisse", "Erfolgswurf: 1W20 + Fertigkeitswert", "Waffenfertigkeiten", "Lern- und Trainingslisten"],
  "Das Arkanum": ["Die Regeln der Magie", "Zauberduelle", "Zaubersprüche", "Wundertaten", "Dweomer", "Zauberlieder der Barden",
    "Das Thaumaturgium", "Der Zauberladen", "Der Konspekt der Zauberer"],
};
const MINDEST = { treffer: 6, seiten: 120 };

/**
 * @param {Array} zeilen  Ergebnis von textzeilen() über das ganze Buch
 * @param {number} seiten Seitenzahl der PDF
 * @returns {{buch: string|null, treffer: number, gesamt: number, fehlend: string[], bewertung: object}}
 */
export function buchErkennen(zeilen, seiten) {
  // Überschriften (auch über zwei Zeilen umbrochen) und der gesamte Text, vereinheitlicht
  const ueber = [];
  for (let i = 0; i < zeilen.length; i++) {
    const z = zeilen[i];
    if (z.groesse < 14) continue;
    ueber.push(norm(z.text));
    const n = zeilen[i + 1];
    if (n && n.groesse === z.groesse && n.seite === z.seite) ueber.push(norm(`${z.text} ${n.text}`));
  }
  const ueberSatz = new Set(ueber);
  const volltext = ` ${norm(zeilen.map((z) => z.text).join(" "))} `;
  const bewertung = {};
  for (const [buch, merkmale] of Object.entries(MERKMALE)) {
    const gefunden = merkmale.filter((m) => ueberSatz.has(norm(m)) || volltext.includes(` ${norm(m)} `));
    bewertung[buch] = { treffer: gefunden.length, fehlend: merkmale.filter((m) => !gefunden.includes(m)) };
  }
  const [beste, zweite] = Object.entries(bewertung).sort((a, b) => b[1].treffer - a[1].treffer);
  const eindeutig = beste[1].treffer >= MINDEST.treffer && beste[1].treffer > (zweite?.[1].treffer ?? 0) + 2 && seiten >= MINDEST.seiten;
  return { buch: eindeutig ? beste[0] : null, treffer: beste[1].treffer, gesamt: MERKMALE[beste[0]].length, fehlend: beste[1].fehlend, bewertung };
}

/** Fingerabdruck der Ausgabe: Seitenzahl und Folge der großen Überschriften (unabhängig von Datei und Metadaten). */
export function ausgabeFingerabdruck(zeilen, seiten) {
  const folge = zeilen.filter((z) => z.groesse >= 24 && z.text.length > 2).map((z) => norm(z.text)).join("|");
  let h = 0x811c9dc5;
  for (const c of `${seiten}|${folge}`) h = Math.imul(h ^ c.charCodeAt(0), 0x01000193) >>> 0;
  return `${seiten}-${h.toString(16).padStart(8, "0")}`;
}

/** Ausgaben, gegen die die Zerleger geprüft sind (Fingerabdrücke der PDFs in material/regeln). */
export const GEPRUEFTE_AUSGABEN = {
  "Der Kodex": ["212-89c8495c"],
  "Das Arkanum": ["212-78bd874b"],
};
