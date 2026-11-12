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

// Zwischenstufen nach Name: Die erste passende Regel gewinnt, fehlt ihr Bild, greift die nächste Stufe.
const GEGENSTAND_ART = [
  [/trunk|trank/i, "trank"], [/salbe/i, "salbe"], [/pulver/i, "pulver"], [/perle/i, "perle"], [/kraut|pilz/i, "kraut"],
  [/drache/i, "drache"], [/kiesel/i, "kiesel"], [/weihwasser|öl\b/i, "fluessigkeit"], [/erste hilfe/i, "erste-hilfe"],
  [/fleisch|schinken|geflügel|wild\b|wurst/i, "fleisch"], [/fisch(?!er)/i, "fisch"], [/bier/i, "bier"], [/wein/i, "wein"],
  [/tee\b/i, "tee"], [/milch/i, "milch"], [/käse|butter/i, "kaese"], [/gemüse/i, "gemuese"], [/früchte/i, "obst"],
  [/salz|pfeffer/i, "gewuerz"], [/handschuh/i, "handschuhe"], [/sandalen|schuhe|stiefel/i, "schuhe"], [/mütze|hut\b/i, "kopfbedeckung"],
  [/unterkleid/i, "unterkleid"], [/robe|kutte|kleid\b/i, "gewand"], [/^gürtel|waffengürtel/i, "guertel"],
  [/armschiene/i, "armschienen"], [/beinschiene/i, "beinschienen"], [/sattel|zaumzeug/i, "sattel"],
  [/feuerstein|feuertopf|holzkohle/i, "feuer"],
  [/köcher|gurt für|schultergurt/i, "koecher"], [/beutel|tasche/i, "beutel"], [/flasche|amphore|krug|becher|gefäß|schlauch|topf/i, "flasche"],
  [/sack|rucksack/i, "sack"], [/fass|eimer/i, "fass"], [/kerze/i, "kerze"], [/laterne/i, "laterne"],
  [/boot|segler/i, "boot"],
  [/einbrecher/i, "dietrich"], [/spiegel/i, "spiegel"], [/pergament|papyrus/i, "pergament"],
];
// Zauber: Wirkung aus dem Namen (Zauberlieder behalten ihr Liedsymbol)
const ZAUBER_THEMA = [
  [/heilen|heilung|linder|lebensrettung|erholung|lebensstärkung|kraftspende|genesung|zusammenwachs|handauflegen/i, "heilung"],
  [/schutz|schirm|schild|wehr\b|panzer|hülle|rindenhaut|eisenhaut|rüstung|beschütz/i, "schutz"],
  [/bann|austreib|reinig|entgift/i, "bann"], [/schlaf|betäub/i, "schlaf"],
  [/fluch|tod|finster|verderb|wahnsinn|grauen|angst|furcht/i, "fluch"],
  [/dämon|geist|beschwör|rufen|helfer|elementar/i, "beschwoerung"],
  [/tier|bär|schwarm|zähm|fährte|wittern|bienen/i, "tier"], [/waffe|klinge|schwert|keule/i, "waffe"],
  [/feuer|flamm|brand|glut|hitze/i, "feuer"], [/(^|\s)eis|frost|kälte|schnee/i, "eis"], [/blitz|donner/i, "blitz"],
  [/licht|leucht|dunkelheit|strahlend/i, "licht"], [/^erkennen|vision|eingebung|linienlesen|liniensicht/i, "erkennen"], [/flug|fliegen|sprung|laufen|wandeln|schweb|wind/i, "bewegung"],
];
// Waffen: Bauart innerhalb der Nahkampf-Fertigkeit (Wurfwaffen behalten ihr Fertigkeitssymbol)
const WAFFEN_ART = [
  [/^Zweihand/, /axt|beil/i, "grossaxt"], [/schlagwaffen/, /axt|beil/i, "axt"], [/schlagwaffen/, /hammer/i, "hammer"],
  [/schlagwaffen/, /keule|kolben/i, "keule"], [/schlagwaffen|Spieß/, /hellebarde|glefe/i, "stangenwaffe"],
  [/Stichwaffen/, /kurzschwert|ochsenzunge/i, "kurzschwert"],
];
const regel = (liste, text) => liste.find(([re]) => re.test(text))?.[1];

/** Symbol eines Kompendium-Eintrags oder null. Stufen von speziell nach allgemein: Art nach Name, Unterkategorie, Kategorie. */
export function eintragBild(kat, e) {
  const s = e.system ?? {};
  const name = String(e.name ?? "");
  const thema = s.gruppe !== "Zauberlieder" ? regel(ZAUBER_THEMA, name) : null;
  const waffenArt = WAFFEN_ART.find(([f, n]) => f.test(s.fertigkeit ?? "") && n.test(name))?.[2];
  const art = regel(GEGENSTAND_ART, name);
  const kandidaten = {
    waffen: [waffenArt && `waffen/${waffenArt}`, `waffen/${slug(s.fertigkeit)}`],
    waffenfertigkeiten: [`waffen/${slug(name)}`],
    zauber: [thema && `zauber/thema-${thema}`, thema && `zauber/${thema}`, `zauber/${slug(s.gruppe)}`],
    gegenstaende: [art && `ausruestung/${art}`, s.unterkategorie && `ausruestung/${slug(s.unterkategorie)}`, `ausruestung/${slug(s.kategorie)}`],
    ruestungen: [`ruestungen/${slug(s.kuerzel)}`],
    rassen: [`rassen/${slug(name)}`],
    typen: [`typen/${slug(name)}`],
    fertigkeiten: [`fertigkeiten/${slug(name)}`, `fertigkeiten/${slug(s.leiteigenschaft)}`, "fertigkeiten/fertigkeit"],
  }[kat] ?? [];
  for (const k of kandidaten) { const p = k && bildPfad(k); if (p) return p; }
  return null;
}
