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
    akt.absaetze = absaetze(akt.text, abstand);
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

/**
 * Beschreibungen der Zaubermittel und alchimistischen Metalle (Kapitel „Die Kunst der Alchimie“,
 * bis „Zauberwerk“). Eine Beschreibung beginnt mit einer Zeile, die genau einem bekannten Namen
 * entspricht und mit Abstand über ihr steht (Überschrift).
 * @param {string[]} namen  bekannte Namen aus dem Datensatz
 */
export function zaubermittelAusArkanum(zeilen, namen) {
  const norm = (s) => String(s).toLowerCase().replace(/[^a-zäöüß0-9*]/g, "");
  const bekannt = new Map(namen.map((n) => [norm(n), n]));
  const fliess = zeilen.filter((z) => z.groesse === 10);
  const abstand = median(fliess.map((z) => z.abstand).filter((a) => a > 5 && a < 20)) || 12;
  const ergebnis = [];
  let aktiv = false, akt = null;
  const abschliessen = () => {
    if (!akt) return;
    akt.absaetze = absaetze(akt.text, abstand);
    delete akt.text;
    if (akt.absaetze.length) ergebnis.push(akt);
    akt = null;
  };
  for (let i = 0; i < zeilen.length; i++) {
    const z = zeilen[i];
    if (z.groesse >= 30 && z.text.length <= 2) continue;
    if (z.groesse >= 24) {
      if (z.text === "Die Kunst") { aktiv = true; continue; }
      if (aktiv && z.text === "Zauberwerk") { abschliessen(); break; }
      continue;
    }
    if (!aktiv || (/^\d{1,3}$/.test(z.text) && z.groesse >= 14)) continue;
    const name = bekannt.get(norm(z.text));
    if (name && (z.abstand === null || z.abstand > abstand * 1.3)) {
      abschliessen();
      akt = { name, seite: z.seite, text: [] };
      continue;
    }
    if (!akt || z.groesse < 9 || z.groesse > 10.5 || unlesbar(z.text)) continue;
    akt.text.push(z);
  }
  abschliessen();
  return ergebnis;
}

// ------------------------------------------------------------------ Zauber aus Quellenbüchern
// Dunkle Mächte, Das Mysterium, Ars Armorum: Die Spieldaten stehen vollständig im Buch, ein Datensatz
// fehlt. Ein Eintrag beginnt mit seinem Namen (11 pt), gefolgt von der Kopfzeile („Gestenzauber der
// Stufe 10 (VZ 15)“, „Schutzrune der Stufe 5“, „Kampfvers der Stufe 3“, „Wetterzauber … - Grad 20“) oder
// direkt von der Zeile „Gruppe M Agens l Reagens“ (Runenstäbe, Zaubersiegel: Werte wie der gleichnamige
// Spruch). Danach Material, Datenblock und Text bis zum nächsten Eintrag oder zur nächsten Überschrift.
const GRUPPE_ZEILE = /^(\S+) M (\S+?) ?l ?(\S+)$/;
const KOPF_STUFE = /^(.+?) der (?:der )?Stufe (\d+)(?:\s*\(VZ (\d+)\))?$/;
const KOPF_GRAD = /^(.+?)\s+[-–]\s+Grad (\d+)$/;
const DATEN_BUCH = /^(AP-Verbrauch|Zauberdauer|Reichweite|Wirkungsziel|Wirkungsbereich|Wirkungsdauer|Ursprung|Zielgruppe|Auftragen|Wirkzeit):\s*(.*)$/;
const RUNE = /^Die \S+rune\b/;
const VARIANTE = new Set(["Runenstab", "Zaubersiegel", "Großes Siegel", "Schutzrune"]);
const ART_KURZ = { Wortzauber: "Wort", Gestenzauber: "Geste", Gedankenzauber: "Gedanke", Zauberlied: "Zauberlied" };
// Kapitel → Art eines Eintrags ohne Kopfzeile, und Kategorie (Gruppe im Kompendium) besonderer Kapitel
const KAPITEL_ART = { "Runenstäbe": "Runenstab", "Zaubersiegel": "Zaubersiegel", "Große Siegel": "Großes Siegel", "Schwarze Ritualzauber": "Ritual" };
const KAPITEL_GRUPPE = { "Chaoswunder": "Wundertaten", "Wundertaten": "Wundertaten", "Wilder Dweomer": "Dweomer", "Dweomer": "Dweomer" };

/**
 * @param {Array} zeilen  Ergebnis von textzeilen() über das ganze Buch
 * @param {object} o  bekannt: Namen vorhandener Zauber (Arkanum); gleichnamige erhalten die Art als Zusatz
 * @returns {Array<{name, gruppe, prozess, art, stufe, vz, agens, reagens, material, daten, kapitel, seite, absaetze}>}
 *   mit .verbraucht (Set der gelesenen Zeilen, damit die Regeltexte sie nicht doppelt führen)
 */
export function zauberAusBuch(zeilen, { bekannt = new Set(), buchKurz = "" } = {}) {
  const abstand = median(zeilen.filter((z) => z.groesse === 10).map((z) => z.abstand).filter((a) => a > 5 && a < 20)) || 12;
  const istSeitenzahl = (z) => /^(\d{1,3})\1?$/.test(z.text) && z.groesse >= 14;
  // Einträge finden: Gruppenzeile (≥ 13 pt) mit dem Namen bis zu drei Zeilen davor
  const start = [];
  for (let i = 0; i < zeilen.length; i++) {
    const z = zeilen[i];
    if (z.groesse < 13 || z.groesse > 15 || !GRUPPE_ZEILE.test(z.text.trim())) continue;
    for (let k = i - 1; k >= Math.max(0, i - 4); k--) {
      const n = zeilen[k];
      // Runennamen mit Runenzeichen erscheinen in der Größe der Symbolschrift („Die Festrune ᛉ“, 24 pt)
      if ((n.groesse >= 10.5 && n.groesse < 13 || RUNE.test(n.text)) && n.text.length < 70 && !DATEN_BUCH.test(n.text)) { start.push({ name: k, gruppe: i }); break; }
    }
  }
  const verbraucht = new Set();
  const ergebnis = [];
  let kapitel = null, kapitelIdx = 0;
  for (let e = 0; e < start.length; e++) {
    const { name: ni, gruppe: gi } = start[e];
    // Kapitel: letzte Überschrift ≥ 14 pt vor dem Eintrag (ohne Gruppenzeilen und Seitenzahlen)
    for (; kapitelIdx < ni; kapitelIdx++) {
      const z = zeilen[kapitelIdx];
      // Kapitel und Abschnitte (14-18 pt, ≥ 24 pt); Runenzeichen (20 pt), Tabellentitel und Runennamen zählen nicht
      if ((z.groesse >= 14 && z.groesse <= 18.5 || z.groesse >= 23.5) && !istSeitenzahl(z) && !GRUPPE_ZEILE.test(z.text.trim()) && !RUNE.test(z.text)
        && !/^Tabelle\b/.test(z.text) && z.text.length > 2 && z.text.length < 60) kapitel = z.text.trim();
    }
    const kopfZeilen = zeilen.slice(ni + 1, gi);
    let art = null, stufe = null, vz = null, material = "", ritual = null;
    for (const z of kopfZeilen) {
      const k = z.text.match(KOPF_STUFE), g = z.text.match(KOPF_GRAD);
      if (k) { art = k[1]; stufe = Number(k[2]); vz = k[3] ? Number(k[3]) : null; } else if (g) { ritual = z.text; stufe = null; } else material = material ? `${material} ${z.text}` : z.text;
    }
    const [, prozess, agens, reagens] = zeilen[gi].text.trim().match(GRUPPE_ZEILE);
    const daten = {};
    let j = gi + 1, letzterSchl = null;
    for (; j < zeilen.length; j++) {
      const z = zeilen[j];
      if (istSeitenzahl(z)) continue;
      const d = z.text.match(DATEN_BUCH);
      if (d && z.groesse >= 9 && z.groesse <= 10.5) { daten[d[1]] = d[2].trim(); letzterSchl = d[1]; verbraucht.add(z); continue; }
      // Materialzeile nach der Gruppe (Runen: „6 Apfelbaumholzstücke (1 KS)“) oder umbrochener Datenwert
      if (!Object.keys(daten).length && z.groesse === 10 && j === gi + 1 && /\(\d+ [GSK]S\)$/.test(z.text)) { material = z.text; verbraucht.add(z); continue; }
      if (letzterSchl && z.abstand !== null && z.abstand < abstand * 1.3 && /^[a-zäöü(\d]/.test(z.text) && z.text.length < 40 && !/[.!?]$/.test(daten[letzterSchl])) {
        daten[letzterSchl] = `${daten[letzterSchl]} ${z.text}`; verbraucht.add(z); continue;
      }
      break;
    }
    // Text bis zum nächsten Eintrag oder zur nächsten Überschrift (≥ 12 pt, ohne Seitenzahlen)
    const ende = start[e + 1]?.name ?? zeilen.length;
    const text = [];
    for (; j < ende; j++) {
      const z = zeilen[j];
      if (istSeitenzahl(z)) continue;
      if (z.groesse >= 12) break;
      if (z.groesse < 8.5 || z.groesse > 10.5 || unlesbar(z.text)) continue;
      text.push(z);
      verbraucht.add(z);
    }
    for (let k = ni; k <= gi; k++) verbraucht.add(zeilen[k]);
    // Runennamen tragen das Runenzeichen in Symbolschrift („Die Bannrune D“): abtrennen
    let titel = zeilen[ni].text.trim().replace(/^(Die \S+rune)\s+\S{1,3}$/, "$1");
    const artVoll = art ?? (ritual ? "Ritual" : KAPITEL_ART[kapitel] ?? kapitel ?? "Zauber");
    const kurz = ART_KURZ[artVoll];
    const gleichnamig = bekannt.has(titel);
    // gleichnamig mit einem Zauber des Arkanums: Art (Runenstab, Siegel …) bzw. Buch als Zusatz
    // Runenstäbe, Siegel und Schutzrunen sind Formen bekannter Sprüche: Art immer als Zusatz
    if (gleichnamig || VARIANTE.has(artVoll)) titel = `${titel} (${kurz ? buchKurz || artVoll : artVoll})`;
    const bloecke = absaetze(text, abstand);
    // Runenstäbe und Siegel ohne eigene Angaben: Werte des gleichnamigen Spruchs
    if (!daten["AP-Verbrauch"] && !bloecke.length) bloecke.push(`${artVoll} mit der Wirkung des Zaubers ${gleichnamig ? `${zeilen[ni].text.trim()} (Das Arkanum)` : zeilen[ni].text.trim()}. Herstellung, Auslösen und Abweichungen der Spieldaten stehen in der Einleitung des Abschnitts „${kapitel}“.`);
    if (ritual) bloecke.unshift({ merk: [["Ritual", ritual]], titel: "Ritualzauber" });
    ergebnis.push({
      name: titel, prozess, agens, reagens, art: kurz ?? artVoll, stufe, vz, material, ritual, daten, kapitel,
      gruppe: KAPITEL_GRUPPE[kapitel] ?? prozess, seite: zeilen[ni].seite, absaetze: bloecke,
    });
  }
  // gleiche Namen im Buch (z. B. Runenstab und Siegel „Frostball“): Art bzw. Seite anhängen
  const zaehl = {};
  for (const z of ergebnis) zaehl[z.name] = (zaehl[z.name] || 0) + 1;
  const standard = new Set(Object.values(ART_KURZ));
  for (const z of ergebnis) if (zaehl[z.name] > 1 && !/\)$/.test(z.name)) z.name = `${z.name} (${standard.has(z.art) ? z.kapitel ?? z.art : z.art})`;
  const zweit = {};
  for (const z of ergebnis) zweit[z.name] = (zweit[z.name] || 0) + 1;
  for (const z of ergebnis) if (zweit[z.name] > 1) z.name = `${z.name.replace(/\)$/, "")}, S. ${z.seite})`.replace(/^([^(]*), S\./, "$1 (S.");
  ergebnis.verbraucht = verbraucht;
  return ergebnis;
}
