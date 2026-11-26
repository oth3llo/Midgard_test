// Interaktive Weltkarte: Pixelkarte mit klickbaren Beschriftungen (Länder, Meere, Gebirge, Städte).
// Ein Klick auf einen Namen öffnet ein kleines Fenster mit Art, Beschreibung und, je Charakter,
// Hintergrundwissen der Spielleitung.
//
// Sichtbarkeit: Die Spielleitung sieht alles. Spieler sehen nur, was einer ihrer Abenteurer kennt
// (Herkunft, aktueller Aufenthalt, besucht, bekannt) oder was als "allen bekannt" markiert ist.
// So lässt sich eine Reise nachspielen: neue Orte erscheinen erst, wenn die Spielleitung sie freigibt.
//
// Daten: Orte (Lage, Name, Beschreibung) in der Welteinstellung "weltkarteOrte"; ohne Änderungen
// gilt der Ausgangsstand aus weltkarte-orte.mjs. Das Wissen je Charakter liegt am Akteur
// (flags.midgard5-cmt.weltkarte = { ortId: { status, notiz } }).
import { standardOrte, kennung, KARTE_BREITE as B, KARTE_HOEHE as H, TYPEN, standardArt, STAND, UMBENANNT, bildKategorie } from "./weltkarte-orte.mjs";
import { bildPfad } from "./bilder.mjs";
import TEXTE_VERSCHLUESSELT from "./weltkarte-texte.mjs";
import { schluesselAusPdf, entschluesseln } from "./weltkarte-schluessel.mjs";

const SYSTEM_ID = "midgard5-cmt";
const BILD = `systems/${SYSTEM_ID}/bilder/karte/weltkarte.webp`;
const { ApplicationV2 } = foundry.applications.api;

export const STATUS = { "": "unbekannt", geruecht: "Gerücht", name: "nur Name", bekannt: "bekannt", besucht: "besucht", herkunft: "Herkunft", aktuell: "aktueller Aufenthalt" };
/**
 * Wissensstufe je Status: 1 Gerücht (Name verschleiert, keine Beschreibung, Bild verschwommen), 2 nur Name (Name und Lage,
 * keine Beschreibung, kein Bild), 3 bekannt und mehr (Beschreibung, Quelle, Bild). Die Notiz der Spielleitung gilt immer.
 */
export const WAHRHEIT = { w: "wahr", h: "halbwahr", f: "falsch" };
export const STUFE = { geruecht: 1, name: 2, bekannt: 3, besucht: 3, herkunft: 3, aktuell: 3 };

/** Bild eines Ortes: eigenes (karte/orte/<id>) vor dem seiner Kategorie (karte/kategorie/<kategorie>). */
export function ortsbild(o) {
  const kat = bildKategorie(o);
  return { pfad: bildPfad(`karte/orte/${o.id}`) ?? (kat ? bildPfad(`karte/kategorie/${kat}`) : null), kategorie: kat };
}

const el = (tag, attrs = {}, ...kinder) => {
  const e = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (v === undefined || v === null || v === false) continue;
    if (k === "text") e.textContent = v;
    else if (k === "style" && typeof v === "object") Object.assign(e.style, v);
    else if (k.startsWith("on")) e.addEventListener(k.slice(2), v);
    else e.setAttribute(k, v === true ? "" : v);
  }
  for (const k of kinder.flat(Infinity)) if (k !== null && k !== undefined && k !== false) e.append(k);
  return e;
};

export function einstellungenRegistrieren() {
  game.settings.register(SYSTEM_ID, "weltkarteSeite", { scope: "client", config: false, type: Boolean, default: true });
  // ausgeblendete Ebenen je Rechner, z. B. { fluss: true }
  game.settings.register(SYSTEM_ID, "weltkarteEbenen", { scope: "client", config: false, type: Object, default: {} });
  // freigeschaltete Ortsbeschreibungen (nach dem Import von „Die Welt“): { texte: { ortId: Text } }
  game.settings.register(SYSTEM_ID, "weltkarteTexte", { scope: "world", config: false, type: Object, default: {}, onChange: () => Weltkarte.neuZeichnen() });
  game.settings.register(SYSTEM_ID, "weltkarteOrte", {
    scope: "world", config: false, type: Object, default: {},
    onChange: () => Weltkarte.neuZeichnen({ einstellung: true }),
  });
}

/**
 * Aktuelle Orte der Welt (Einstellung oder Ausgangsstand).
 * Stammt die Einstellung aus einem älteren Datenstand, gilt die neue mitgelieferte Liste. Ab Stand 2 (gleiche Kennungen
 * und Namen) werden alle Änderungen der Spielleitung übernommen, neue Felder kommen aus dem Ausgangsstand; aus Stand 1
 * nur eigene Beschreibungen und „allen bekannt“ (dort haben sich Schreibweisen und Lage grundlegend geändert).
 * Selbst angelegte Namen bleiben immer erhalten.
 */
export function orteLaden() {
  return texteEinsetzen(orteRoh());
}

/** Freigeschaltete Beschreibungen einsetzen, wo die Spielleitung keinen eigenen Text geschrieben hat. */
function texteEinsetzen(orte) {
  const texte = game.settings.get(SYSTEM_ID, "weltkarteTexte")?.texte ?? {};
  for (const o of orte) if (!o.text && texte[o.id]) o.text = texte[o.id];
  return orte;
}

/** Sind die Ortsbeschreibungen in dieser Welt freigeschaltet? */
export const texteFreigeschaltet = () => Object.keys(game.settings.get(SYSTEM_ID, "weltkarteTexte")?.texte ?? {}).length > 0;

/**
 * Ortsbeschreibungen mit dem eigenen PDF von „Die Welt“ freischalten (aufgerufen vom PDF-Import).
 * @param doc pdf.js-Dokument
 * @returns {{ok: boolean, anzahl?: number, grund?: string}}
 */
export async function weltkarteFreischalten(doc) {
  if (!TEXTE_VERSCHLUESSELT) return { ok: false, grund: "Dieses System enthält keine verschlüsselten Ortsbeschreibungen." };
  let texte;
  try {
    texte = await entschluesseln(await schluesselAusPdf(doc), TEXTE_VERSCHLUESSELT);
  } catch {
    return { ok: false, grund: "Diese Ausgabe von „Die Welt“ passt nicht zum Schlüssel der Ortsbeschreibungen (andere Auflage oder abweichende PDF)." };
  }
  await game.settings.set(SYSTEM_ID, "weltkarteTexte", { texte });
  Weltkarte.neuZeichnen();
  return { ok: true, anzahl: Object.keys(texte).length };
}

function orteRoh() {
  const s = game.settings.get(SYSTEM_ID, "weltkarteOrte");
  if (!Array.isArray(s?.orte)) return standardOrte();
  if (s.stand === STAND) return foundry.utils.deepClone(s.orte);
  const neu = standardOrte();
  const nachId = new Map(neu.map((o) => [o.id, o]));
  for (const alt of s.orte) {
    const ziel = nachId.get(UMBENANNT[alt.id] ?? alt.id);
    if (ziel && (s.stand ?? 1) >= 2) {
      for (const [k, v] of Object.entries(alt)) if (v !== undefined && v !== null) ziel[k] = foundry.utils.deepClone(v);
    } else if (ziel) {
      if (alt.text) { ziel.text = alt.text; ziel.quelle = ""; }
      if (alt.allen) ziel.allen = true;
    } else if (String(alt.id).startsWith("neu")) neu.push(foundry.utils.deepClone(alt));
  }
  return neu;
}

/** Wissen eines Abenteurers: { ortId: { status, notiz } }; Einträge zu umbenannten Kennungen gelten weiter. */
export const wissen = (actor) => {
  const w = actor?.getFlag?.(SYSTEM_ID, "weltkarte") ?? {};
  if (!Object.keys(w).some((k) => k in UMBENANNT)) return w;
  const aus = {};
  for (const [k, e] of Object.entries(w)) { const z = UMBENANNT[k] ?? k; if (!aus[z] || (e?.status && !aus[z].status)) aus[z] = e; }
  return aus;
};

// ---------------------------------------------------------------- Rang: was bei welcher Zoomstufe erscheint
// 1 = immer (Meere, Länder), 2 = Fernsicht (große Landschaften, Hauptstädte, Großstädte), 3 = mittlere Stufe,
// 4 = nah (kleine Städte, Flüsse). Die Spielleitung kann den Rang je Ort im Bearbeitungsmodus festlegen.
export const RAENGE = { 1: "1: immer", 2: "2: Fernsicht", 3: "3: mittlere Stufe", 4: "4: nah" };
/** Kleinster Maßstab (Bildschirmpixel je Kartenpixel), ab dem ein Rang erscheint. */
const RANG_AB = { 1: 0, 2: 0, 3: 0.75, 4: 1.15 };
/** Ab diesem Maßstab treten die ergänzten Ländernamen zurück, damit sie keine Städte verdecken. */
const LAENDER_BIS = 1.6;
/** Rangfilter erst ab so vielen sichtbaren Namen; spärliche Spielerkarten zeigen alles und lösen nur Überlappungen auf. */
const FILTER_AB = 60;
const KARTENSCHRIFTEN = ['700 12px "Almendra"', '600 12px "Cinzel"', 'italic 500 12px "Cormorant Garamond"', '400 12px "IM Fell English"'];
/** Maßstab, bei dem die Grundgrößen aus foundry.css unverändert gelten (etwa die eingepasste Gesamtansicht). */
const SCHRIFT_BEZUG = 0.6;
const GROSSE_MEERE = /^(Meer der|Graues Meer|Drachenmeer|Regenbogensee|Sednasee|Waelingsee|Wyrdsee|Schattenmeer)/;

/** Einwohnerzahl aus der Beschreibung („etwa 37.000 Einwohner“, „1,5 Millionen“), sonst 0. */
export function einwohner(text) {
  const t = String(text ?? "");
  const mio = t.match(/(\d+(?:,\d+)?)\s*Millionen/);
  if (mio) return Math.round(parseFloat(mio[1].replace(",", ".")) * 1e6);
  const m = t.match(/(\d{1,3}(?:\.\d{3})+|\d+)\s*Einwohner/);
  return m ? Number(m[1].replace(/\./g, "")) : 0;
}

export function rang(o) {
  if (o.rang >= 1 && o.rang <= 4) return o.rang;
  const art = o.art ?? "";
  switch (o.typ) {
    case "meer": return GROSSE_MEERE.test(o.name) ? 1 : 3;
    case "region": return /Küstenstaat|Sultanat|Kalifat|Städtebund/.test(art) ? 2 : 1;  // Teilstaaten nach dem Gesamtland
    case "insel": return art === "Inselgruppe" ? 2 : 3;
    case "landschaft": return /Gebirge|Wüste|Zauberwald|Hochland|Bergland/.test(art) ? 2 : 3;
    case "fluss": return /Strom|Lebensader|längste/.test(o.text ?? "") ? 3 : 4;
    case "ort": {
      if (/^Hauptstadt|Hauptstadt (Alba|Arans|KanThaiPans|Moravods|Valians|Nahuatlans|Minangpahits|Kairawans|und)|Sitz des (Hochkönigs|Großfürsten|Großkhans|Gottkönigs)|Residenz des Jadekaisers/.test(o.text ?? "") || art.startsWith("Hauptstadt")) return 2;
      const n = einwohner(o.text);
      return n >= 100000 ? 2 : n >= 40000 ? 3 : 4;
    }
    default: return 3;
  }
}
/** Ebenen zum Ein- und Ausblenden (Typen der Orte). */
export const EBENEN = [["region", "Länder"], ["meer", "Meere"], ["insel", "Inseln"], ["landschaft", "Gebirge und Landschaften"], ["fluss", "Flüsse"], ["ort", "Städte"]];
const TYP_VORRANG = { region: 0, meer: 1, landschaft: 2, insel: 3, ort: 4, fluss: 5, zusatz: 6 };

const abenteurer = () => [...game.actors].filter((a) => a.type === "abenteurer")
  .sort((a, b) => (b.hasPlayerOwner - a.hasPlayerOwner) || a.name.localeCompare(b.name, "de"));

/** Status eines Ortes für einen Abenteurer setzen; "aktuell" gibt es je Charakter nur einmal. */
export async function statusSetzen(actor, ortId, aenderung) {
  const w = foundry.utils.deepClone(wissen(actor)); // alte Kennungen wandern dabei auf die neuen
  const alt = w[ortId] ?? { status: "", notiz: "" };
  const neu = { status: alt.status ?? "", notiz: alt.notiz ?? "", ...aenderung };
  if (neu.status === "aktuell") for (const [id, e] of Object.entries(w)) if (id !== ortId && e?.status === "aktuell") w[id] = { ...e, status: "besucht" };
  w[ortId] = neu;
  await actor.setFlag(SYSTEM_ID, "weltkarte", w);
}

export class Weltkarte extends ApplicationV2 {
  static DEFAULT_OPTIONS = {
    id: "midgard-weltkarte",
    classes: ["midgard-weltkarte"],
    tag: "div",
    window: { title: "Midgard: Weltkarte", icon: "fa-solid fa-map", resizable: true },
    position: { width: 1100, height: 780 },
  };

  static #instanz = null;
  static oeffnen() { return (this.#instanz ??= new Weltkarte()).render({ force: true }); }
  static get instanz() { return this.#instanz; }

  /** Nach Änderungen von anderen neu zeichnen; eigene Speichervorgänge zeichnen selbst. */
  static neuZeichnen({ einstellung = false } = {}) {
    const k = this.#instanz;
    if (!k?.rendered) return;
    if (einstellung && Date.now() - k.#gespeichert < 2000) return;
    k.render();
  }

  #orte = [];
  #sicht = null;        // { s, tx, ty }: Maßstab und Verschiebung der Kartenfläche
  #ansicht = "";        // Spielleitung: "" = alles, sonst Akteur-ID (Ansicht wie dieser Charakter)
  #bearbeiten = false;  // Spielleitung: Beschriftungen verschieben, anlegen, umbenennen
  #neu = false;         // Werkzeug "neuer Ort": nächster Klick legt an
  #offen = null;        // ID des gewählten Ortes (Detailansicht in der Seitenleiste)
  #filter = "";         // Filtertext der Ortsliste
  #aufgeklappt = new Set(["eigene"]); // geöffnete Gruppen der Ortsliste
  #seite = null;
  #erstesMal = true;    // beim ersten Öffnen zum aktuellen Aufenthalt fahren
  #gespeichert = 0;
  #eingepasst = true;   // ganze Karte sichtbar: bei Größenänderung des Fensters neu einpassen
  #beobachter = null;
  #fenster = null;
  #flaeche = null;
  #layoutS = null;      // Maßstab, für den die Namen zuletzt angeordnet wurden
  #layoutPlan = 0;      // requestAnimationFrame-Kennung

  get #sl() { return !!game.user.isGM; }

  /** Charaktere, deren Wissen gerade zählt. */
  #figuren() {
    if (this.#sl) return this.#ansicht ? abenteurer().filter((a) => a.id === this.#ansicht) : [];
    return abenteurer().filter((a) => a.isOwner);
  }

  #sichtbar(ort) { return this.#stufe(ort) > 0; }

  /** Höchste Wissensstufe der zählenden Charaktere zu einem Ort (Spielleitung ohne Ansicht: alles). */
  #stufe(ort) {
    if (this.#sl && !this.#ansicht) return 3;
    let st = ort.allen ? 3 : 0;
    for (const a of this.#figuren()) st = Math.max(st, STUFE[wissen(a)[ort.id]?.status] ?? 0);
    return st;
  }

  async close(options) {
    this.#beobachter?.disconnect();
    this.#erstesMal = true;   // beim nächsten Öffnen wieder beim aktuellen Aufenthalt beginnen
    return super.close(options);
  }

  async _renderHTML() {
    this.#orte = orteLaden();
    const sl = this.#sl;
    const leiste = el("div", { class: "wk-leiste" });
    const seiteOffen = this.#seiteOffen;
    leiste.append(el("button", { type: "button", class: `wk-knopf wk-seite-knopf${seiteOffen ? " an" : ""}`, title: "Ortsliste und Details ein- oder ausblenden", onclick: () => this.#seiteUmschalten() },
      el("i", { class: "fa-solid fa-list" }), " Orte"));
    if (sl) {
      const wahl = el("select", { class: "wk-ansicht", title: "Karte so zeigen, wie ein Charakter sie kennt", onchange: (ev) => { this.#ansicht = ev.currentTarget.value; this.render(); } },
        el("option", { value: "", text: "Spielleitung: alles" }),
        abenteurer().map((a) => el("option", { value: a.id, selected: a.id === this.#ansicht, text: `Ansicht: ${a.name}` })));
      leiste.append(wahl,
        el("button", { type: "button", class: `wk-knopf wk-bearbeiten${this.#bearbeiten ? " an" : ""}`, title: "Beschriftungen verschieben, umbenennen, anlegen und löschen", onclick: () => { this.#bearbeiten = !this.#bearbeiten; this.#neu = false; this.render(); } },
          el("i", { class: "fa-solid fa-pen" }), this.#bearbeiten ? " Bearbeiten beenden" : " Bearbeiten"));
      if (this.#bearbeiten) {
        leiste.append(
          el("button", { type: "button", class: `wk-knopf wk-neu${this.#neu ? " an" : ""}`, title: "Danach auf die Karte klicken", onclick: (ev) => { this.#neu = !this.#neu; ev.currentTarget.classList.toggle("an", this.#neu); } }, el("i", { class: "fa-solid fa-plus" }), " Neuer Name"),
          el("button", { type: "button", class: "wk-knopf wk-zuruecksetzen", title: "Alle Beschriftungen auf den mitgelieferten Stand zurücksetzen", onclick: () => this.#zuruecksetzen() }, el("i", { class: "fa-solid fa-rotate-left" })));
      }
    }
    const aus = this.#ebenenAus;
    leiste.append(el("details", { class: "wk-ebenen" }, el("summary", { class: "wk-knopf", title: "Ebenen ein- und ausblenden" }, el("i", { class: "fa-solid fa-layer-group" }), " Ebenen", Object.keys(aus).some((k) => aus[k]) ? el("span", { class: "wk-ebenen-zahl", text: `(${Object.values(aus).filter(Boolean).length} aus)` }) : null),
      el("div", { class: "wk-ebenen-liste" }, EBENEN.map(([typ, titel]) => el("label", { class: "wk-haken" },
        el("input", { type: "checkbox", "data-ebene": typ, checked: !aus[typ], onchange: (ev) => this.#ebeneSchalten(typ, ev.currentTarget.checked) }), ` ${titel}`)))));
    if (!sl && !this.#figuren().length) leiste.append(el("span", { class: "wk-hinweis", text: "Kein eigener Abenteurer: nur allgemein bekannte Orte." }));

    this.#flaeche = el("div", { class: "wk-flaeche", style: { width: `${B}px`, height: `${H}px` } }, el("img", { class: "wk-bild", src: BILD, alt: "", draggable: "false" }), el("div", { class: "wk-ebene" }));
    // Kartensteuerung unten rechts: Zoom und ganze Karte (große Ziele, auch für Touch)
    const steuerung = el("div", { class: "wk-steuerung" },
      el("button", { type: "button", class: "wk-zoom-plus", title: "Hineinzoomen (+)", "aria-label": "Hineinzoomen", onclick: () => this.#zoomMitte(1.4) }, "+"),
      el("button", { type: "button", class: "wk-zoom-minus", title: "Herauszoomen (−)", "aria-label": "Herauszoomen", onclick: () => this.#zoomMitte(1 / 1.4) }, "−"),
      el("button", { type: "button", class: "wk-einpassen", title: "Ganze Karte zeigen (0)", "aria-label": "Ganze Karte zeigen", onclick: () => this.#einpassen() }, el("span", { class: "wk-einpassen-symbol" })));
    this.#fenster = el("div", { class: `wk-fenster${this.#bearbeiten ? " bearbeiten" : ""}`, tabindex: "0", "aria-label": "Weltkarte: Mausrad oder + und − zoomen, Pfeiltasten verschieben, Esc zurück zur Ortsliste" }, this.#flaeche, steuerung);
    this.#seite = el("aside", { class: "wk-seite" });
    this.#ebeneZeichnen();
    return el("div", { class: "wk-wurzel" }, leiste, el("div", { class: `wk-koerper${seiteOffen ? "" : " ohne-seite"}` }, this.#fenster, this.#seite));
  }

  _replaceHTML(result, content) { content.replaceChildren(result); }

  async _onRender() {
    this.#ereignisse();
    this.#beobachter?.disconnect();
    if (globalThis.ResizeObserver) {
      this.#beobachter = new ResizeObserver(() => { if (this.#eingepasst) this.#sicht = null; this.#ansichtAnwenden(); });
      this.#beobachter.observe(this.#fenster);
    }
    this.#ansichtAnwenden();
    this.#startAmAufenthalt();
    // Schriften laden erst, wenn ein Name sie braucht; die Anordnung misst aber Breiten. Daher alle Kartenschriften
    // vorab anfordern und nach dem Laden neu anordnen.
    if (document.fonts?.load) Promise.all(KARTENSCHRIFTEN.map((f) => document.fonts.load(f).catch(() => null)))
      .then(() => { if (this.rendered && this.#sicht) this.#anordnen(); });
    if (!(this.#offen && this.#orte.some((o) => o.id === this.#offen && this.#sichtbar(o)))) this.#offen = null;
    this.#seiteZeichnen();
  }

  // ---------------------------------------------------------------- Beschriftungen und Figuren
  #ebeneZeichnen() {
    const ebene = this.#flaeche.querySelector(".wk-ebene");
    ebene.replaceChildren();
    for (const o of this.#orte) {
      if (!this.#sichtbar(o)) continue;
      const zeilen = String(o.anzeige || o.name).split("|");
      const name = el("span", { class: "wk-name" }, zeilen.flatMap((z, i) => (i ? [el("br"), z] : [z])));
      const e = el("div", {
        class: `wk-ort typ-${o.typ}${this.#stufe(o) === 1 ? " stufe-geruecht" : ""}${o.ergaenzt ? " ergaenzt" : ""}${o.pruefen ? " pruefen" : ""}${o.id === this.#offen ? " aktiv" : ""}`,
        "data-id": o.id, title: [o.name, o.art || standardArt(o.typ)].filter(Boolean).join(" · ") + (o.pruefen && this.#sl ? " (Schreibweise unsicher)" : ""),
        style: { left: `${o.x}px`, top: `${o.y}px`, "--wk-g": String(o.groesse || 1) },
      }, o.typ === "ort" ? el("span", { class: "wk-punkt" }) : null, name);
      if (o.typ !== "ort") e.style.transform = `translate(-50%, -50%) rotate(${o.drehung || 0}deg)`;
      e.style.setProperty("--wk-g", String(o.groesse || 1));
      ebene.append(e);
    }
    // aktueller Aufenthalt: Porträt des Charakters über dem Ort; Herkunft: kleines Haus (Spielleitung ohne Ansicht: alle)
    const figuren = this.#sl && !this.#ansicht ? abenteurer() : this.#figuren();
    const zaehler = {}, herkunft = new Set();
    for (const a of figuren) {
      for (const [id, e] of Object.entries(wissen(a))) {
        const o = this.#orte.find((x) => x.id === id);
        if (!o) continue;
        if (e?.status === "aktuell") {
          const n = (zaehler[id] = (zaehler[id] ?? 0) + 1) - 1;
          ebene.append(el("div", { class: "wk-figur", title: `${a.name}: ${o.name}`, "data-akteur": a.id, "data-ort": o.id, style: { left: `${o.x}px`, top: `${o.y}px`, "--wk-n": String(n) } }));
          ebene.lastChild.style.backgroundImage = `url("${a.img}")`;
        } else if (e?.status === "herkunft" && !herkunft.has(id)) {
          herkunft.add(id);
          ebene.append(el("div", { class: "wk-herkunft", title: `Herkunft: ${figuren.filter((f) => wissen(f)[id]?.status === "herkunft").map((f) => f.name).join(", ")}`, "data-ort": o.id, style: { left: `${o.x}px`, top: `${o.y}px` } }));
        }
      }
    }
    // Anordnung neu berechnen: sofort, wenn die Fläche schon im Fenster hängt (Maße lesbar), sonst beim nächsten Anwenden
    this.#layoutS = null;
    if (this.#sicht && this.#flaeche.isConnected) this.#anordnen();
  }

  // ---------------------------------------------------------------- Verschieben und Zoomen
  #groesse() {
    const r = this.#fenster?.getBoundingClientRect();
    return { w: r?.width || 1000, h: r?.height || 700 };
  }
  #einpassMass() { const { w, h } = this.#groesse(); return Math.min(w / B, h / H); }

  #ansichtAnwenden() {
    if (!this.#flaeche) return;
    if (!this.#sicht) {
      this.#eingepasst = true;
      const { w, h } = this.#groesse();
      const s = this.#einpassMass();
      this.#sicht = { s, tx: (w - B * s) / 2, ty: (h - H * s) / 2 };
    }
    const { s, tx, ty } = this.#sicht;
    this.#flaeche.style.transform = `translate(${tx}px, ${ty}px) scale(${s})`;
    // Verschieben ändert die Anordnung nicht, nur ein neuer Maßstab (gebündelt je Bildaufbau)
    if (this.#layoutS !== s) {
      if (this.#layoutS === null) this.#anordnen();
      else if (!this.#layoutPlan) this.#layoutPlan = requestAnimationFrame(() => { this.#layoutPlan = 0; this.#anordnen(); });
    }
  }

  /**
   * Namen für den aktuellen Maßstab anordnen:
   * 1. Schrift und Punkte gedämpft skalieren (Schrift wächst nur mit der Wurzel des Zooms),
   * 2. nach Rang filtern (nur bei vielen Namen),
   * 3. Überlappungen auflösen: Städtenamen weichen aus (oben, rechts, links, unten), sonst gewinnt der höhere Rang.
   * Fest sichtbar bleiben der geöffnete Ort und die aktuellen Aufenthalte. Im Bearbeitungsmodus wird nichts ausgeblendet.
   */
  #anordnen() {
    const f = this.#flaeche;
    if (!f) return;
    const s = this.#sicht.s;
    this.#layoutS = s;
    const k = Math.min(1.6, Math.max(0.3, (s / SCHRIFT_BEZUG) ** -0.5));   // Schrift: Bildschirmgröße ∝ √s
    const p = Math.min(3, Math.max(0.4, s ** -0.75));     // Punkte und Porträts fast konstant
    const abstand = 4 * p + 1;
    f.style.setProperty("--wk-k", k.toFixed(3));
    f.style.setProperty("--wk-p", p.toFixed(3));
    f.style.setProperty("--wk-abstand", `${abstand.toFixed(2)}px`);
    f.style.setProperty("--wk-inv", (1 / s).toFixed(4));   // ein Bildschirmpixel in Kartenpixeln
    const ausgeblendet = this.#ebenenAus;
    const elemente = [...f.querySelectorAll(".wk-ort")];
    const nachId = new Map(this.#orte.map((o) => [o.id, o]));
    const fest = new Set([this.#offen]);
    for (const fig of f.querySelectorAll(".wk-figur, .wk-herkunft")) fest.add(fig.dataset.ort);
    const alles = this.#bearbeiten;
    const filtern = !alles && elemente.length > FILTER_AB;
    const kandidaten = [];
    for (const e of elemente) {
      const o = nachId.get(e.dataset.id);
      e.classList.remove("verdeckt", "pos-rechts", "pos-links", "pos-unten");
      let zeigen = true;
      if (!alles && !fest.has(o.id)) {
        if (ausgeblendet[o.typ]) zeigen = false;
        if (filtern && s < RANG_AB[rang(o)]) zeigen = false;
        if (o.ergaenzt && s >= LAENDER_BIS) zeigen = false;
      }
      e.classList.toggle("zu-fern", !zeigen);
      if (zeigen) kandidaten.push({ e, o });
    }
    if (alles) return;
    // Maße einmal lesen (Kartenpixel, ohne Transformation), danach rein rechnerisch prüfen
    for (const c of kandidaten) {
      const ziel = c.o.typ === "ort" ? c.e.querySelector(".wk-name") : c.e;
      c.w = ziel.offsetWidth; c.h = ziel.offsetHeight;
    }
    kandidaten.sort((a, b) => (fest.has(b.o.id) - fest.has(a.o.id)) || (rang(a.o) - rang(b.o)) || (TYP_VORRANG[a.o.typ] - TYP_VORRANG[b.o.typ]) || (b.w - a.w));
    const rand = 2 / s;  // 2 Bildschirmpixel Luft
    const belegt = [];
    const passt = (r, liste, eigen) => liste.every((b) => b.id === eigen || r.x1 + rand <= b.x0 || b.x1 + rand <= r.x0 || r.y1 + rand <= b.y0 || b.y1 + rand <= r.y0);
    // Ortspunkte sind Hindernisse: kein Name soll einen fremden Punkt verdecken. Ausnahme Rang 1 (Länder, große Meere):
    // Ländernamen stehen oft mitten zwischen ihren Städten und dürfen über Punkte laufen.
    const punkt = 3 * p + 1;
    const punkte = kandidaten.filter((c) => c.o.typ === "ort").map((c) => ({ id: c.o.id, x0: c.o.x - punkt, x1: c.o.x + punkt, y0: c.o.y - punkt, y1: c.o.y + punkt }));
    const frei = (r, o) => passt(r, belegt) && (rang(o) === 1 || passt(r, punkte, o.id)); // der eigene Punkt zählt nicht
    this.#plaetze = belegt;
    for (const c of kandidaten) {
      const { o, w, h } = c;
      let varianten;
      if (o.typ === "ort") {
        varianten = [
          ["", { x0: o.x - w / 2, x1: o.x + w / 2, y0: o.y - abstand - h, y1: o.y - abstand }],
          ["pos-rechts", { x0: o.x + abstand, x1: o.x + abstand + w, y0: o.y - h / 2, y1: o.y + h / 2 }],
          ["pos-links", { x0: o.x - abstand - w, x1: o.x - abstand, y0: o.y - h / 2, y1: o.y + h / 2 }],
          ["pos-unten", { x0: o.x - w / 2, x1: o.x + w / 2, y0: o.y + abstand, y1: o.y + abstand + h }],
        ];
      } else {
        const a = ((o.drehung || 0) * Math.PI) / 180;
        const bw = Math.abs(w * Math.cos(a)) + Math.abs(h * Math.sin(a)), bh = Math.abs(w * Math.sin(a)) + Math.abs(h * Math.cos(a));
        varianten = [["", { x0: o.x - bw / 2, x1: o.x + bw / 2, y0: o.y - bh / 2, y1: o.y + bh / 2 }]];
      }
      const wahl = varianten.find(([, r]) => frei(r, o)) ?? (fest.has(o.id) ? varianten[0] : null);
      if (!wahl) { c.e.classList.add("verdeckt"); continue; }
      if (wahl[0]) c.e.classList.add(wahl[0]);
      belegt.push({ ...wahl[1], id: o.id });
    }
  }

  /** Zuletzt berechnete Plätze der sichtbaren Namen (Kartenpixel), für Tests und Fehlersuche. */
  get plaetze() { return this.#plaetze; }
  #plaetze = [];

  #zoomMitte(faktor) { const { w, h } = this.#groesse(); this.#zoomen(faktor, w / 2, h / 2); }

  #einpassen() { this.#sicht = null; this.#ansichtAnwenden(); }

  get #ebenenAus() {
    try { return { ...(game.settings.get(SYSTEM_ID, "weltkarteEbenen") ?? {}) }; } catch { return {}; }
  }

  async #ebeneSchalten(typ, an) {
    const aus = { ...this.#ebenenAus, [typ]: !an };
    await game.settings.set(SYSTEM_ID, "weltkarteEbenen", aus);
    const zahl = Object.values(aus).filter(Boolean).length;
    const summary = this.element?.querySelector(".wk-ebenen > summary");
    summary?.querySelector(".wk-ebenen-zahl")?.remove();
    if (zahl) summary?.append(el("span", { class: "wk-ebenen-zahl", text: `(${zahl} aus)` }));
    if (this.#sicht) this.#anordnen();
  }

  #zoomen(faktor, mx, my) {
    const v = this.#sicht;
    const s = Math.min(6, Math.max(this.#einpassMass() * 0.8, v.s * faktor));
    v.tx = mx - (mx - v.tx) * (s / v.s);
    v.ty = my - (my - v.ty) * (s / v.s);
    v.s = s;
    this.#eingepasst = false;
    this.#ansichtAnwenden();
  }

  #verschieben(dx, dy) {
    this.#sicht.tx += dx; this.#sicht.ty += dy;
    this.#eingepasst = false;
    this.#ansichtAnwenden();
  }

  /** Beim ersten Öffnen: Spieler (und Spielleitung in der Ansicht eines Charakters) starten am aktuellen Aufenthalt. */
  #startAmAufenthalt() {
    if (!this.#erstesMal) return;
    this.#erstesMal = false;
    if (this.#sl && !this.#ansicht) return;
    for (const a of this.#figuren()) {
      const id = Object.entries(wissen(a)).find(([, e]) => e?.status === "aktuell")?.[0];
      const o = id && this.#orte.find((x) => x.id === id);
      if (o) { this.#zentrieren(o, 1.6); return; }
    }
  }

  #zentrieren(o, mindestens = 1.4) {
    const { w, h } = this.#groesse();
    const s = Math.max(this.#sicht?.s ?? 1, mindestens);
    this.#sicht = { s, tx: w / 2 - o.x * s, ty: h / 2 - o.y * s };
    this.#eingepasst = false;
    this.#ansichtAnwenden();
  }

  /** Bildschirmpunkt (relativ zum Fenster) in Kartenkoordinaten. */
  #karte(px, py) { const { s, tx, ty } = this.#sicht; return { x: (px - tx) / s, y: (py - ty) / s }; }

  #ereignisse() {
    const f = this.#fenster;
    f.addEventListener("keydown", (ev) => {
      if (ev.target.closest("input, textarea, select")) return;
      const schritt = 80;
      const tasten = {
        "+": () => this.#zoomMitte(1.25), "=": () => this.#zoomMitte(1.25), "-": () => this.#zoomMitte(1 / 1.25), "0": () => this.#einpassen(),
        ArrowLeft: () => this.#verschieben(schritt, 0), ArrowRight: () => this.#verschieben(-schritt, 0),
        ArrowUp: () => this.#verschieben(0, schritt), ArrowDown: () => this.#verschieben(0, -schritt),
        Escape: () => (this.#offen ? this.#abwaehlen() : null),
      };
      const aktion = tasten[ev.key];
      if (!aktion || (ev.key === "Escape" && !this.#offen)) return;   // Esc ohne Auswahl: Foundry schließt das Fenster wie gewohnt
      ev.preventDefault(); ev.stopPropagation();
      aktion();
    });
    f.addEventListener("pointerdown", () => { if (document.activeElement !== f && !document.activeElement?.closest?.(".wk-seite")) f.focus({ preventScroll: true }); });
    f.querySelector(".wk-steuerung")?.addEventListener("wheel", (ev) => ev.stopPropagation(), { passive: true });
    f.addEventListener("wheel", (ev) => {
      ev.preventDefault();
      const r = f.getBoundingClientRect();
      this.#zoomen(ev.deltaY < 0 ? 1.15 : 1 / 1.15, ev.clientX - r.left, ev.clientY - r.top);
    }, { passive: false });
    let zug = null;
    f.addEventListener("pointerdown", (ev) => {
      if (ev.button !== 0 || ev.target.closest(".wk-steuerung")) return;   // Knöpfe bekommen ihren Klick selbst
      const ortEl = ev.target.closest(".wk-ort");
      zug = { x: ev.clientX, y: ev.clientY, tx: this.#sicht.tx, ty: this.#sicht.ty, ortEl, bewegt: false };
      if (ortEl && this.#bearbeiten) { const o = this.#orte.find((x) => x.id === ortEl.dataset.id); zug.ort = o; zug.ox = o.x; zug.oy = o.y; }
      try { f.setPointerCapture?.(ev.pointerId); } catch { /* künstliche Ereignisse ohne aktiven Zeiger */ }
    });
    f.addEventListener("pointermove", (ev) => {
      if (!zug) return;
      const dx = ev.clientX - zug.x, dy = ev.clientY - zug.y;
      if (!zug.bewegt && Math.hypot(dx, dy) < 4) return;
      zug.bewegt = true;
      if (zug.ort) {
        zug.ort.x = Math.round(zug.ox + dx / this.#sicht.s);
        zug.ort.y = Math.round(zug.oy + dy / this.#sicht.s);
        zug.ortEl.style.left = `${zug.ort.x}px`; zug.ortEl.style.top = `${zug.ort.y}px`;
      } else {
        this.#sicht.tx = zug.tx + dx; this.#sicht.ty = zug.ty + dy;
        this.#eingepasst = false;
        f.classList.add("zieht");
        this.#ansichtAnwenden();
      }
    });
    const ende = (ev) => {
      if (!zug) return;
      const z = zug; zug = null;
      f.classList.remove("zieht");
      if (z.bewegt) { if (z.ort) this.#orteSpeichern(); return; }
      if (ev.type === "pointercancel") return;
      const r = f.getBoundingClientRect();
      if (z.ortEl) this.#auswaehlen(z.ortEl.dataset.id);
      else if (this.#neu) this.#anlegen(this.#karte(ev.clientX - r.left, ev.clientY - r.top));
      else if (this.#offen) this.#abwaehlen();
    };
    f.addEventListener("pointerup", ende);
    f.addEventListener("pointercancel", ende);
  }

  #suchen(text) {
    const t = String(text).trim().toLocaleLowerCase("de");
    if (!t) return;
    const o = this.#orte.find((x) => this.#sichtbar(x) && x.name.toLocaleLowerCase("de") === t)
      ?? this.#orte.find((x) => this.#sichtbar(x) && x.name.toLocaleLowerCase("de").includes(t));
    if (!o) return ui.notifications?.info?.(`Kein bekannter Ort „${text}“.`);
    this.#auswaehlen(o.id, { zentrieren: true });
  }

  // ---------------------------------------------------------------- Seitenleiste: Ortsliste und Details
  get #seiteOffen() {
    try { return game.settings.get(SYSTEM_ID, "weltkarteSeite") !== false; } catch { return true; }
  }

  async #seiteUmschalten(offen = !this.#seiteOffen) {
    this.#seite?.parentElement?.classList.toggle("ohne-seite", !offen);
    this.element?.querySelector(".wk-seite-knopf")?.classList.toggle("an", offen);
    await game.settings.set(SYSTEM_ID, "weltkarteSeite", offen);
  }

  /** Ort wählen: auf der Karte markieren und Details zeigen; aus Liste oder Suche auch hinfahren. */
  #auswaehlen(id, { zentrieren = false } = {}) {
    const o = this.#orte.find((x) => x.id === id);
    if (!o || !this.#fenster) return;
    const neu = this.#offen !== id;
    this.#offen = id;
    if (!this.#seiteOffen) this.#seiteUmschalten(true);
    this.#fenster.querySelectorAll(".wk-ort").forEach((e) => e.classList.toggle("aktiv", e.dataset.id === id));
    this.#seiteZeichnen();
    if (zentrieren) this.#zentrieren(o, o.typ === "ort" || o.typ === "fluss" ? 2 : 1.2);
    else if (neu && this.#sicht) { this.#anordnen(); this.#insBild(o); }
  }

  #abwaehlen() {
    this.#offen = null;
    this.#fenster?.querySelectorAll(".wk-ort.aktiv").forEach((e) => e.classList.remove("aktiv"));
    if (this.#sicht) this.#anordnen();
    this.#seiteZeichnen();
  }

  /** Liegt der Ort (etwa nach dem Öffnen der Seitenleiste) außerhalb des sichtbaren Bereichs, dorthin verschieben. */
  #insBild(o) {
    const { s, tx, ty } = this.#sicht;
    const { w, h } = this.#groesse();
    const x = tx + o.x * s, y = ty + o.y * s, rand = 40;
    if (x >= rand && x <= w - rand && y >= rand && y <= h - rand) return;
    this.#sicht = { s, tx: w / 2 - o.x * s, ty: h / 2 - o.y * s };
    this.#eingepasst = false;
    this.#ansichtAnwenden();
  }

  #seiteZeichnen() {
    if (!this.#seite) return;
    const o = this.#offen && this.#orte.find((x) => x.id === this.#offen);
    this.#seite.replaceChildren(o ? this.#detail(o) : this.#liste());
  }

  /** Ortsliste: Filterfeld, für Spieler zuerst die eigenen Orte, dann Gruppen nach Typ, Städte nach Land. */
  #liste() {
    const koerper = el("div", { class: "wk-liste-inhalt" });
    const suche = el("input", {
      type: "search", class: "wk-suche", placeholder: "Orte filtern, Enter springt hin …", value: this.#filter,
      oninput: (ev) => { this.#filter = ev.currentTarget.value; this.#listeFuellen(koerper); },
      onkeydown: (ev) => { if (ev.key === "Enter") { ev.preventDefault(); this.#suchen(ev.currentTarget.value); } },
      onchange: (ev) => this.#suchen(ev.currentTarget.value),
    });
    this.#listeFuellen(koerper);
    return el("div", { class: "wk-liste" }, el("div", { class: "wk-liste-kopf" }, suche), koerper);
  }

  #listeFuellen(koerper) {
    const t = this.#filter.trim().toLocaleLowerCase("de");
    const passt = (o) => !t || o.name.toLocaleLowerCase("de").includes(t) || (o.art ?? "").toLocaleLowerCase("de").includes(t);
    const orte = this.#orte.filter((o) => this.#sichtbar(o) && passt(o)).sort((a, b) => a.name.localeCompare(b.name, "de"));
    const figuren = this.#sl && !this.#ansicht ? [] : this.#figuren();
    const marken = (o) => figuren.flatMap((a) => {
      const e = wissen(a)[o.id];
      return e?.status ? [el("span", { class: `wk-marke status-${e.status}`, title: a.name, text: figuren.length > 1 ? `${a.name}: ${STATUS[e.status]}` : STATUS[e.status] })] : [];
    });
    const eintrag = (o, unterzeile = o.art || standardArt(o.typ)) => el("button", {
      type: "button", class: `wk-eintrag${o.id === this.#offen ? " aktiv" : ""}`, "data-id": o.id,
      onclick: () => this.#auswaehlen(o.id, { zentrieren: true }),
      onmouseenter: () => this.#markieren(o.id, true), onmouseleave: () => this.#markieren(o.id, false),
    }, el("span", { class: "wk-eintrag-name", text: o.name }), unterzeile ? el("span", { class: "wk-eintrag-art", text: unterzeile }) : null, marken(o));
    const gruppe = (schluessel, titel, eintraege, anzahl = eintraege.length) => {
      if (!eintraege.length) return null;
      const d = el("details", { class: "wk-gruppe", "data-gruppe": schluessel, open: !!t || this.#aufgeklappt.has(schluessel) },
        el("summary", {}, el("span", { text: titel }), el("span", { class: "wk-anzahl", text: String(anzahl) })), eintraege);
      d.addEventListener("toggle", () => { if (t) return; if (d.open) this.#aufgeklappt.add(schluessel); else this.#aufgeklappt.delete(schluessel); });
      return d;
    };
    const teile = [];
    // Spieler (und Spielleitung in der Ansicht eines Charakters): eigene Orte zuerst, aktueller Aufenthalt oben
    if (figuren.length) {
      const folge = { aktuell: 0, herkunft: 1, besucht: 2, bekannt: 3, name: 4, geruecht: 5 };
      const stufe = (o) => Math.min(...figuren.map((f) => folge[wissen(f)[o.id]?.status] ?? 9));
      const eigene = orte.filter((o) => stufe(o) < 9).sort((a, b) => stufe(a) - stufe(b) || a.name.localeCompare(b.name, "de"));
      teile.push(gruppe("eigene", figuren.length > 1 ? "Eure Orte" : "Deine Orte", eigene.map((o) => eintrag(o))));
    }
    const nachTyp = (typ) => orte.filter((o) => o.typ === typ);
    teile.push(gruppe("region", "Länder und Regionen", nachTyp("region").map((o) => eintrag(o))));
    teile.push(gruppe("meer", "Meere und Gewässer", nachTyp("meer").map((o) => eintrag(o))));
    teile.push(gruppe("insel", "Inseln", nachTyp("insel").map((o) => eintrag(o))));
    teile.push(gruppe("landschaft", "Gebirge und Landschaften", nachTyp("landschaft").map((o) => eintrag(o))));
    teile.push(gruppe("fluss", "Flüsse", nachTyp("fluss").map((o) => eintrag(o))));
    // Städte nach Land (aus der Art „Stadt in …“), Küstenstaaten und Länder in einer zweiten Ebene
    const staedte = nachTyp("ort");
    const land = (o) => (o.art ?? "").match(/ in ([^(]+?)(?: \(|$)/)?.[1]?.trim() ?? "Ohne Land";
    const laender = [...new Set(staedte.map(land))].sort((a, b) => a.localeCompare(b, "de"));
    const unter = laender.map((l) => gruppe(`ort:${l}`, l, staedte.filter((o) => land(o) === l).map((o) => eintrag(o, /^Stadt in /.test(o.art ?? "") ? "" : o.art))));
    teile.push(gruppe("ort", "Städte", unter.filter(Boolean), staedte.length));
    teile.push(gruppe("zusatz", "Weitere", nachTyp("zusatz").map((o) => eintrag(o))));
    const inhalt = teile.filter(Boolean);
    koerper.replaceChildren(...(inhalt.length ? inhalt : [el("p", { class: "wk-leer", text: t ? "Kein Ort passt zum Filter." : "Noch keine bekannten Orte." })]));
  }

  /** Beim Überfahren eines Listeneintrags den Namen auf der Karte hervorheben (auch wenn er gerade ausgeblendet ist). */
  #markieren(id, an) {
    this.#fenster?.querySelector(`.wk-ort[data-id="${CSS.escape(id)}"]`)?.classList.toggle("markiert", an);
  }

  /** Details eines Ortes; für die Spielleitung mit Eingabefeldern und Wissen je Charakter. */
  #detail(o) {
    const sl = this.#sl;
    const art = o.art || standardArt(o.typ);
    const teile = [
      el("button", { type: "button", class: "wk-zu", title: "Zurück zur Ortsliste", onclick: () => this.#abwaehlen() }, el("i", { class: "fa-solid fa-chevron-left" }), " Alle Orte"),
      el("h3", { text: o.name }),
      art ? el("div", { class: "wk-art", text: art }) : null,
    ];
    const bild = ortsbild(o), stufe = this.#stufe(o);
    if (bild.pfad && stufe !== 2) teile.push(el("img", { class: `wk-ortsbild${stufe === 1 ? " verschleiert" : ""}`, src: bild.pfad, alt: "", loading: "lazy", onerror: (ev) => ev.currentTarget.remove() }));
    if (sl) teile.push(el("div", { class: "wk-bildhinweis", title: `Eigenes Bild: bilder/karte/orte/${o.id}.webp`, text: bild.pfad ? `Bild: ${bild.pfad.split("/bilder/")[1]}` : `Kein Bild: bilder/karte/kategorie/${bild.kategorie}.webp oder bilder/karte/orte/${o.id}.webp` }));
    if (sl) {
      if (!o.text && !texteFreigeschaltet()) teile.push(el("p", { class: "wk-hinweis-freischalten", text: "Die Beschreibungen aller Orte werden mit dem PDF-Import von „Die Welt“ freigeschaltet (Einstellungen → Regelwerke importieren). Bis dahin kannst du hier eigene Texte schreiben." }));
      teile.push(el("label", { class: "wk-feld" }, el("span", { text: "Beschreibung (für alle, die den Ort kennen)" }),
        el("textarea", { class: "wk-text", rows: 5, placeholder: "Kurze Zusammenfassung …", onchange: (ev) => this.#ortAendern(o, { text: ev.currentTarget.value }) }, o.text ?? "")));
      teile.push(el("label", { class: "wk-feld" }, el("span", { text: "Quelle" }),
        el("input", { type: "text", class: "wk-quelle-feld", value: o.quelle ?? "", placeholder: "z. B. Die Welt S. 30", onchange: (ev) => this.#ortAendern(o, { quelle: ev.currentTarget.value }) })));
      teile.push(el("label", { class: "wk-feld" }, el("span", { class: "wk-feldkopf" }, "Gerücht (sehen Spieler ab „Gerücht“) ",
          el("select", { class: "wk-geruecht-wahr", title: "Wahrheitsgehalt, nur für die Spielleitung", onchange: (ev) => this.#ortAendern(o, { geruechtWahr: ev.currentTarget.value }, true) },
            el("option", { value: "", selected: !o.geruechtWahr, text: "–" }), Object.entries(WAHRHEIT).map(([k, t]) => el("option", { value: k, selected: o.geruechtWahr === k, text: t })))),
        el("textarea", { class: `wk-geruecht-text wahr-${o.geruechtWahr || "x"}`, rows: 3, placeholder: "Was man sich über diesen Ort erzählt …", onchange: (ev) => this.#ortAendern(o, { geruecht: ev.currentTarget.value }) }, o.geruecht ?? "")));
      teile.push(el("label", { class: "wk-haken" }, el("input", { type: "checkbox", class: "wk-allen", checked: !!o.allen, onchange: (ev) => this.#ortAendern(o, { allen: ev.currentTarget.checked }, true) }), " allen Spielern bekannt"));
      if (this.#bearbeiten) teile.push(this.#bearbeitungsfelder(o));
      const figuren = abenteurer();
      teile.push(el("div", { class: "wk-abschnitt", text: "Charaktere" }));
      if (!figuren.length) teile.push(el("p", { class: "wk-leer", text: "Noch keine Abenteurer in der Welt." }));
      for (const a of figuren) {
        const e = wissen(a)[o.id] ?? {};
        teile.push(el("div", { class: "wk-figurzeile", "data-akteur": a.id },
          el("div", { class: "wk-figurkopf" }, el("span", { class: "wk-figurname", text: a.name }),
            el("select", { class: "wk-status", onchange: (ev) => this.#wissenAendern(a, o.id, { status: ev.currentTarget.value }) },
              Object.entries(STATUS).map(([k, t]) => el("option", { value: k, selected: (e.status ?? "") === k, text: t })))),
          el("textarea", { class: "wk-notiz", rows: 2, placeholder: `Hintergrund nur für ${a.name} …`, onchange: (ev) => this.#wissenAendern(a, o.id, { notiz: ev.currentTarget.value }) }, e.notiz ?? "")));
      }
    } else {
      const stufe = this.#stufe(o);
      if (stufe >= 3) {
        teile.push(o.text ? el("p", { class: "wk-beschreibung", text: o.text }) : null);
        teile.push(o.text && o.quelle ? el("div", { class: "wk-quelle", text: `Quelle: ${o.quelle}` }) : null);
      } else teile.push(el("p", { class: "wk-leer wk-stufe-hinweis", text: stufe === 1 ? "Nur vom Hörensagen bekannt." : "Bekannt ist nur der Name." }));
      if (o.geruecht) teile.push(el("div", { class: "wk-geruecht" }, el("div", { class: "wk-geruecht-kopf", text: "Man erzählt sich" }), el("p", { text: o.geruecht })));
      let eigenes = stufe < 3;
      for (const a of this.#figuren()) {
        const e = wissen(a)[o.id];
        if (!e?.status) continue;
        eigenes = true;
        teile.push(el("div", { class: "wk-wissen" }, el("div", { class: "wk-figurkopf" }, el("span", { class: "wk-figurname", text: a.name }), el("span", { class: `wk-marke status-${e.status}`, text: STATUS[e.status] })),
          e.notiz ? el("p", { class: "wk-beschreibung", text: e.notiz }) : null));
      }
      if (!o.text && !eigenes) teile.push(el("p", { class: "wk-leer", text: "Keine weiteren Angaben." }));
    }
    return el("div", { class: "wk-detail", "data-id": o.id }, teile.filter(Boolean));
  }

  #bearbeitungsfelder(o) {
    const feld = (titel, eingabe) => el("label", { class: "wk-feld" }, el("span", { text: titel }), eingabe);
    return el("fieldset", { class: "wk-bearbeitung" }, el("legend", { text: "Beschriftung" }),
      feld("Name", el("input", { type: "text", class: "wk-e-name", value: o.name, onchange: (ev) => this.#ortAendern(o, { name: ev.currentTarget.value.trim() || o.name }, true) })),
      feld("Anzeige mit Umbrüchen (|)", el("input", { type: "text", class: "wk-e-anzeige", value: o.anzeige ?? "", placeholder: "z. B. Meer der|Roten Sonne", onchange: (ev) => this.#ortAendern(o, { anzeige: ev.currentTarget.value }, true) })),
      feld("Typ", el("select", { class: "wk-e-typ", onchange: (ev) => this.#ortAendern(o, { typ: ev.currentTarget.value }, true) }, Object.entries(TYPEN).map(([k, t]) => el("option", { value: k, selected: o.typ === k, text: t })))),
      feld("Art (Zeile unter dem Namen)", el("input", { type: "text", class: "wk-e-art", value: o.art ?? "", placeholder: standardArt(o.typ), onchange: (ev) => this.#ortAendern(o, { art: ev.currentTarget.value }, true) })),
      el("div", { class: "wk-reihe" },
        feld("Drehung °", el("input", { type: "number", class: "wk-e-drehung", step: 1, value: o.drehung ?? 0, onchange: (ev) => this.#ortAendern(o, { drehung: Number(ev.currentTarget.value) || 0 }, true) })),
        feld("Größe", el("input", { type: "number", class: "wk-e-groesse", step: 0.1, min: 0.3, max: 4, value: o.groesse ?? 1, onchange: (ev) => this.#ortAendern(o, { groesse: Number(ev.currentTarget.value) || 1 }, true) }))),
      feld("Rang (ab welcher Zoomstufe sichtbar)", el("select", { class: "wk-e-rang", onchange: (ev) => this.#ortAendern(o, { rang: Number(ev.currentTarget.value) || 0 }, true) },
        el("option", { value: "0", selected: !o.rang, text: `automatisch (${RAENGE[rang({ ...o, rang: 0 })]})` }),
        Object.entries(RAENGE).map(([k, t]) => el("option", { value: k, selected: Number(o.rang) === Number(k), text: t })))),
      el("label", { class: "wk-haken" }, el("input", { type: "checkbox", class: "wk-e-geprueft", checked: !o.pruefen, onchange: (ev) => this.#ortAendern(o, { pruefen: !ev.currentTarget.checked }, true) }), " Schreibweise geprüft"),
      el("button", { type: "button", class: "wk-knopf wk-loeschen", onclick: () => this.#loeschen(o) }, el("i", { class: "fa-solid fa-trash" }), " Beschriftung löschen"));
  }

  // ---------------------------------------------------------------- Speichern
  async #orteSpeichern() {
    this.#gespeichert = Date.now();
    // freigeschaltete Beschreibungen nicht doppelt speichern: unveränderte Texte bleiben leer und werden beim Laden eingesetzt
    const texte = game.settings.get(SYSTEM_ID, "weltkarteTexte")?.texte ?? {};
    const orte = this.#orte.map((o) => (o.text && o.text === texte[o.id] ? { ...o, text: "" } : o));
    await game.settings.set(SYSTEM_ID, "weltkarteOrte", { stand: STAND, orte });
  }

  /** Ort ändern; mit neuZeichnen auch Beschriftung und Details erneuern (sonst bleibt der Fokus im Feld). */
  async #ortAendern(o, aenderung, neuZeichnen = false) {
    Object.assign(o, aenderung);
    if (neuZeichnen) { this.#ebeneZeichnen(); this.#seiteZeichnen(); }
    await this.#orteSpeichern();
  }

  async #wissenAendern(actor, ortId, aenderung) {
    await statusSetzen(actor, ortId, aenderung);
    if (aenderung.status !== undefined) this.#ebeneZeichnen(); // Porträt am aktuellen Ort, Sichtbarkeit in der Charakteransicht
    if (aenderung.status === "aktuell") this.#seiteZeichnen(); // andere Orte dieses Charakters sind jetzt "besucht"
  }

  async #anlegen({ x, y }) {
    this.#neu = false;
    this.#fenster.parentElement?.querySelector(".wk-neu")?.classList.remove("an");
    let id = "neu", n = 1;
    while (this.#orte.some((o) => o.id === id)) id = `neu-${++n}`;
    const o = { id, name: "Neuer Name", typ: "ort", x: Math.round(x), y: Math.round(y), drehung: 0, anzeige: "", art: "", groesse: 1, text: "", allen: false, pruefen: false };
    this.#orte.push(o);
    this.#ebeneZeichnen();
    this.#auswaehlen(id);
    this.#seite.querySelector(".wk-e-name")?.select();
    await this.#orteSpeichern();
  }

  async #loeschen(o) {
    if (!(await this.#bestaetigen(`„${o.name}“ von der Karte löschen? Das Wissen der Charaktere zu diesem Ort bleibt am Akteur gespeichert.`))) return;
    this.#orte = this.#orte.filter((x) => x !== o);
    this.#offen = null;
    this.#ebeneZeichnen();
    this.#seiteZeichnen();
    await this.#orteSpeichern();
  }

  async #zuruecksetzen() {
    if (!(await this.#bestaetigen("Alle Beschriftungen, Lagen und Beschreibungen auf den mitgelieferten Stand zurücksetzen? Eigene Texte gehen dabei verloren."))) return;
    this.#gespeichert = 0;
    await game.settings.set(SYSTEM_ID, "weltkarteOrte", {});
    this.render();
  }

  async #bestaetigen(text) {
    const D = foundry.applications.api.DialogV2;
    if (D?.confirm) return D.confirm({ window: { title: "Weltkarte" }, content: `<p>${foundry.utils.escapeHTML?.(text) ?? text}</p>` });
    return globalThis.confirm(text);
  }
}

/** Knopf in der Journal-Seitenleiste. */
export function knopfEinbauen(_app, html) {
  const wurzel = html instanceof HTMLElement ? html : html?.[0];
  if (!wurzel || wurzel.querySelector(".midgard-weltkarte-knopf")) return;
  const knopf = el("button", { type: "button", class: "midgard-browser-knopf midgard-weltkarte-knopf", onclick: () => Weltkarte.oeffnen() }, el("i", { class: "fa-solid fa-map" }), " Weltkarte");
  (wurzel.querySelector(".header-actions") ?? wurzel.querySelector(".directory-header") ?? wurzel).append(knopf);
}

/** Wissen eines Charakters wurde von jemand anderem geändert: offene Karte nachziehen. */
export function akteurGeaendert(_actor, aenderung, _optionen, benutzer) {
  if (benutzer === game.user.id || aenderung?.flags?.[SYSTEM_ID]?.weltkarte === undefined) return;
  Weltkarte.neuZeichnen();
}

export { kennung };
