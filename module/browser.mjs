// Kompendium-Browser: alle Regeldaten des Systems mit Reitern, Suche, Filtern und Detailansicht.
// Einträge lassen sich auf Bögen und in die Seitenleiste ziehen (Foundry-Format {type, uuid}).
import KOMPENDIUM from "../daten/kompendium.js";
import { pdfImportStarten } from "./pdf-import.mjs";
import { KATEGORIEN, FELDNAMEN, SYSTEM_ID, packId, feld, anzeige, detailText } from "./kategorien.mjs";

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

const normal = (s) => String(s ?? "").toLocaleLowerCase("de").normalize("NFD").replace(/[̀-ͯ]/g, "");

export class KompendiumBrowser extends ApplicationV2 {
  static DEFAULT_OPTIONS = {
    id: "midgard-kompendium-browser",
    classes: ["midgard-browser"],
    tag: "div",
    window: { title: "Midgard: Kompendium-Browser", icon: "fa-solid fa-book-open", resizable: true },
    position: { width: 980, height: 720 },
  };

  /** Eine Instanz für alle Aufrufe. */
  static #instanz = null;
  static oeffnen(kat) {
    const b = (this.#instanz ??= new KompendiumBrowser());
    if (kat && KATEGORIEN[kat]) b.#kat = kat;
    return b.render({ force: true });
  }

  #kat = "fertigkeiten";
  #suche = "";
  #filter = {};          // kat -> {feld: wert}
  #sortierung = {};      // kat -> {feld, ab}
  #auswahl = null;       // _id des gewählten Eintrags
  #daten = {};           // kat -> [{_id, name, img, system, uuid}]
  #ausKompendium = {};   // kat -> true, wenn die Einträge aus dem Welt-Kompendium stammen

  /** Einträge einer Kategorie; bevorzugt aus dem Welt-Kompendium (dort nachgetragene Texte zählen). */
  async #laden(kat) {
    if (this.#daten[kat]) return this.#daten[kat];
    const pack = game.packs.get(packId(kat));
    if (pack) {
      const index = await pack.getIndex({ fields: ["system", "flags"] });
      this.#daten[kat] = Array.from(index, (e) => ({ _id: e._id, name: e.name, img: e.img, system: e.system ?? {}, uuid: e.uuid ?? `Compendium.${pack.collection}.Item.${e._id}` }));
      this.#ausKompendium[kat] = true;
    } else {
      // noch nicht eingerichtet (Spielleiter war nicht da): Anzeige aus den mitgelieferten Daten, ohne Ziehen
      this.#daten[kat] = KOMPENDIUM.kategorien[kat].map((e) => ({ ...e, uuid: null }));
      this.#ausKompendium[kat] = false;
    }
    return this.#daten[kat];
  }

  /** Nach Import oder Abgleich: zwischengespeicherte Einträge verwerfen. */
  static zuruecksetzen() { this.#instanz?.zuruecksetzen(); }

  /** Nach einem Abgleich der Kompendien neu laden. */
  zuruecksetzen() {
    this.#daten = {};
    this.#ausKompendium = {};
    if (this.rendered) this.render();
  }

  #gefiltert(eintraege) {
    const def = KATEGORIEN[this.#kat];
    const filter = this.#filter[this.#kat] ?? {};
    const worte = normal(this.#suche).split(/\s+/).filter(Boolean);
    let liste = eintraege.filter((e) => {
      for (const [f, w] of Object.entries(filter)) if (w !== "" && String(feld(e.system, f)) !== w) return false;
      if (!worte.length) return true;
      const heu = normal([e.name, ...def.spalten.map(([f]) => anzeige(feld(e.system, f))), e.system.kurzwirkung].join(" "));
      return worte.every((w) => heu.includes(w));
    });
    const sort = this.#sortierung[this.#kat];
    const wert = (e) => (sort.feld === "name" ? e.name : feld(e.system, sort.feld));
    if (sort) {
      liste = liste.slice().sort((a, b) => {
        const x = wert(a), y = wert(b);
        const v = typeof x === "number" && typeof y === "number" ? x - y : anzeige(x).localeCompare(anzeige(y), "de", { numeric: true });
        return (v || a.name.localeCompare(b.name, "de")) * (sort.ab ? -1 : 1);
      });
    } else {
      liste = liste.slice().sort((a, b) => a.name.localeCompare(b.name, "de"));
    }
    return liste;
  }

  async _renderHTML() {
    const eintraege = await this.#laden(this.#kat);
    const wurzel = el("div", { class: "mb-wurzel" });
    wurzel.append(this.#reiter(), this.#werkzeugleiste(eintraege), el("div", { class: "mb-haupt" }, el("div", { class: "mb-liste" }), el("aside", { class: "mb-detail" })));
    if (!this.#ausKompendium[this.#kat]) {
      wurzel.insertBefore(el("p", { class: "mb-hinweis", text: "Die Kompendien sind in dieser Welt noch nicht eingerichtet. Das geschieht, sobald ein Spielleiter die Welt öffnet. Bis dahin können Einträge nur angesehen, nicht gezogen werden." }), wurzel.children[2]);
    }
    this.#listeZeichnen(wurzel, eintraege);
    return wurzel;
  }

  _replaceHTML(result, content) {
    content.replaceChildren(result);
  }

  #reiter() {
    return el("nav", { class: "mb-reiter" }, Object.entries(KATEGORIEN).map(([kat, def]) =>
      el("button", {
        type: "button", class: kat === this.#kat ? "aktiv" : null, "data-kat": kat, text: `${def.label} (${KOMPENDIUM.kategorien[kat].length})`,
        onclick: () => { this.#kat = kat; this.#auswahl = null; this.render(); },
      })));
  }

  #werkzeugleiste(eintraege) {
    const def = KATEGORIEN[this.#kat];
    const filter = (this.#filter[this.#kat] ??= {});
    const leiste = el("div", { class: "mb-werkzeuge" });
    leiste.append(el("input", {
      type: "search", class: "mb-suche", placeholder: "Suchen …", value: this.#suche, "aria-label": "Suchen",
      oninput: (ev) => { this.#suche = ev.target.value; this.#listeZeichnen(this.element, eintraege); },
    }));
    for (const [f, label, sort] of def.filter) {
      const werte = [...new Set(eintraege.map((e) => feld(e.system, f)).filter((w) => w !== "" && w !== null && w !== undefined))];
      werte.sort(sort ?? ((a, b) => anzeige(a).localeCompare(anzeige(b), "de")));
      leiste.append(el("label", { class: "mb-filter" }, `${label} `, el("select", {
        "data-feld": f,
        onchange: (ev) => { filter[f] = ev.target.value; this.#listeZeichnen(this.element, eintraege); },
      }, el("option", { value: "", text: "alle" }), werte.map((w) => el("option", { value: String(w), selected: filter[f] === String(w), text: anzeige(w) })))));
    }
    leiste.append(el("button", {
      type: "button", class: "mb-zuruecksetzen", text: "Filter leeren",
      onclick: () => { this.#suche = ""; this.#filter[this.#kat] = {}; this.render(); },
    }));
    if (game.user.isGM) leiste.append(el("button", { type: "button", class: "mb-pdf", title: "Beschreibungen aus Kodex oder Arkanum (eigene PDF) in die Kompendien dieser Welt übernehmen", text: "Regelwerk-PDF importieren", onclick: () => pdfImportStarten() }));
    return leiste;
  }

  #listeZeichnen(wurzel, eintraege) {
    const ziel = wurzel.querySelector(".mb-liste");
    if (!ziel) return;
    const def = KATEGORIEN[this.#kat];
    const liste = this.#gefiltert(eintraege);
    const sort = this.#sortierung[this.#kat];
    const kopf = (f, text) => el("th", {
      "data-feld": f, class: sort?.feld === f ? (sort.ab ? "ab" : "auf") : null, text, title: "Sortieren",
      onclick: () => {
        const s = this.#sortierung[this.#kat];
        this.#sortierung[this.#kat] = s?.feld === f ? { feld: f, ab: !s.ab } : { feld: f, ab: false };
        this.#listeZeichnen(wurzel, eintraege);
      },
    });
    const tabelle = el("table", { class: "mb-tabelle" },
      el("thead", {}, el("tr", {}, kopf("name", "Name"), def.spalten.map(([f, t]) => kopf(f, t)))),
      el("tbody", {}, liste.map((e) => el("tr", {
        "data-id": e._id, class: e._id === this.#auswahl ? "gewaehlt" : null, draggable: e.uuid ? "true" : null, tabindex: "0",
        ondragstart: (ev) => ev.dataTransfer.setData("text/plain", JSON.stringify({ type: "Item", uuid: e.uuid })),
        onclick: () => { this.#auswahl = e._id; this.#listeZeichnen(wurzel, eintraege); },
        ondblclick: () => this.#oeffnen(e),
        onkeydown: (ev) => { if (ev.key === "Enter") this.#oeffnen(e); },
      }, el("td", {}, el("span", { class: "mb-name" }, el("img", { src: e.img, alt: "" }), e.name)),
      def.spalten.map(([f, , fmt]) => el("td", { text: (fmt ?? anzeige)(feld(e.system, f)) }))))));
    ziel.replaceChildren(el("p", { class: "mb-anzahl", text: `${liste.length} von ${eintraege.length} Einträgen` }), tabelle);
    this.#detailZeichnen(wurzel, eintraege.find((e) => e._id === this.#auswahl));
  }

  #detailZeichnen(wurzel, e) {
    const ziel = wurzel.querySelector(".mb-detail");
    if (!ziel) return;
    if (!e) {
      ziel.replaceChildren(el("p", { class: "mb-leer", text: "Eintrag anklicken für Details. Doppelklick öffnet ihn, Ziehen legt ihn auf einen Bogen." }));
      return;
    }
    const zeilen = Object.entries(e.system).filter(([k, v]) => !["beschreibung", "kurzwirkung"].includes(k) && v !== "" && v !== null && !(Array.isArray(v) && !v.length) && !(typeof v === "object" && !Array.isArray(v) && !Object.keys(v).length));
    ziel.replaceChildren(...[
      el("h3", {}, el("img", { src: e.img, alt: "" }), e.name),
      e.system.kurzwirkung ? el("p", { class: "mb-kurz", text: e.system.kurzwirkung }) : null,
      el("dl", {}, zeilen.map(([k, v]) => [el("dt", { text: FELDNAMEN[k] ?? k }), el("dd", { text: detailText(k, v) })])),
      e.system.beschreibung ? (() => { const d = el("div", { class: "mb-beschreibung" }); d.innerHTML = e.system.beschreibung; return d; })() : null,
      e.uuid ? el("button", { type: "button", text: "Öffnen", onclick: () => this.#oeffnen(e) }) : null,
    ].filter(Boolean));
  }

  async #oeffnen(e) {
    if (!e.uuid) return;
    const doc = await fromUuid(e.uuid);
    if (doc) doc.sheet.render({ force: true });
    else ui.notifications.warn(`${e.name} wurde im Kompendium nicht gefunden.`);
  }
}

/** Knopf im Kompendium-Reiter der Seitenleiste. */
export function knopfEinbauen(_app, html) {
  const wurzel = html instanceof HTMLElement ? html : html?.[0];
  if (!wurzel || wurzel.querySelector(".midgard-browser-knopf")) return;
  const knopf = el("button", { type: "button", class: "midgard-browser-knopf" }, el("i", { class: "fa-solid fa-book-open" }), " Midgard-Kompendium");
  knopf.addEventListener("click", () => KompendiumBrowser.oeffnen());
  const ort = wurzel.querySelector(".header-actions") ?? wurzel.querySelector(".directory-header") ?? wurzel;
  ort.append(knopf);
  if (game.user.isGM) {
    const pdf = el("button", { type: "button", class: "midgard-browser-knopf midgard-pdf-knopf", title: "Beschreibungen aus Kodex oder Arkanum (eigene PDF) übernehmen" }, el("i", { class: "fa-solid fa-file-pdf" }), " Regelwerk-PDF importieren");
    pdf.addEventListener("click", () => pdfImportStarten());
    ort.append(pdf);
  }
}

export { SYSTEM_ID };
