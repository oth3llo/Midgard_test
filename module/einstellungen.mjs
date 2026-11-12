// Systemeinstellungen (Spieleinstellungen › Midgard 5): Erschaffung, Darstellung, Regelwerke.
// Dazu der Startdialog (Kodex-Hinweis und Farbschema) und die Leseansicht der Regel-Journale.
import { SYSTEM_ID } from "./kategorien.mjs";
import { THEMEN, THEMA_WAHL, themaAnwenden } from "./themen.mjs";
import { pdfImportStarten } from "./pdf-import.mjs";
import { REGEL_PACK, allesVerlinken } from "./verlinken.mjs";
import { nachricht, esc } from "./wuerfe.mjs";
import { bilderAnwenden, bildPfad } from "./bilder.mjs";

const { ApplicationV2 } = foundry.applications.api;

const el = (tag, attrs = {}, ...kinder) => {
  const e = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (v === undefined || v === null || v === false) continue;
    if (k === "text") e.textContent = v;
    else if (k.startsWith("on")) e.addEventListener(k.slice(2), v);
    else e.setAttribute(k, v === true ? "" : v);
  }
  for (const k of kinder.flat(Infinity)) if (k !== null && k !== undefined && k !== false) e.append(k);
  return e;
};
const icon = (n) => el("i", { class: `fa-solid ${n}`, "aria-hidden": "true" });
const get = (k) => game.settings.get(SYSTEM_ID, k);

/** Unterstützte Regelwerke für den Import (Erkennung am Inhalt, s. pdf/erkennung.mjs). */
export const REGELWERKE = [
  { buch: "Der Kodex", inhalt: "Fertigkeiten, Waffen, Rüstungen, Typen, Rassen, Ausrüstung und die Regelkapitel", pflicht: true },
  { buch: "Das Arkanum", inhalt: "Zauber, Zaubermittel und die Regeln der Magie", pflicht: false },
];

export function einstellungenRegistrieren() {
  // Regelwerke: Menü mit Status und Import-Knopf (nur Spielleiter)
  game.settings.registerMenu(SYSTEM_ID, "regelwerke", {
    name: "Regelwerke", label: "Regelwerke importieren", icon: "fa-solid fa-file-import", type: RegelwerkeFenster, restricted: true,
    hint: "Eigene Regelwerk-PDFs (Der Kodex, Das Arkanum) einlesen und den Stand der Kompendien prüfen.",
  });
  // --- Charaktererschaffung (Welt)
  game.settings.register(SYSTEM_ID, "erschaffungWuerfel", {
    name: "Würfeln bei der Erschaffung",
    hint: "„Digital im Bogen“ zeigt Würfeln-Knöpfe im Erschaffungswerkzeug, „am Tisch“ nur Eingabefelder für echte Würfe. „Spieler entscheidet“ lässt die Wahl im Werkzeug.",
    scope: "world", config: true, type: String, default: "frei",
    choices: { frei: "Spieler entscheidet", digital: "Digital im Bogen würfeln", tisch: "Am Tisch würfeln, Ergebnisse eintragen" },
  });
  game.settings.register(SYSTEM_ID, "erschaffungMethode", {
    name: "Methode für die Basiseigenschaften",
    hint: "Kodex S. 21. Methode I: je Eigenschaft 2×W%, der bessere zählt. Methode II: 9×W%, die drei schlechtesten streichen, Rest frei verteilen.",
    scope: "world", config: true, type: String, default: "wahl",
    choices: { wahl: "Spieler wählt", I: "Immer Methode I", II: "Immer Methode II" },
  });
  game.settings.register(SYSTEM_ID, "erschaffungChat", {
    name: "Digitale Erschaffungswürfe im Chat zeigen",
    hint: "Jeder Würfeln-Knopf im Erschaffungswerkzeug schreibt das Ergebnis in den Chat, damit alle mitlesen können.",
    scope: "world", config: true, type: Boolean, default: true,
  });
  game.settings.register(SYSTEM_ID, "erschaffungFreigabe", {
    name: "Freigabe neuer Charaktere",
    hint: "„Durch die Spielleitung“: Spieler können erst lernen und steigern, wenn die Spielleitung den Charakter im Werkzeug freigegeben hat; danach ist die Erschaffung für sie abgeschlossen.",
    scope: "world", config: true, type: String, default: "frei",
    choices: { frei: "Keine Freigabe nötig", spielleiter: "Durch die Spielleitung" },
  });
  // --- Hausregeln (Welt)
  game.settings.register(SYSTEM_ID, "hausregelMindestsumme", {
    name: "Hausregel: Mindestsumme der Basiseigenschaften",
    hint: "Liegt die Summe von St, Gs, Gw, Ko, In und Zt darunter, bietet das Werkzeug an, neu zu würfeln. 0 schaltet die Hausregel ab.",
    scope: "world", config: true, type: Number, default: 420, range: { min: 0, max: 600, step: 10 },
  });
  game.settings.register(SYSTEM_ID, "neuanfaenge", {
    name: "Erlaubte Neuanfänge beim Würfeln",
    hint: "Kodex S. 21: drei- bis viermal darf ganz von vorn begonnen werden. 0 = ohne Grenze.",
    scope: "world", config: true, type: Number, default: 0, range: { min: 0, max: 10, step: 1 },
  });
  game.settings.register(SYSTEM_ID, "glueckspunkte", {
    name: "Glückspunkte (GP)",
    hint: "Zeigt im Kopf des Bogens ein Feld für Glückspunkte nach Kodex S. 167.",
    scope: "world", config: true, type: Boolean, default: false,
  });
  // --- Würfe und Kampf (Welt)
  game.settings.register(SYSTEM_ID, "kritModus", {
    name: "Kritische Ereignisse",
    hint: "Bei kritischen Fehlern, Erfolgen bei der Abwehr und kritischem Schaden: nur Hinweis mit Würfelknopf, W%-Wurf mit Fundstelle, oder Wurf mit dem Ergebnis aus der importierten Tabelle des Kodex.",
    scope: "world", config: true, type: String, default: "wurf",
    choices: { hinweis: "Nur Hinweis mit Würfelknopf", wurf: "W% automatisch würfeln", tabelle: "W% würfeln und Ergebnis aus der Tabelle" },
  });
  game.settings.register(SYSTEM_ID, "verdecktModus", {
    name: "Verdeckte Würfe",
    hint: "Kodex S. 52: Manche Würfe macht die Spielleitung verdeckt. „Blind“: der Spieler sieht das Ergebnis nicht. „Nur Spielleitung“: Würfelnder und Spielleitung sehen es.",
    scope: "world", config: true, type: String, default: "aus",
    choices: { aus: "Aus", blindroll: "Blind (nur Spielleitung sieht das Ergebnis)", gmroll: "Nur Spielleitung und Würfelnder" },
  });
  game.settings.register(SYSTEM_ID, "verdeckteFertigkeiten", {
    name: "Verdeckt gewürfelte Fertigkeiten",
    hint: "Durch Komma getrennt, z. B. Wahrnehmung, Spurensuche, Fallen entdecken.",
    scope: "world", config: true, type: String, default: "Wahrnehmung, Spurensuche, Fallen entdecken",
  });
  game.settings.register(SYSTEM_ID, "zustandAutomatik", {
    name: "Erschöpfung und Last",
    hint: "„Anwenden“: bei 0 AP und schwerer Last werden Abzüge und halbe Bewegungsweite verrechnet. „Nur anzeigen“: der Bogen zeigt den Zustand, gewürfelt wird ohne Abzug.",
    scope: "world", config: true, type: String, default: "anwenden",
    choices: { anwenden: "Automatisch anwenden", anzeigen: "Nur anzeigen" },
  });
  game.settings.register(SYSTEM_ID, "epModus", {
    name: "Vergabe der Erfahrungspunkte",
    hint: "Kodex S. 148 f. Voreinstellung im Fenster „EP verteilen“: gleiche Menge für alle oder einzeln je Figur.",
    scope: "world", config: true, type: String, default: "individuell",
    choices: { pauschal: "Pauschal (gleiche EP für alle)", individuell: "Individuell (je Figur)" },
  });
  game.settings.register(SYSTEM_ID, "wuerfelSchrift", {
    name: "Würfelschreibweise im Chat",
    hint: "Midgard schreibt W6 und W%, Foundry d6 und d100.",
    scope: "world", config: true, type: String, default: "W",
    choices: { W: "W6, W20, W%", d: "d6, d20, d100" },
  });
  game.settings.registerMenu(SYSTEM_ID, "epVerteilen", {
    name: "Erfahrungspunkte", label: "EP verteilen", icon: "fa-solid fa-star", type: EpFenster, restricted: true,
    hint: "EP an die Spielerfiguren verteilen; vom Werkzeug verwaltete Charaktere erhalten die Buchung auch in ihrem Protokoll.",
  });
  // --- Darstellung (je Benutzer)
  game.settings.register(SYSTEM_ID, "thema", {
    name: "Farbschema",
    hint: "Drei helle und drei dunkle Schemata für Bögen, Kompendium-Browser und Regeltexte. „Automatisch“ folgt dem hellen oder dunklen Foundry-Design.",
    scope: "client", config: true, type: String, default: "auto", choices: THEMA_WAHL,
    onChange: (id) => themaAnwenden(id),
  });
  game.settings.register(SYSTEM_ID, "schriftgroesse", {
    name: "Schriftgröße",
    hint: "Vergrößert Bögen, Kompendium-Browser, Regeltexte und Chatkarten des Systems, z. B. für Beamer oder kleine Bildschirme.",
    scope: "client", config: true, type: String, default: "1",
    choices: { "0.9": "Klein (90 %)", 1: "Normal (100 %)", "1.15": "Groß (115 %)", "1.3": "Sehr groß (130 %)" },
    onChange: (v) => skalaAnwenden(v),
  });
  game.settings.register(SYSTEM_ID, "chatKompakt", {
    name: "Kompakte Chatkarten",
    hint: "Zeigt Würfe in einer knappen Form ohne Zusammensetzung und Nebenhinweise.",
    scope: "client", config: true, type: Boolean, default: false,
  });
  game.settings.register(SYSTEM_ID, "chatTeileOffen", {
    name: "Zusammensetzung der Würfe aufgeklappt",
    hint: "Die Liste aus Fertigkeitswert, Boni und Zuschlägen ist in Chatkarten sonst eingeklappt.",
    scope: "client", config: true, type: Boolean, default: false,
  });
  game.settings.register(SYSTEM_ID, "regelLayout", {
    name: "Regeltexte im Midgard-Layout",
    hint: "Regel-Journale mit Lesespalte, Fundstellenmarke, W%-Tabellen mit Würfelknopf und Merkkästen. Aus: Foundrys Standardansicht.",
    scope: "client", config: true, type: Boolean, default: true,
  });
  game.settings.register(SYSTEM_ID, "beispieleOffen", {
    name: "Beispiele in Regeltexten aufgeklappt",
    hint: "Beispielkästen sind sonst eingeklappt, damit der Regeltext kurz bleibt.",
    scope: "client", config: true, type: Boolean, default: false,
  });
  game.settings.register(SYSTEM_ID, "startDialog", {
    name: "Startfenster beim Laden der Welt",
    hint: "Hinweis auf den Kodex-Import und Wahl des Farbschemas. Lässt sich im Fenster selbst mit „Nicht mehr anzeigen“ abschalten.",
    scope: "client", config: true, type: Boolean, default: true,
  });
}

/** Beim Start: Farbschema anwenden, Startdialog öffnen. */
export function beimStart() {
  bilderAnwenden();
  themaAnwenden(get("thema"));
  skalaAnwenden(get("schriftgroesse"));
  if (get("startDialog")) StartDialog.oeffnen();
}

/** Status eines Regelwerks aus dem Importprotokoll. */
function status(buch) {
  const eintraege = (get("importProtokoll") ?? []).filter((e) => e.buch === buch);
  const letzter = eintraege.at(-1) ?? null;
  const importiert = buch === "Der Kodex" ? !!get("kodexImportiert") : !!letzter;
  return { importiert, letzter };
}
const datum = (iso) => { try { return new Date(iso).toLocaleDateString("de-DE", { day: "numeric", month: "long", year: "numeric" }); } catch { return iso; } };

/** Kachel je Farbschema mit Farbproben. */
function themaKacheln(aktiv, waehlen) {
  // Vorschau: eigenes Bild (bilder/themen/<id>) oder ein Farbverlauf aus den Farben des Schemas
  const kachel = (id, name, beschreibung, farben) => el("button", {
    type: "button", class: `midgard-thema-kachel${aktiv === id ? " aktiv" : ""}`, "data-thema": id, "aria-pressed": String(aktiv === id), title: beschreibung,
    onclick: () => waehlen(id),
  },
  el("span", { class: `probe${bildPfad(`themen/${id}`) ? " mit-bild" : ""}`,
    style: farben ? `background: var(--bild-themen-${id}, linear-gradient(180deg, ${farben["akzent-hell"]} 0%, ${farben.flaeche} 42%, ${farben["rahmen-hell"]} 72%, ${farben.rahmen} 100%)); border-color: ${farben.gold}` : `background: var(--bild-themen-auto, none)` },
    farben ? ["gold", "akzent", "a1", "a4", "a7"].map((k) => el("span", { style: `background:${farben[k]}` })) : [
      // „Automatisch“: halb Pergament, halb Mitternacht (Bild oder Grundfarbe)
      el("span", { class: "halb hell", style: `background-image: var(--bild-themen-pergament, none); background-color: ${THEMEN.pergament.farben.grund}` }),
      el("span", { class: "halb dunkel", style: `background-image: var(--bild-themen-mitternacht, none); background-color: ${THEMEN.mitternacht.farben.grund}` }),
    ]),
  el("span", { class: "name" }, name, el("small", { text: farben ? (farben === THEMEN.pergament.farben ? "Standard hell" : farben === THEMEN.mitternacht.farben ? "Standard dunkel" : (THEMEN[id]?.hell ? "hell" : "dunkel"))
    : "Pergament oder Mitternacht, je nach hellem oder dunklem Foundry-Design" })));
  const gruppe = (titel, hell) => el("div", { class: "midgard-thema-gruppe" }, el("h4", { text: titel }),
    el("div", { class: "midgard-thema-reihe" }, Object.entries(THEMEN).filter(([, t]) => t.hell === hell).map(([id, t]) => kachel(id, t.name, t.beschreibung, t.farben))));
  return el("div", { class: "midgard-thema-wahl" },
    el("div", { class: "midgard-thema-reihe" }, kachel("auto", "Automatisch", "folgt dem hellen oder dunklen Foundry-Design", null)),
    gruppe("Hell", true), gruppe("Dunkel", false));
}

/** Startdialog: Kodex-Hinweis, Farbschema, „Nicht mehr anzeigen“. */
export class StartDialog extends ApplicationV2 {
  static DEFAULT_OPTIONS = {
    id: "midgard-start",
    classes: ["midgard-start"],
    tag: "div",
    window: { title: "Willkommen bei Midgard 5", icon: "fa-solid fa-dragon" },
    position: { width: 600, height: "auto" },
  };

  static #instanz = null;
  static oeffnen() { return (this.#instanz ??= new StartDialog()).render({ force: true }); }

  async _renderHTML() {
    const kodex = status("Der Kodex"), arkanum = status("Das Arkanum");
    const neuZeichnen = () => this.render();
    const hinweis = kodex.importiert
      ? el("section", { class: "midgard-start-karte ok" }, icon("fa-circle-check"),
        el("div", {}, el("h3", { text: "Kodex importiert" }),
          el("p", { text: arkanum.importiert ? "Kodex und Arkanum sind eingelesen. Erschaffung, Lernen und Zauber stehen bereit." : "Erschaffung und Lernen stehen bereit. Für Zauber fehlt noch das Arkanum." })))
      : el("section", { class: "midgard-start-karte warnung" }, icon("fa-triangle-exclamation"),
        el("div", {}, el("h3", { text: "Kodex-Import notwendig" }),
          el("p", { text: "Kompendien, Charaktererschaffung und Lernen beruhen auf dem Kodex. Sie sind gesperrt, bis der Spielleiter seine eigene Kodex-PDF eingelesen hat. Die Texte bleiben in dieser Welt." }),
          game.user.isGM
            ? el("button", { type: "button", class: "midgard-start-knopf haupt", onclick: () => pdfImportStarten() }, icon("fa-file-import"), " Regelwerk-PDF importieren")
            : el("p", { class: "leise", text: "Das erledigt der Spielleiter." })));
    return el("div", { class: "midgard-start-wurzel" },
      el("div", { class: "midgard-start-banner" }, el("span", { text: "Midgard 5 für Foundry VTT" })),
      hinweis,
      el("section", { class: "midgard-start-themen" }, el("h3", { text: "Wähle dein Farbschema" }),
        el("p", { class: "leise", text: "Gilt nur für dich. Später änderbar unter Spieleinstellungen › Midgard 5." }),
        themaKacheln(get("thema"), async (id) => { await game.settings.set(SYSTEM_ID, "thema", id); neuZeichnen(); })),
      el("footer", { class: "midgard-start-fuss" },
        el("label", { class: "midgard-start-nie" },
          el("input", { type: "checkbox", name: "nichtMehr", checked: !get("startDialog"), onchange: (ev) => game.settings.set(SYSTEM_ID, "startDialog", !ev.target.checked) }),
          " Nicht mehr anzeigen"),
        el("button", { type: "button", class: "midgard-start-knopf", onclick: () => this.close() }, icon("fa-check"), " Los geht’s")));
  }

  _replaceHTML(inhalt, ziel) { ziel.replaceChildren(inhalt); }
}

/** Menü „Regelwerke importieren“: Status je Buch, Import-Knopf, letzte Importe. */
export class RegelwerkeFenster extends ApplicationV2 {
  static DEFAULT_OPTIONS = {
    id: "midgard-regelwerke",
    classes: ["midgard-regelwerke"],
    tag: "div",
    window: { title: "Midgard: Regelwerke", icon: "fa-solid fa-book" },
    position: { width: 560, height: "auto" },
  };

  constructor(...a) {
    super(...a);
    this.#hook = Hooks.on("midgardKompendienGeaendert", () => { if (this.rendered) this.render(); });
  }
  #hook = null;

  async close(o) { Hooks.off?.("midgardKompendienGeaendert", this.#hook); return super.close?.(o); }

  async _renderHTML() {
    const zeilen = REGELWERKE.map((r) => {
      const s = status(r.buch);
      return el("li", { class: `midgard-regelwerk-zeile ${s.importiert ? "ok" : r.pflicht ? "fehlt" : "offen"}` },
        icon(s.importiert ? "fa-circle-check" : r.pflicht ? "fa-circle-exclamation" : "fa-circle"),
        el("div", {}, el("strong", { text: r.buch }), r.pflicht ? el("span", { class: "marke", text: "notwendig" }) : null,
          el("p", { text: r.inhalt }),
          el("p", { class: "leise", text: s.importiert
            ? `Importiert${s.letzter ? ` am ${datum(s.letzter.zeit)} von ${s.letzter.benutzer}${s.letzter.gepruefteAusgabe ? " (geprüfte Ausgabe)" : " (ungeprüfte Ausgabe)"}` : ""}`
            : "Noch nicht importiert" })));
    });
    return el("div", { class: "midgard-regelwerke-wurzel" },
      el("p", { text: "Die Kompendien des Systems sind leer, bis du deine eigenen Regelwerk-PDFs einliest. Erkannt wird das Buch am Inhalt, nicht am Dateinamen. Mehrere Dateien auf einmal sind möglich." }),
      el("ul", { class: "midgard-regelwerk-liste" }, zeilen),
      el("div", { class: "midgard-regelwerke-knoepfe" },
        el("button", { type: "button", class: "midgard-start-knopf haupt", onclick: () => pdfImportStarten() }, icon("fa-file-import"), " PDF auswählen und importieren"),
        el("button", { type: "button", class: "midgard-start-knopf", onclick: () => game.midgard.browser() }, icon("fa-book-open"), " Kompendium-Browser")),
      el("p", { class: "leise", text: "Weitere Regelwerke (etwa Bestiarium oder Mysterium) werden noch nicht erkannt." }),
      el("section", { class: "midgard-wartung" }, el("h4", { text: "Wartung" }),
        el("div", { class: "midgard-regelwerke-knoepfe" },
          el("button", { type: "button", class: "midgard-start-knopf", "data-aktion": "verlinken", onclick: async () => { const n = await allesVerlinken(); ui.notifications.info(`Midgard: Verweise in ${n} Texten neu gesetzt.`); } },
            icon("fa-link"), " Verweise neu aufbauen"),
          el("button", { type: "button", class: "midgard-start-knopf", "data-aktion": "loeschen", onclick: () => regelJournaleLoeschen() }, icon("fa-trash"), " Regel-Journale löschen")),
        this.#protokoll()));
  }

  /** Letzte Importe mit Datum, Benutzer, Datei, Ausgabe und Ergebnis der Textprüfung. */
  #protokoll() {
    const liste = [...(get("importProtokoll") ?? [])].reverse();
    if (!liste.length) return el("p", { class: "leise", text: "Noch keine Importe protokolliert." });
    return el("details", { class: "midgard-protokoll" }, el("summary", { text: `Importprotokoll (${liste.length})` }),
      el("ul", {}, liste.slice(0, 20).map((e) => el("li", { text: `${datum(e.zeit)} · ${e.benutzer} · ${e.buch} · ${e.datei}${e.gepruefteAusgabe ? "" : " (ungeprüfte Ausgabe)"}${e.textpruefung ? ` · Textprüfung: ${e.textpruefung}` : ""}` }))));
  }

  _replaceHTML(inhalt, ziel) { ziel.replaceChildren(inhalt); }
}

/**
 * Regel-Journale (Kompendium „Midgard: Regeln“) in der Leseansicht: Klasse am Fenster, Beispiele
 * auf Wunsch aufgeklappt (auch für Seiten, die Foundry erst beim Blättern nachlädt).
 */
export function journalDarstellen(app, element) {
  const dok = app.document?.parent ?? app.document;
  const istRegel = dok?.pack === `world.${REGEL_PACK}` || dok?.compendium?.collection === `world.${REGEL_PACK}` || !!dok?.getFlag?.(SYSTEM_ID, "buch");
  const fenster = app.element ?? element;
  if (!istRegel || !fenster?.classList) return;
  fenster.classList.toggle("midgard-regelwerk", !!get("regelLayout"));
  if (!get("beispieleOffen")) return;
  const oeffnen = (wurzel) => wurzel.querySelectorAll?.("details.midgard-beispiel:not([data-midgard-offen])").forEach((d) => { d.open = true; d.dataset.midgardOffen = ""; });
  oeffnen(fenster);
  if (!fenster.midgardBeobachter && typeof MutationObserver !== "undefined") {
    fenster.midgardBeobachter = new MutationObserver(() => oeffnen(fenster));
    fenster.midgardBeobachter.observe(fenster, { childList: true, subtree: true });
  }
}

/** Schriftgröße: Zoomfaktor für alle Fenster des Systems (CSS-Variable am body). */
export function skalaAnwenden(wert) {
  const z = Number(wert) || 1;
  document.body.style.setProperty("--midgard-zoom", String(z));
  document.body.dataset.midgardZoom = String(z);
}

/** Chatkarten je Benutzer: kompakt und/oder mit aufgeklappter Zusammensetzung. */
export function chatKarteAnpassen(_nachricht, html) {
  const wurzel = html instanceof HTMLElement ? html : html?.[0];
  const karte = wurzel?.querySelector?.(".midgard-karte");
  if (!karte) return;
  karte.classList.toggle("mk-kompakt", !!get("chatKompakt"));
  if (get("chatTeileOffen")) for (const d of karte.querySelectorAll("details.mk-teile")) d.open = true;
}

// ------------------------------------------------------------------ Erfahrungspunkte verteilen

/** Spielerfiguren (Abenteurer mit Spielerbesitz). */
export function spielerfiguren() {
  const alle = [...(game.actors ?? [])].filter((a) => a.type === "abenteurer");
  const mitSpieler = alle.filter((a) => a.hasPlayerOwner);
  return mitSpieler.length ? mitSpieler : alle;
}

/**
 * Bucht EP (und Erfahrungsschatz). Vom Werkzeug verwaltete Charaktere erhalten die Buchung auch
 * im Werkzeug-Zustand samt Protokoll, sonst überschriebe der nächste Abgleich sie.
 */
export async function epBuchen(actor, ep, anlass = "") {
  ep = Math.trunc(Number(ep) || 0);
  if (!ep) return false;
  const s = actor.system;
  const text = `${ep} EP${anlass ? ` – ${anlass}` : ""}`;
  const eintrag = { zeit: new Date().toISOString(), text };
  const daten = { "system.ep": (s.ep ?? 0) + ep, "system.es": (s.es ?? 0) + ep, "system.protokoll": [eintrag, ...(s.protokoll ?? [])] };
  if (s.zustand) {
    const z = JSON.parse(s.zustand);
    z.spiel ??= { es: 0, ep: 0, gold: 0, pp: {}, werte: {}, neu: [], protokoll: [], apPlus: 0, gradBestaetigt: 1 };
    const vorher = JSON.parse(JSON.stringify({ spiel: { ...z.spiel, protokoll: undefined }, eig: z.eig, pAwurf: z.pAwurf, Wkwurf: z.Wkwurf, Au: z.Au, festPA: z.festPA ?? null, festWk: z.festWk ?? null }));
    z.spiel.ep = (z.spiel.ep ?? 0) + ep;
    z.spiel.es = (z.spiel.es ?? 0) + ep;
    z.spiel.protokoll ??= [];
    z.spiel.protokoll.unshift({ ...eintrag, vorher });
    daten["system.zustand"] = JSON.stringify(z);
    daten["system.ep"] = z.spiel.ep;
    daten["system.es"] = z.spiel.es;
  }
  await actor.update(daten);
  return true;
}

/** Verteilung [[actor, ep], …] buchen und als Chatkarte melden. */
export async function epVerteilen(verteilung, anlass = "") {
  const gebucht = [];
  for (const [actor, ep] of verteilung) if (await epBuchen(actor, ep, anlass)) gebucht.push([actor, Math.trunc(Number(ep))]);
  if (!gebucht.length) return gebucht;
  await nachricht(null, `<div class="midgard-karte mk-ep"><header>Erfahrungspunkte${anlass ? ` · ${esc(anlass)}` : ""}</header>
    <ul class="mk-wuerfe">${gebucht.map(([a, ep]) => `<li><strong>${esc(a.name)}</strong> +${ep} EP</li>`).join("")}</ul></div>`, [], { ep: true });
  ui.notifications.info(`Midgard: EP an ${gebucht.length} Figur(en) verteilt.`);
  return gebucht;
}

/** Fenster „EP verteilen“ (Menü in den Einstellungen oder game.midgard.epVerteilen()). */
export class EpFenster extends ApplicationV2 {
  static DEFAULT_OPTIONS = {
    id: "midgard-ep", classes: ["midgard-regelwerke", "midgard-ep"], tag: "div",
    window: { title: "Midgard: Erfahrungspunkte verteilen", icon: "fa-solid fa-star" }, position: { width: 520, height: "auto" },
  };

  #modus = null;

  async _renderHTML() {
    const modus = (this.#modus ??= get("epModus"));
    const figuren = spielerfiguren();
    const umschalten = (m) => { this.#modus = m; this.render(); };
    const zeilen = figuren.map((a) => el("li", { class: "midgard-ep-zeile", "data-id": a.id },
      el("label", {}, el("input", { type: "checkbox", name: "mit", checked: true }), " ", el("strong", { text: a.name })),
      el("small", { class: "leise", text: `${a.system.ep ?? 0} EP, ES ${a.system.es ?? 0}` }),
      modus === "individuell" ? el("input", { type: "number", name: "ep", min: 0, step: 1, value: "", placeholder: "EP" }) : null));
    return el("form", { class: "midgard-regelwerke-wurzel midgard-ep-wurzel", onsubmit: (ev) => ev.preventDefault() },
      el("div", { class: "midgard-ep-modus", role: "radiogroup" },
        ["pauschal", "individuell"].map((m) => el("label", {}, el("input", { type: "radio", name: "modus", value: m, checked: modus === m, onchange: () => umschalten(m) }), m === "pauschal" ? " Pauschal" : " Individuell"))),
      el("p", { class: "leise", text: modus === "pauschal" ? "Alle angehakten Figuren erhalten dieselbe Menge (Kodex S. 148)." : "Je Figur eigene EP, etwa für Kampf, Zaubern und sinnvollen Einsatz von Fähigkeiten (Kodex S. 149 ff.)." }),
      modus === "pauschal" ? el("label", { class: "midgard-ep-alle" }, "EP für jede Figur ", el("input", { type: "number", name: "alle", min: 0, step: 1, value: "" })) : null,
      figuren.length ? el("ul", { class: "midgard-regelwerk-liste" }, zeilen) : el("p", { text: "Keine Spielerfiguren in dieser Welt." }),
      el("label", { class: "midgard-ep-anlass" }, "Anlass ", el("input", { type: "text", name: "anlass", placeholder: "z. B. Abenteuer „Die Mühle“" })),
      el("div", { class: "midgard-regelwerke-knoepfe" },
        el("button", { type: "button", class: "midgard-start-knopf haupt", onclick: () => this.#verteilen() }, el("i", { class: "fa-solid fa-star" }), " Verteilen")));
  }

  async #verteilen() {
    const f = this.element.querySelector("form");
    const alle = Number(f.querySelector('[name="alle"]')?.value || 0);
    const anlass = f.querySelector('[name="anlass"]')?.value.trim() ?? "";
    const verteilung = [...f.querySelectorAll(".midgard-ep-zeile")].filter((z) => z.querySelector('[name="mit"]').checked)
      .map((z) => [game.actors.get?.(z.dataset.id) ?? spielerfiguren().find((a) => a.id === z.dataset.id), this.#modus === "pauschal" ? alle : Number(z.querySelector('[name="ep"]')?.value || 0)])
      .filter(([a, ep]) => a && ep > 0);
    if (!verteilung.length) return ui.notifications.warn("Midgard: keine EP eingetragen.");
    await epVerteilen(verteilung, anlass);
    this.render();
  }

  _replaceHTML(inhalt, ziel) { ziel.replaceChildren(inhalt); }
}

// ------------------------------------------------------------------ Wartung des Regel-Kompendiums

/** Alle Regel-Journale und ihre Ordner löschen; Verweise in den übrigen Texten danach neu aufbauen. */
export async function regelJournaleLoeschen({ rueckfrage = true } = {}) {
  const pack = game.packs.get(`world.${REGEL_PACK}`);
  if (!pack) return 0;
  const D = foundry.applications?.api?.DialogV2;
  if (rueckfrage) {
    if (!D) return 0;
    const ok = await D.confirm({ window: { title: "Regel-Journale löschen" }, content: "<p>Alle importierten Regel-Journale werden gelöscht. Ein erneuter Import legt sie wieder an.</p>", rejectClose: false }).catch(() => false);
    if (!ok) return 0;
  }
  const gesperrt = pack.locked;
  if (gesperrt) await pack.configure({ locked: false });
  let n = 0;
  try {
    const ids = (await pack.getDocuments()).map((j) => j.id);
    n = ids.length;
    if (ids.length) await JournalEntry.deleteDocuments(ids, { pack: pack.collection });
    const ordner = [...(pack.folders ?? [])].map((f) => f.id);
    if (ordner.length) await Folder.deleteDocuments(ordner, { pack: pack.collection });
  } finally { if (gesperrt) await pack.configure({ locked: true }); }
  await allesVerlinken();
  Hooks.callAll("midgardKompendienGeaendert");
  ui.notifications.info(`Midgard: ${n} Regel-Journale gelöscht.`);
  return n;
}
