// Einheitlicher Bogen für alle Gegenstandstypen: einfache Felder sind bearbeitbar,
// verschachtelte Regeldaten (Startlisten, Lerneinheiten usw.) werden nur angezeigt.
import { FELDNAMEN, SYSTEM_ID, detailText } from "./kategorien.mjs";

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
    if (felderListe.children.length) wurzel.append(el("section", { class: "karte mg-werte" }, felderListe));

    const textKarte = el("section", { class: "karte mg-textkarte" });
    if (bearbeitbar || item.system.kurzwirkung) textKarte.append(el("label", { class: "mg-kurz" }, el("span", { text: FELDNAMEN.kurzwirkung }),
      bearbeitbar ? el("input", { type: "text", name: "system.kurzwirkung", value: item.system.kurzwirkung ?? "", placeholder: "ein Satz in eigenen Worten" })
        : el("p", { text: item.system.kurzwirkung })));

    const beschreibung = el("div", { class: "mg-beschreibung" }, el("h3", { text: FELDNAMEN.beschreibung }));
    if (bearbeitbar) {
      const ta = el("textarea", { name: "system.beschreibung", rows: "8" });
      ta.value = item.system.beschreibung ?? "";
      beschreibung.append(ta);
    } else if (item.system.beschreibung) {
      const div = el("div", { class: "mg-text" });
      div.innerHTML = await TextEditorKlasse().enrichHTML(item.system.beschreibung, { relativeTo: item, secrets: item.isOwner });
      beschreibung.append(div);
    } else {
      beschreibung.append(el("p", { class: "mg-leer", text: "Keine Beschreibung hinterlegt." }));
    }
    textKarte.append(beschreibung);
    // eine einzige Fundstelle: steht sie schon im importierten Text, keine zweite Zeile
    const fundstelle = item.getFlag(SYSTEM_ID, "quelle") || item.system.quelle;
    if (fundstelle && !beschreibung.querySelector(".midgard-fundstelle")) textKarte.append(el("p", { class: "mg-fundstelle", text: `Fundstelle: ${fundstelle}` }));
    wurzel.append(textKarte);
    return wurzel;
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
