// Einheitlicher Bogen für alle Gegenstandstypen: einfache Felder sind bearbeitbar,
// verschachtelte Regeldaten (Startlisten, Lerneinheiten usw.) werden nur angezeigt.
import { FELDNAMEN, SYSTEM_ID, detailText } from "./kategorien.mjs";
import { REGEL_PACK } from "./verlinken.mjs";

const { ItemSheetV2 } = foundry.applications.sheets;

const el = (tag, attrs = {}, ...kinder) => {
  const e = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (v === undefined || v === null || v === false) continue;
    if (k === "text") e.textContent = v;
    else e.setAttribute(k, v === true ? "" : v);
  }
  for (const k of kinder.flat(Infinity)) if (k !== null && k !== undefined && k !== false) e.append(k);
  return e;
};

/** Schlagwörter im Kopf je Typ (wie die Merkmalsleiste in PF2e). */
const SCHLAGWORTE = {
  zauber: ["gruppe", "stufe", "art", "ursprung", "agens"],
  waffe: ["fertigkeit", "art"],
  ruestung: ["kuerzel"],
  fertigkeit: ["leiteigenschaft", "lerngruppe"],
  waffenfertigkeit: ["schwierigkeit", "lerngruppe"],
  gegenstand: ["kategorie", "unterkategorie"],
  typ: ["kuerzel", "artName"],
};
const leer = (v) => v === "" || v === null || v === undefined || (Array.isArray(v) && !v.length) || (typeof v === "object" && !Array.isArray(v) && !Object.values(v).some((x) => x !== null && x !== "" && x !== 0));

const TextEditorKlasse = () => foundry.applications?.ux?.TextEditor?.implementation ?? globalThis.TextEditor;

export class GegenstandBogen extends ItemSheetV2 {
  static DEFAULT_OPTIONS = {
    classes: ["midgard-gegenstand"],
    position: { width: 520, height: 640 },
    window: { resizable: true },
    form: { submitOnChange: true, closeOnSubmit: false },
  };

  #textBearbeiten = false;
  #reiter = "beschreibung";   // beim Öffnen immer „Beschreibung“

  async close(options) { this.#reiter = "beschreibung"; this.#textBearbeiten = false; return super.close(options); }

  async _renderHTML() {
    const item = this.item;
    const bearbeitbar = this.isEditable;
    const felder = item.system.schema?.fields ?? {};
    // gleiche Gestaltung wie der Charakterbogen
    const wurzel = el("div", { class: "mg-wurzel midgard-cmt" });
    const schlagworte = (SCHLAGWORTE[item.type] ?? []).map((k) => [k, item.system[k]]).filter(([, v]) => !leer(v))
      .map(([k, v]) => el("span", { class: "mg-schlagwort", title: FELDNAMEN[k] ?? k, text: k === "stufe" ? `Stufe ${v}` : detailText(k, v) }));

    wurzel.append(el("header", { class: "mg-kopf karte" },
      el("img", { src: item.img, alt: "", class: "mg-bild" }),
      el("div", { class: "mg-kopf-text" },
        bearbeitbar ? el("input", { type: "text", name: "name", value: item.name, "aria-label": "Name" }) : el("h2", { text: item.name }),
        el("p", { class: "mg-schlagworte" }, el("span", { class: "mg-schlagwort mg-typ", text: game.i18n.localize(`TYPES.Item.${item.type}`) }), schlagworte))));

    // Werte zweispaltig; Reihenfolge aus dem Datenmodell. Gesperrt ohne leere Felder und ohne die Schlagwörter.
    const felderListe = el("dl", { class: "mg-felder" });
    for (const [schluessel, feld] of Object.entries(felder)) {
      if (["beschreibung", "kurzwirkung", "quelle"].includes(schluessel)) continue;
      const wert = item.system[schluessel];
      if (!bearbeitbar && (leer(wert) || (SCHLAGWORTE[item.type] ?? []).includes(schluessel))) continue;
      const lang = !bearbeitbar && String(detailText(schluessel, wert)).length > 40;
      felderListe.append(el("div", { class: lang ? "mg-feld breit" : "mg-feld" }, el("dt", { text: FELDNAMEN[schluessel] ?? schluessel }), el("dd", {}, this.#eingabe(schluessel, wert, feld, bearbeitbar))));
    }
    if (bearbeitbar && felder.quelle) felderListe.append(el("div", { class: "mg-feld" }, el("dt", { text: FELDNAMEN.quelle ?? "Quelle" }), el("dd", {}, this.#eingabe("quelle", item.system.quelle, felder.quelle, true))));
    // drei Reiter: Beschreibung (Standard), Details (Werte), Regelwerk (Fundstelle und Regelseiten)
    const REITER = [["beschreibung", "Beschreibung", "fa-feather"], ["details", "Details", "fa-list"], ["regelwerk", "Regelwerk", "fa-book"]];
    const nav = el("nav", { class: "mg-reiter", role: "tablist" });
    for (const [id, titel, symbol] of REITER) {
      const b = el("button", { type: "button", role: "tab", "data-reiter": id, class: id === this.#reiter ? "aktiv" : null, "aria-selected": String(id === this.#reiter) });
      b.innerHTML = `<i class="fa-solid ${symbol}" aria-hidden="true"></i> `;
      b.append(titel);
      b.addEventListener("click", () => { this.#reiter = id; this.render(); });
      nav.append(b);
    }
    wurzel.append(nav);
    const panel = (id, ...inhalt) => el("div", { class: id === this.#reiter ? "mg-panel aktiv" : "mg-panel", "data-panel": id, role: "tabpanel", hidden: id !== this.#reiter }, ...inhalt);
    const details = panel("details", felderListe.children.length ? el("section", { class: "karte mg-werte" }, felderListe) : el("p", { class: "mg-leer", text: "Keine weiteren Werte." }));

    const textKarte = el("section", { class: "karte mg-textkarte" });
    if (bearbeitbar || item.system.kurzwirkung) textKarte.append(el("label", { class: "mg-kurz" }, el("span", { text: FELDNAMEN.kurzwirkung }),
      bearbeitbar ? el("input", { type: "text", name: "system.kurzwirkung", value: item.system.kurzwirkung ?? "", placeholder: "ein Satz in eigenen Worten" })
        : el("p", { text: item.system.kurzwirkung })));

    // Beschreibung immer formatiert anzeigen; Bearbeiten (HTML) nur auf Knopfdruck, danach wieder die Ansicht
    const kopfzeile = el("div", { class: "mg-beschreibung-kopf" }, el("h3", { text: FELDNAMEN.beschreibung }));
    const beschreibung = el("div", { class: "mg-beschreibung" }, kopfzeile);
    if (bearbeitbar) {
      const knopf = el("button", { type: "button", class: "mg-text-knopf", text: this.#textBearbeiten ? "Fertig" : "Text bearbeiten" });
      knopf.addEventListener("click", () => { this.#textBearbeiten = !this.#textBearbeiten; this.render(); });
      kopfzeile.append(knopf);
    }
    if (bearbeitbar && this.#textBearbeiten) {
      const ta = el("textarea", { name: "system.beschreibung", rows: "12" });
      ta.value = item.system.beschreibung ?? "";
      beschreibung.append(el("p", { class: "mg-leer", text: "HTML: Absätze mit <p>…</p>, fett mit <strong>…</strong>." }), ta);
    } else if (item.system.beschreibung) {
      const div = el("div", { class: "mg-text" });
      div.innerHTML = await TextEditorKlasse().enrichHTML(item.system.beschreibung, { relativeTo: item, secrets: item.isOwner });
      beschreibung.append(div);
    } else {
      beschreibung.append(el("p", { class: "mg-leer", text: "Keine Beschreibung hinterlegt." }));
    }
    textKarte.append(beschreibung);
    wurzel.append(panel("beschreibung", textKarte), details, panel("regelwerk", await this.#regelwerk()));
    return wurzel;
  }

  /**
   * Reiter „Regelwerk“: Fundstelle im Buch, Regelseiten derselben Buchseite und Regelseiten, die auf diesen
   * Eintrag verweisen (aus dem Kompendium „Midgard: Regeln“, sobald das Buch importiert ist).
   */
  async #regelwerk() {
    const item = this.item;
    const imp = item.getFlag(SYSTEM_ID, "pdfImport");
    const fundstelle = imp?.seite ? `${imp.buch}, S. ${imp.seite}` : item.getFlag(SYSTEM_ID, "quelle") || item.system.quelle || "";
    const karte = el("section", { class: "karte mg-regelwerk" }, el("h3", { text: "Fundstelle" }),
      el("p", { class: "mg-fundstelle-gross", text: fundstelle || "Keine Fundstelle hinterlegt." }));
    const pack = game.packs.get(`world.${REGEL_PACK}`);
    if (!pack) return karte;
    const journale = await pack.getDocuments();
    if (!journale.length) { karte.append(el("p", { class: "mg-leer", text: "Das Regel-Kompendium ist noch leer: Kodex und Arkanum über „Regelwerk-PDF importieren“ einlesen." })); return karte; }
    // Herkunft: Kompendium-Eintrag selbst oder Kopie davon (Bogen, Welt)
    const herkunft = [item.uuid, item._stats?.compendiumSource, item.flags?.core?.sourceId].filter(Boolean);
    const id = (u) => String(u).split(".").pop();
    const ids = new Set(herkunft.map(id));
    const link = (j, p) => {
      const a = el("a", { class: "content-link", "data-uuid": p.uuid, "data-link": "", draggable: "true" });
      a.innerHTML = `<i class="fa-solid fa-book-open" aria-hidden="true"></i> `;
      a.append(`${j.name}${p.name && p.name !== j.name ? ` › ${p.name}` : ""}`);
      a.addEventListener("click", async (ev) => { ev.preventDefault(); const d = await fromUuid(p.uuid); (d?.parent ?? d)?.sheet?.render(true, d?.parent ? { pageId: d.id } : {}); });
      return el("li", {}, a, el("small", { text: p.flags?.[SYSTEM_ID]?.seite ? `  ${j.getFlag?.(SYSTEM_ID, "buch") ?? ""}, S. ${p.flags[SYSTEM_ID].seite}` : "" }));
    };
    const gleicheSeite = [], erwaehnt = [];
    for (const j of journale) {
      const buch = j.getFlag?.(SYSTEM_ID, "buch") ?? j.flags?.[SYSTEM_ID]?.buch;
      for (const p of j.pages ?? []) {
        const seite = p.flags?.[SYSTEM_ID]?.seite;
        if (imp?.seite && buch === imp.buch && seite === imp.seite) gleicheSeite.push(link(j, p));
        const text = p.text?.content ?? "";
        if ([...ids].some((x) => text.includes(`.${x}]`))) erwaehnt.push(link(j, p));
      }
    }
    karte.append(el("h3", { text: "Regelseiten derselben Buchseite" }),
      gleicheSeite.length ? el("ul", { class: "mg-regel-liste" }, gleicheSeite) : el("p", { class: "mg-leer", text: imp?.seite ? "Keine Regelseite auf dieser Buchseite; die Beschreibung steht im Eintrag selbst." : "–" }),
      el("h3", { text: "Erwähnt in den Regeln" }),
      erwaehnt.length ? el("ul", { class: "mg-regel-liste" }, erwaehnt.slice(0, 30)) : el("p", { class: "mg-leer", text: "Keine Regelseite verweist auf diesen Eintrag." }));
    return karte;
  }

  #eingabe(schluessel, wert, feld, bearbeitbar) {
    const name = `system.${schluessel}`;
    const F = foundry.data.fields;
    if (!bearbeitbar || !feld) return el("span", { text: detailText(schluessel, wert) || "–" });
    if (feld instanceof F.BooleanField) return el("input", { type: "checkbox", name, checked: !!wert });
    if (feld instanceof F.NumberField) return el("input", { type: "number", name, value: wert ?? "", step: feld.options?.integer === false ? "any" : "1" });
    if (feld instanceof F.StringField) {
      const wahl = feld.choices ?? feld.options?.choices;
      if (wahl) {
        const werte = Array.isArray(wahl) ? wahl : Object.keys(wahl);
        return el("select", { name }, werte.map((w) => el("option", { value: w, selected: w === wert, text: w })));
      }
      return el("input", { type: "text", name, value: wert ?? "" });
    }
    if (feld instanceof F.SchemaField) {
      return el("span", { class: "mg-gruppe" }, Object.entries(wert ?? {}).map(([k, v]) =>
        el("label", {}, `${k} `, el("input", { type: "number", name: `${name}.${k}`, value: v ?? "" }))));
    }
    return el("span", { text: detailText(schluessel, wert) || "–" });
  }

  _replaceHTML(result, content) {
    content.replaceChildren(result);
  }
}
