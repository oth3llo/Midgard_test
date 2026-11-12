// Eigene Grafiken des Systems (Ordner bilder/). Welche Dateien vorhanden sind, schreibt foundry/bauen.py
// nach module/bilder-liste.mjs; fehlt eine Datei, greift der Ersatz (Farbverlauf, Foundry-Symbol).
// Jede Datei wird als CSS-Variable am body bereitgestellt: „themen/glut.webp“ → --bild-themen-glut.
import LISTE from "./bilder-liste.mjs";

const PFAD = "systems/midgard5-cmt/bilder/";
const ohneEndung = (f) => f.replace(/\.(webp|png|jpe?g|svg|avif)$/i, "");
let NACH_NAME = new Map(LISTE.map((f) => [ohneEndung(f), f]));

/** Liste der vorhandenen Dateien ersetzen (für Tests und spätere Nachladung). */
export function bilderSetzen(liste) { NACH_NAME = new Map(liste.map((f) => [ohneEndung(f), f])); }

/** Name für Dateien und Variablen: „Waffenloser Kampf“ → „waffenloser-kampf“, „Rüstungszubehör“ → „ruestungszubehoer“. */
export const slug = (s) => String(s ?? "").toLocaleLowerCase("de").replace(/ä/g, "ae").replace(/ö/g, "oe").replace(/ü/g, "ue").replace(/ß/g, "ss")
  .replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");

/** Pfad einer Grafik (z. B. „reiter/kampf“) oder null, wenn sie nicht geliefert wurde. */
export const bildPfad = (name) => (NACH_NAME.has(name) ? PFAD + NACH_NAME.get(name) : null);
export const bilderVorhanden = () => [...NACH_NAME.keys()];

/** Alle Grafiken als CSS-Variablen am body setzen. */
export function bilderAnwenden() {
  for (const [name, datei] of NACH_NAME) {
    document.body.style.setProperty(`--bild-${name.replace(/\//g, "-")}`, `url("${new URL(PFAD + datei, document.baseURI).href}")`);
  }
}

/** Symbol eines Kompendium-Eintrags nach Kategorie (Waffe nach Waffenfertigkeit, Zauber nach Gruppe …) oder null. */
export function eintragBild(kat, e) {
  const s = e.system ?? {};
  const kandidaten = {
    waffen: [`waffen/${slug(s.fertigkeit)}`],
    waffenfertigkeiten: [`waffen/${slug(e.name)}`],
    zauber: [`zauber/${slug(s.gruppe)}`],
    gegenstaende: [`ausruestung/${slug(s.unterkategorie)}`, `ausruestung/${slug(s.kategorie)}`],
    ruestungen: [`ruestungen/${slug(s.kuerzel)}`],
    rassen: [`rassen/${slug(e.name)}`],
    typen: [`typen/${slug(e.name)}`],
    fertigkeiten: [`fertigkeiten/${slug(e.name)}`, `fertigkeiten/${slug(s.leiteigenschaft)}`, "fertigkeiten/fertigkeit"],
  }[kat] ?? [];
  for (const k of kandidaten) { const p = bildPfad(k); if (p) return p; }
  return null;
}
