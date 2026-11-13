// Kompendium-Browser: alle Regeldaten des Systems mit Reitern, Suche, Filtern und Detailansicht.
// Einträge lassen sich auf Bögen und in die Seitenleiste ziehen (Foundry-Format {type, uuid}).
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
  /**
   * @param {string} kat  Kategorie (Reiter)
   * @param {object} o    neben: Bogen, neben dem sich der Browser öffnet (Ziehen und Ablegen auf den Bogen)
   */
  static oeffnen(kat, { neben = null } = {}) {
    const b = (this.#instanz ??= new KompendiumBrowser());
    if (kat && KATEGORIEN[kat]) b.#kat = kat;
    b.#ziel = neben?.actor?.name ?? null;
    const opt = { force: true };
    const pos = neben?.position;
    if (pos && Number.isFinite(pos.left) && Number.isFinite(pos.width)) {
      // rechts neben den Bogen, sonst links davon; Breite an den freien Platz anpassen
      const frei = (globalThis.innerWidth ?? 1600);
      const breite = Math.min(980, Math.max(640, frei - (pos.left + pos.width) - 20));
      const rechts = pos.left + pos.width + 10 + breite <= frei;
      opt.position = { left: rechts ? pos.left + pos.width + 10 : Math.max(0, pos.left - breite - 10), top: pos.top ?? 60, width: breite };
    }
    return b.render(opt);
  }
  #ziel = null;          // Name des Charakters, für den gerade gesucht wird

  #kat = "fertigkeiten";
  #suche = "";
  #filter = {};          // kat -> {feld: Set der gewählten Werte | {von, bis} bei Zahlen}
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
      this.#daten[kat] = []; // Kompendium noch nicht angelegt: nichts anzeigen
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
      for (const [f, w] of Object.entries(filter)) {
        const v = feld(e.system, f);
        if (w instanceof Set) { if (w.size && !w.has(String(v))) return false; }
        else if (w && (Number.isFinite(w.von) || Number.isFinite(w.bis))) {
          if (typeof v !== "number") return false;
          if (Number.isFinite(w.von) && v < w.von) return false;
          if (Number.isFinite(w.bis) && v > w.bis) return false;
        }
      }
      if (!worte.length) return true;
      const heu = normal([e.name, ...def.spalten.map(([f]) => anzeige(feld(e.system, f)))].join(" "));
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
    // gleiche Gestaltung wie der Charakterbogen (Farben, Schrift, Knöpfe)
    const wurzel = el("div", { class: "mb-wurzel midgard-cmt" });
    wurzel.append(this.#reiter(), el("div", { class: "mb-haupt" }, this.#filterleiste(eintraege), el("div", { class: "mb-liste" }), el("aside", { class: "mb-detail" })));
    if (this.#ausKompendium[this.#kat] && !eintraege.length) {
      wurzel.insertBefore(el("p", { class: "mb-hinweis" }, "Dieses Kompendium ist noch leer. Es wird durch den Import der eigenen Regelwerk-PDF gefüllt (Der Kodex, Das Arkanum)",
        game.user.isGM ? [": ", el("button", { type: "button", text: "Regelwerk-PDF importieren", onclick: () => pdfImportStarten() })] : ", das macht der Spielleiter."), wurzel.children[1]);
    }
    if (this.#ziel && eintraege.length) {
      wurzel.insertBefore(el("p", { class: "mb-hinweis mb-ziehen" }, el("i", { class: "fa-solid fa-hand-pointer", "aria-hidden": "true" }), ` Einträge auf den Bogen von ${this.#ziel} ziehen, um sie hinzuzufügen. Gegenstände, die es schon gibt, erhöhen die Anzahl.`), wurzel.children[1]);
    }
    if (!this.#ausKompendium[this.#kat]) {
      wurzel.insertBefore(el("p", { class: "mb-hinweis", text: "Die Kompendien sind in dieser Welt noch nicht angelegt. Das geschieht, sobald ein Spielleiter die Welt öffnet; gefüllt werden sie durch den Import der Regelwerk-PDFs." }), wurzel.children[1]);
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
        type: "button", class: kat === this.#kat ? "aktiv" : null, "data-kat": kat, text: def.label, "aria-pressed": String(kat === this.#kat),
        onclick: () => { this.#kat = kat; this.#auswahl = null; this.render(); },
      })),
      game.user.isGM ? el("button", { type: "button", class: "mb-pdf", title: "Beschreibungen aus Kodex oder Arkanum (eigene PDF) in die Kompendien dieser Welt übernehmen", onclick: () => pdfImportStarten() },
        el("i", { class: "fa-solid fa-file-pdf", "aria-hidden": "true" }), " Regelwerk-PDF importieren") : null);
  }

  /** Filterleiste links: Suche, Schaltflächen je Wert (Mehrfachauswahl), Bereich für Zahlen. */
  #filterleiste(eintraege) {
    const def = KATEGORIEN[this.#kat];
    const filter = (this.#filter[this.#kat] ??= {});
    const neu = () => this.#listeZeichnen(this.element, eintraege);
    const leiste = el("aside", { class: "mb-filterleiste", "aria-label": "Filter" });
    leiste.append(el("input", {
      type: "search", class: "mb-suche", placeholder: "Suchen …", value: this.#suche, "aria-label": "Suchen",
      oninput: (ev) => { this.#suche = ev.target.value; neu(); },
    }));
    for (const [f, label, sort] of def.filter) {
      const werte = [...new Set(eintraege.map((e) => feld(e.system, f)).filter((w) => w !== "" && w !== null && w !== undefined))];
      if (!werte.length) continue;
      werte.sort(sort ?? ((a, b) => anzeige(a).localeCompare(anzeige(b), "de")));
      const gruppe = el("fieldset", { class: "mb-filter", "data-feld": f }, el("legend", { text: label }));
      if (werte.every((w) => typeof w === "number")) {
        // Zahlenbereich, z. B. Stufe 2 bis 4
        const b = (filter[f] ??= { von: NaN, bis: NaN });
        const zahl = (grenze, ph) => el("input", {
          type: "number", "data-feld": f, "data-grenze": grenze, placeholder: String(ph), value: Number.isFinite(b[grenze]) ? String(b[grenze]) : "", "aria-label": `${label} ${grenze}`,
          oninput: (ev) => { b[grenze] = ev.target.value === "" ? NaN : Number(ev.target.value); neu(); },
        });
        gruppe.append(el("div", { class: "mb-bereich" }, zahl("von", werte[0]), el("span", { text: "bis" }), zahl("bis", werte.at(-1))));
      } else {
        const gewaehlt = filter[f] instanceof Set ? filter[f] : (filter[f] = new Set());
        gruppe.append(el("div", { class: "mb-chips" }, werte.map((w) => el("button", {
          type: "button", class: gewaehlt.has(String(w)) ? "mb-chip an" : "mb-chip", "data-feld": f, "data-wert": String(w), "aria-pressed": String(gewaehlt.has(String(w))), text: anzeige(w),
          onclick: (ev) => {
            const an = !gewaehlt.has(String(w));
            if (an) gewaehlt.add(String(w)); else gewaehlt.delete(String(w));
            ev.currentTarget.classList.toggle("an", an);
            ev.currentTarget.setAttribute("aria-pressed", String(an));
            neu();
          },
        }))));
      }
      leiste.append(gruppe);
    }
    leiste.append(el("button", {
      type: "button", class: "mb-zuruecksetzen",
      onclick: () => { this.#suche = ""; this.#filter[this.#kat] = {}; this.render(); },
    }, el("i", { class: "fa-solid fa-filter-circle-xmark", "aria-hidden": "true" }), " Filter leeren"));
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
      el("thead", {}, el("tr", {}, kopf("name", "Name"), def.spalten.map(([f, t]) => { const k = kopf(f, t); if (eintraege.some((e) => typeof feld(e.system, f) === "number")) k.classList.add("zahl"); return k; }))),
      el("tbody", {}, liste.map((e) => el("tr", {
        "data-id": e._id, class: e._id === this.#auswahl ? "gewaehlt" : null, draggable: e.uuid ? "true" : null, tabindex: "0",
        ondragstart: (ev) => ev.dataTransfer.setData("text/plain", JSON.stringify({ type: "Item", uuid: e.uuid })),
        onclick: () => { this.#auswahl = e._id; this.#listeZeichnen(wurzel, eintraege); },
        ondblclick: () => this.#oeffnen(e),
        onkeydown: (ev) => { if (ev.key === "Enter") this.#oeffnen(e); },
      }, el("td", {}, el("span", { class: "mb-name" }, el("img", { src: e.img, alt: "" }), e.name)),
      def.spalten.map(([f, , fmt]) => { const t = (fmt ?? anzeige)(feld(e.system, f)); return el("td", { text: t, title: String(t).length > 14 ? t : null, class: typeof feld(e.system, f) === "number" ? "zahl" : null }); })))));
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
    const zeilen = Object.entries(e.system).filter(([k, v]) => k !== "beschreibung" && v !== "" && v !== null && !(Array.isArray(v) && !v.length) && !(typeof v === "object" && !Array.isArray(v) && !Object.keys(v).length));
    ziel.replaceChildren(...[
      el("h3", {}, el("img", { src: e.img, alt: "" }), e.name),
      e.uuid ? el("button", { type: "button", class: "mb-oeffnen", onclick: () => this.#oeffnen(e) }, el("i", { class: "fa-solid fa-up-right-from-square", "aria-hidden": "true" }), " Öffnen") : null,
      el("dl", {}, zeilen.map(([k, v]) => [el("dt", { text: FELDNAMEN[k] ?? k }), el("dd", { text: detailText(k, v) })])),
      e.system.beschreibung ? (() => {
        // Verweise (@UUID) als anklickbare Links darstellen
        const d = el("div", { class: "mb-beschreibung" });
        const TE = foundry.applications?.ux?.TextEditor?.implementation ?? globalThis.TextEditor;
        Promise.resolve(TE?.enrichHTML ? TE.enrichHTML(e.system.beschreibung) : e.system.beschreibung).then((h) => { d.innerHTML = h; });
        return d;
      })() : null,
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
