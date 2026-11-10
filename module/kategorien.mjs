// Beschreibung der Kompendium-Kategorien: Name des Welt-Kompendiums, Spalten und Filter im Browser.
export const SYSTEM_ID = "midgard5-cmt";

const LERNGRUPPE = (w) => w || "";
const ja = (w) => (w ? "ja" : "");

/**
 * spalten: [Feld, Überschrift, Formatierer?]  (Feld relativ zu system)
 * filter:  [Feld, Bezeichnung, Sortierung?]   Auswahlwerte entstehen aus den vorhandenen Einträgen
 */
export const KATEGORIEN = {
  fertigkeiten: {
    label: "Fertigkeiten", typ: "fertigkeit",
    spalten: [["leiteigenschaft", "Leiteig."], ["lerngruppe", "Gruppe", LERNGRUPPE], ["startwert", "Start"], ["lernLE", "LE"], ["ungelernt", "ungel."]],
    filter: [["leiteigenschaft", "Leiteigenschaft"], ["lerngruppe", "Lerngruppe"]],
  },
  waffenfertigkeiten: {
    label: "Waffenfertigkeiten", typ: "waffenfertigkeit",
    spalten: [["schwierigkeit", "Schwierigkeit"], ["lerngruppe", "Gruppe"], ["startwert", "Start"], ["lernLE", "LE"], ["verteidigung", "Abwehr", ja]],
    filter: [["schwierigkeit", "Schwierigkeit"], ["verteidigung", "Verteidigungswaffe"]],
  },
  waffen: {
    label: "Waffen", typ: "waffe",
    spalten: [["fertigkeit", "Fertigkeit"], ["schaden", "Schaden"], ["mindest", "Mindestwerte", (m) => Object.entries(m || {}).filter(([, v]) => v).map(([k, v]) => `${k} ${v}`).join(", ")], ["preis", "GS"], ["gewicht", "kg"]],
    filter: [["fertigkeit", "Fertigkeit"], ["art", "Art"]],
  },
  ruestungen: {
    label: "Rüstungen", typ: "ruestung",
    spalten: [["kuerzel", "Kürzel"], ["rs", "RS"], ["abwehrbonusVerlust", "AbB-Verlust"], ["preis", "GS"], ["gewicht", "kg"]],
    filter: [],
  },
  zauber: {
    label: "Zauber", typ: "zauber",
    spalten: [["gruppe", "Gruppe"], ["stufe", "Stufe"], ["art", "Art"], ["ursprung", "Ursprung"], ["ap", "AP"], ["reichweite", "Reichweite"], ["wirkungsdauer", "Dauer"]],
    filter: [["gruppe", "Gruppe"], ["stufe", "Stufe", (a, b) => a - b], ["art", "Art"], ["ursprung", "Ursprung"], ["agens", "Agens"]],
  },
  rassen: {
    label: "Rassen", typ: "rasse",
    spalten: [["typen", "Typen", (t) => (t || []).join(", ")], ["min", "Mindestwerte", (m) => Object.entries(m || {}).map(([k, v]) => `${k} ${v}`).join(", ")]],
    filter: [],
  },
  gegenstaende: {
    label: "Ausrüstung", typ: "gegenstand",
    spalten: [["kategorie", "Kategorie"], ["unterkategorie", "Art"], ["preisText", "Preis"], ["gewicht", "kg"]],
    filter: [["kategorie", "Kategorie"], ["unterkategorie", "Art"]],
  },
  typen: {
    label: "Abenteurertypen", typ: "typ",
    spalten: [["kuerzel", "Kürzel"], ["artName", "Art"], ["wichtig", "Wichtig"], ["apBonus", "AP"], ["zauberGruppen", "Zaubergruppen", (z) => (z || []).join(", ")]],
    filter: [["artName", "Art"]],
  },
};

/** Name des Welt-Kompendiums einer Kategorie, z. B. "midgard-zauber" (Sammlung "world.midgard-zauber"). */
export const packName = (kat) => `midgard-${kat}`;
export const packId = (kat) => `world.${packName(kat)}`;

/** Wert eines verschachtelten Feldes, z. B. feld(eintrag.system, "mindest.St"). */
export function feld(obj, pfad) {
  return pfad.split(".").reduce((o, k) => (o == null ? undefined : o[k]), obj);
}

/** Anzeigetext eines Wertes. */
export function anzeige(wert) {
  if (wert === null || wert === undefined || wert === "") return "";
  if (typeof wert === "boolean") return wert ? "ja" : "nein";
  if (Array.isArray(wert)) return wert.map(anzeige).join(", ");
  if (typeof wert === "object") return Object.entries(wert).map(([k, v]) => `${k}: ${anzeige(v)}`).join(", ");
  return String(wert);
}

/** Deutsche Bezeichnungen der Datenfelder für Detailansicht und Gegenstandsbogen. */
export const FELDNAMEN = {
  leiteigenschaft: "Leiteigenschaft", lerngruppe: "Lerngruppe", startwert: "Startwert", lernLE: "Lernkosten (LE)",
  wert: "Erfolgswert", ungelernt: "Ungelernt", mitAngabe: "Mit Angabe", angabe: "Angabe", startlisten: "Startlisten",
  elfenNie: "Elfen nie", elfenNichtBeiStart: "Elfen nicht bei Start", schwierigkeit: "Schwierigkeit",
  verteidigung: "Verteidigungswaffe", nurZauberer: "Nur Zauberer", spezialwaffeMoeglich: "Spezialwaffe möglich",
  kleineVerboten: "Für kleine Rassen verboten", kleineZweihaendig: "Für kleine Rassen zweihändig",
  grundname: "Grundname", fertigkeit: "Fertigkeit", schaden: "Schaden", mindest: "Mindestwerte", art: "Art",
  preis: "Preis (GS)", gewicht: "Gewicht (kg)", ausgeruestet: "Ausgerüstet", kuerzel: "Kürzel", rs: "Rüstungsschutz",
  abwehrbonusVerlust: "Verlust Abwehrbonus", getragen: "Getragen", anzahl: "Anzahl", gruppe: "Gruppe", stufe: "Stufe",
  ursprung: "Ursprung", ap: "AP-Verbrauch", zauberdauer: "Zauberdauer", reichweite: "Reichweite",
  wirkungsziel: "Wirkungsziel", wirkungsbereich: "Wirkungsbereich", wirkungsdauer: "Wirkungsdauer", agens: "Agens",
  reagens: "Reagens", material: "Material", min: "Mindestwerte", max: "Höchstwerte", schwach: "Schwäche",
  aussehen: "Aussehen", typen: "Erlaubte Typen", faehigkeiten: "Fähigkeiten", artName: "Art", wichtig: "Wichtige Eigenschaften",
  apBonus: "AP-Bonus", standMod: "Stand-Modifikator", freiWaffen: "Freie Waffen", le: "Lerneinheiten",
  waffenLE: "Waffen-LE", zauberLE: "Zauber-LE", zauberGruppen: "Zaubergruppen", typisch: "Typische Fertigkeiten",
  typischerZauber: "Typischer Zauber", ausruestung: "Ausrüstung", zauberKosten: "Zauberkosten",
  kurzwirkung: "Kurzwirkung", beschreibung: "Beschreibung", quelle: "Quelle", preisText: "Preis", kategorie: "Kategorie", unterkategorie: "Art",
};

/** Anzeigetext für verschachtelte Regeldaten (Startlisten, typische Fertigkeiten, Fähigkeiten). */
export function detailText(schluessel, wert) {
  if (schluessel === "startlisten") return (wert || []).map((s) => `${s.gruppe} ${s.stufe} (${s.le} LE): +${s.wert}`).join("; ");
  if (schluessel === "faehigkeiten") return (wert || []).map((x) => `${x.name}${x.wert ? " +" + x.wert : ""}`).join(", ");
  if (schluessel === "typisch") return (wert || []).map((alt) => alt.map((x) => `${x.name}${x.wert ? " +" + x.wert : ""}`).join(" oder ")).join("; ");
  return anzeige(wert);
}
