// Charakterbogen des Abenteurers, abgeleitet aus den M5-Datenblättern (Figuren-, Abenteurer-
// und Zauberblatt), aufgeteilt in Reiter. Die Übersicht entspricht dem Abenteurerblatt.
// Solange das Erschaffungs- und Lernwerkzeug einen Charakter verwaltet, sind die von ihm
// berechneten Werte hier schreibgeschützt; geändert werden sie im Reiter „Erschaffung & Lernen“.
import { EIGENSCHAFTEN, EIGENSCHAFT_NAMEN, ZAUBERGRUPPEN, bonus, vz, gradAus, abTabelle } from "./regeln.mjs";
import { ausWerkzeug } from "./akteur.mjs";
import { SYSTEM_ID } from "./kategorien.mjs";
import { KompendiumBrowser } from "./browser.mjs";
import { erfolgswurf, pruefwurf } from "./wuerfe.mjs";
import { angreifen } from "./kampf.mjs";

const { ActorSheetV2 } = foundry.applications.sheets;
const SPEICHER_VERZOEGERUNG = 400;

const el = (tag, attrs = {}, ...kinder) => {
  const e = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs ?? {})) {
    if (v === undefined || v === null || v === false) continue;
    if (k === "text") e.textContent = v;
    else if (k === "class" && Array.isArray(v)) e.className = v.filter(Boolean).join(" ");
    else if (k.startsWith("on") && typeof v === "function") e.addEventListener(k.slice(2), v);
    else e.setAttribute(k, v === true ? "" : v);
  }
  for (const k of kinder.flat(Infinity)) if (k !== null && k !== undefined && k !== false) e.append(k);
  return e;
};
const karte = (titel, klasse, ...inhalt) => el("section", { class: ["karte", klasse] }, titel ? el("h3", { text: titel }) : null, ...inhalt);
const zahlText = (w) => (w === null || w === undefined || w === "" ? "–" : String(w));
const fmt = (n) => Number(n || 0).toLocaleString("de-DE");

export const REITER = [
  { id: "uebersicht", titel: "Übersicht" },
  { id: "fertigkeiten", titel: "Fertigkeiten" },
  { id: "kampf", titel: "Kampf" },
  { id: "zauber", titel: "Zauber", nur: (s, items) => s.abgeleitet.kannZaubern || items.some((i) => i.type === "zauber") },
  { id: "ausruestung", titel: "Ausrüstung" },
  { id: "persoenlich", titel: "Persönliches" },
  { id: "entwicklung", titel: "Entwicklung" },
  { id: "werkzeug", titel: "Erschaffung & Lernen" },
];

export class AbenteurerBogen extends ActorSheetV2 {
  static DEFAULT_OPTIONS = {
    classes: ["midgard-abenteurer"],
    position: { width: 1000, height: 820 },
    window: { resizable: true },
    form: { submitOnChange: false, closeOnSubmit: false },
  };

  #reiter = "uebersicht";
  #werkzeug = null;        // Instanz des Erschaffungswerkzeugs (bleibt über Neuzeichnen erhalten)
  #werkzeugWurzel = null;
  #timer = null;
  #ausstehend = null;      // [zustand, auswertung], noch nicht geschrieben
  #veraltet = false;       // Werkzeug hat geschrieben, übrige Reiter noch nicht neu gezeichnet
  #abgeglichen = false;
  #startZustand = null;

  get #verwaltet() { return !!this.actor.system.zustand; }

  // ---------------------------------------------------------------- Aufbau
  async _renderHTML() {
    const actor = this.actor, s = actor.system, items = [...actor.items];
    // Zustand von außen geändert (z. B. PP aus einem Würfelwurf): Werkzeug mit dem neuen Stand neu starten
    if (this.#werkzeug && !this.#ausstehend && s.zustand && s.zustand !== JSON.stringify(this.#werkzeug.zustand())) {
      this.#werkzeug = null;
      this.#werkzeugWurzel = null;
    }
    const reiter = REITER.filter((r) => !r.nur || r.nur(s, items));
    if (!reiter.some((r) => r.id === this.#reiter)) this.#reiter = "uebersicht";
    const wurzel = el("div", { class: ["ma-wurzel", "midgard-cmt", this.#verwaltet && "verwaltet"] });
    wurzel.append(this.#kopf(), el("nav", { class: "ma-reiter", role: "tablist" }, reiter.map((r) =>
      el("button", { type: "button", role: "tab", "data-reiter": r.id, class: r.id === this.#reiter ? "aktiv" : null, "aria-selected": String(r.id === this.#reiter), text: r.titel, onclick: () => this.#wechseln(r.id) }))));
    const inhalt = el("div", { class: "ma-inhalt" });
    for (const r of reiter) {
      const panel = el("div", { class: ["ma-panel", r.id === this.#reiter && "aktiv"], "data-panel": r.id, role: "tabpanel" });
      panel.append(...[].concat(await this[`_${r.id}`]?.(s, items) ?? []));
      inhalt.append(panel);
    }
    wurzel.append(inhalt);
    return wurzel;
  }

  _replaceHTML(result, content) {
    const alt = content.querySelector(".ma-inhalt");
    const scroll = alt ? alt.scrollTop : 0;
    content.replaceChildren(result);
    const neu = content.querySelector(".ma-inhalt");
    if (neu) neu.scrollTop = scroll;
  }

  async _onRender(context, options) {
    await super._onRender(context, options);
    const w = this.element;
    if (!w.dataset.midgardEreignisse) {
      w.dataset.midgardEreignisse = "1";
      // Der Bogen ist ein <form>: Enter darf nichts absenden
      w.addEventListener("submit", (ev) => { ev.preventDefault(); ev.stopImmediatePropagation(); }, { capture: true });
      w.addEventListener("change", (ev) => this.#feldGeaendert(ev));
      w.addEventListener("dragover", (ev) => ev.preventDefault());
      w.addEventListener("drop", (ev) => this.#ablegen(ev));
      w.addEventListener("click", (ev) => this.#wurfKlick(ev));
    }
    // Ältere Charaktere (nur Werkzeug-Zustand) einmal je Öffnen in die Bogenwerte übernehmen
    if (!this.#abgeglichen && this.#verwaltet && this.isEditable && this.#werkzeug) {
      this.#abgeglichen = true;
      const zustand = this.#werkzeug.zustand();
      await ausWerkzeug(this.actor, this.#werkzeug.auswertung(), zustand);
      this.render();
    }
  }

  #wechseln(id) {
    this.#reiter = id;
    if (id === "werkzeug" && !this.#werkzeugWurzel) { this.render(); return; }
    if (this.#veraltet && id !== "werkzeug") { this.#veraltet = false; this.render(); return; }
    for (const b of this.element.querySelectorAll(".ma-reiter button")) { const an = b.dataset.reiter === id; b.classList.toggle("aktiv", an); b.setAttribute("aria-selected", String(an)); }
    for (const p of this.element.querySelectorAll(".ma-panel")) p.classList.toggle("aktiv", p.dataset.panel === id);
  }

  // ---------------------------------------------------------------- Eingaben
  /** Eingabefeld für einen Pfad im Akteur; schreibgeschützt, wenn das Werkzeug ihn verwaltet. */
  #feld(pfad, wert, { typ = "text", werkzeug = false, klasse, breite, auswahl, platzhalter } = {}) {
    const gesperrt = !this.isEditable || (werkzeug && this.#verwaltet);
    if (gesperrt) return el("span", { class: ["ma-wert", klasse], text: zahlText(wert), title: werkzeug && this.#verwaltet ? "wird im Reiter „Erschaffung & Lernen“ verwaltet" : null });
    if (auswahl) {
      return el("select", { "data-pfad": pfad, class: klasse }, auswahl.map(([w, t]) => el("option", { value: w, selected: String(w) === String(wert ?? ""), text: t })));
    }
    return el("input", { type: typ, "data-pfad": pfad, value: wert ?? "", class: klasse, style: breite ? `width:${breite}` : null, placeholder: platzhalter, "aria-label": pfad.split(".").pop() });
  }

  async #feldGeaendert(ev) {
    const t = ev.target;
    if (t.closest(".ma-werkzeug")) return; // Eingaben des eingebetteten Werkzeugs
    const pfad = t.dataset.pfad;
    if (!pfad || !this.isEditable) return;
    let wert = t.type === "checkbox" ? t.checked : t.value;
    if (t.type === "number") wert = t.value === "" ? null : Number(t.value);
    const id = t.dataset.item;
    if (id) await this.actor.items.get(id)?.update({ [pfad]: wert });
    else await this.actor.update({ [pfad]: wert });
  }

  #vorratAendern(pfad, delta) {
    const v = foundry.utils.getProperty(this.actor, pfad);
    const max = foundry.utils.getProperty(this.actor, pfad.replace(/\.wert$/, ".max"));
    const neu = Math.max(0, Math.min(max || Infinity, (v || 0) + delta));
    return this.actor.update({ [pfad]: neu });
  }

  // ---------------------------------------------------------------- Würfe
  async #wurfKlick(ev) {
    const z = ev.target.closest("[data-wurf]");
    if (!z || z.closest(".ma-werkzeug")) return;
    ev.preventDefault();
    ev.stopPropagation();
    if (!this.actor.isOwner) return ui.notifications.warn("Nur wer diese Figur führt, kann für sie würfeln.");
    const a = this.actor, s = a.system, d = s.abgeleitet, ohneDialog = ev.shiftKey;
    const item = z.dataset.item ? a.items.get(z.dataset.item) : null;
    switch (z.dataset.wurf) {
      case "pw": return pruefwurf(a, { titel: EIGENSCHAFT_NAMEN[z.dataset.eig], wert: s.eigenschaften[z.dataset.eig], ohneDialog });
      case "abwehr": {
        let mod = 0; const h = [];
        for (const x of d.kampfAbzuege) { mod += x.wert; h.push(`${vz(x.wert)} ${x.grund}`); }
        if (d.verteidigungswaffe !== null) h.push(`Verteidigungswaffe ${vz(d.verteidigungswaffe)} hier nicht eingerechnet; bei Angriffen aus dem Chat automatisch.`);
        return erfolgswurf(a, { art: "WW", titel: "Abwehr", wert: d.abwehr, mod, hinweise: h, gegnerFragen: true, ohneDialog });
      }
      case "resG": return erfolgswurf(a, { art: "WW", titel: "Resistenz (Geist)", wert: d.resistenzGeist, gegnerFragen: true, ohneDialog });
      case "resK": return erfolgswurf(a, { art: "WW", titel: "Resistenz (Körper)", wert: d.resistenzKoerper, gegnerFragen: true, ohneDialog });
      case "zaubern": return erfolgswurf(a, { titel: "Zaubern", wert: d.zaubern, ohneDialog, hinweise: ["Praxispunkte gibt es beim Zaubern eines bestimmten Spruchs (Reiter Zauber)."] });
      case "raufen": return erfolgswurf(a, { titel: "Raufen", wert: d.raufen, ohneDialog });
      case "ungelernt": return erfolgswurf(a, { titel: `${z.dataset.name} (ungelernt)`, wert: Number(z.dataset.wert), ohneDialog });
      case "fertigkeit": {
        if (!item) return;
        const f = d.fertigkeiten.find((x) => x.id === item.id);
        const schwelle = ["Beidhändiger Kampf", "Fechten"].includes(item.name) ? 20 : 16;
        return erfolgswurf(a, { titel: f.name, wert: f.ew, ohneDialog, pp: { schwelle, ziel: { typ: "item", id: item.id }, name: item.name } });
      }
      case "angriff": return angreifen(a, z.dataset.item, { ohneDialog });
      case "zauber": {
        if (!item) return;
        const spezial = s.spezialisierung && s.spezialisierung === item.system.gruppe ? 2 : 0;
        const ap = Number.parseInt(item.system.ap, 10);
        const zusatz = item.system.ap ? `<p class="mk-klein">AP-Verbrauch: ${item.system.ap}${Number.isFinite(ap) && String(ap) === item.system.ap.trim() ? ` <button type="button" data-midgard-aktion="ap" data-ap="${ap}">${ap} AP abziehen</button>` : ""}</p>` : "";
        return erfolgswurf(a, { titel: `Zaubern · ${item.name}`, wert: d.zaubern + spezial, ohneDialog, zusatz,
          hinweise: spezial ? ["+2 Spezialgebiet"] : [], pp: { schwelle: 20, ziel: { typ: "zauber", gruppe: item.system.gruppe }, name: `Zaubern: ${item.system.gruppe}` } });
      }
    }
  }

  // ---------------------------------------------------------------- Ziehen und Ablegen
  async #ablegen(ev) {
    if (ev.target.closest(".ma-werkzeug")) return;
    ev.preventDefault();
    let daten;
    try { daten = JSON.parse(ev.dataTransfer.getData("text/plain")); } catch { return; }
    if (daten?.type !== "Item" || !this.isEditable) return;
    const item = await fromUuid(daten.uuid);
    if (!item || item.parent === this.actor) return;
    const grund = this.#ablehnung(item);
    if (grund) return ui.notifications.warn(grund);
    const s = this.actor.system;
    if (item.type === "rasse" || item.type === "typ") return this.#rasseOderTyp(item);
    const vorhanden = this.actor.items.find((i) => i.type === item.type && i.name === item.name);
    if (vorhanden && item.type === "gegenstand") return vorhanden.update({ "system.anzahl": (vorhanden.system.anzahl || 0) + 1 });
    const neu = item.toObject();
    delete neu._id;
    if (item.type === "waffe") {
      const mangel = Object.entries(item.system.mindest ?? {}).filter(([k, v]) => v && (s.eigenschaften[k] ?? 0) < v);
      if (mangel.length) ui.notifications.warn(`${item.name}: Mindestwerte nicht erfüllt (${mangel.map(([k, v]) => `${k} ${v}`).join(", ")}).`);
    }
    await this.actor.createEmbeddedDocuments("Item", [neu]);
  }

  /**
   * Rasse oder Typ aus dem Kompendium festlegen. Verwaltet das Werkzeug den Charakter, wird die
   * Änderung dort eingetragen, mit denselben Folgen wie bei der Auswahl im Werkzeug: Ein für die
   * neue Rasse unzulässiger Typ entfällt, ein neuer Typ setzt die nach Typ gekauften Fertigkeiten,
   * Waffen und Zauber zurück. Nach Abschluss der Erschaffung geht beides nicht mehr.
   */
  async #rasseOderTyp(item) {
    const a = this.actor;
    if (!this.#verwaltet) {
      const aenderung = item.type === "rasse" ? { "system.rasse": item.name } : { "system.typ": item.system.kuerzel, "system.typName": item.name, "system.typArt": item.system.art };
      // ein schon gestartetes, aber unbenutztes Werkzeug mit den neuen Werten neu vorbelegen
      this.#werkzeug = null; this.#werkzeugWurzel = null;
      return a.update(aenderung);
    }
    if (!game.settings.get(SYSTEM_ID, "kodexImportiert")) return ui.notifications.warn("Bitte erst den Kodex im Kompendium importieren!");
    if (!this.#werkzeug) this.#werkzeugStarten();
    if (this.#werkzeug.auswertung().fertig) return ui.notifications.warn(`${a.name} ist fertig erschaffen; Rasse und Typ lassen sich nicht mehr ändern.`);
    const z = JSON.parse(JSON.stringify(this.#werkzeug.zustand()));
    const K = window.KODEX;
    const D = foundry.applications?.api?.DialogV2;
    const fragen = async (text) => (D ? D.confirm({ window: { title: item.name }, content: `<p>${text}</p>` }) : true);
    if (item.type === "rasse") {
      if (z.rasse === item.name) return;
      if (z.klasse && !K.klassenFuerRasse[item.name].includes(z.klasse)) {
        if (!(await fragen(`${K.klassen[z.klasse].name} ist für ${item.name} nicht erlaubt. Typ und Typauswahl zurücksetzen?`))) return;
        Object.assign(z, { klasse: null, typischWahl: {}, typischSpez: {}, kaeufe: [], waffen: [], zauber: [], typischerZauber: null, spezialwaffen: [], magierSpezial: null });
      }
      z.rasse = item.name;
    } else {
      const k = item.system.kuerzel;
      if (z.klasse === k) return;
      if ((z.kaeufe?.length || z.waffen?.length || z.zauber?.length) && !(await fragen("Ein neuer Typ verwirft die bereits gekauften Fertigkeiten, Waffen und Zauber. Fortfahren?"))) return;
      Object.assign(z, { klasse: k, typischWahl: {}, typischSpez: {}, kaeufe: [], waffen: [], zauber: [], typischerZauber: null, spezialwaffen: [], magierSpezial: null });
    }
    // Werkzeug mit dem geänderten Stand neu starten und die Bogenwerte daraus abgleichen
    await a.update({ "system.zustand": JSON.stringify(z) }, { render: false });
    this.#werkzeug = null; this.#werkzeugWurzel = null;
    this.#werkzeugStarten();
    await ausWerkzeug(a, this.#werkzeug.auswertung(), this.#werkzeug.zustand());
    this.render();
  }

  /** Regelprüfung beim Ablegen. Gibt einen Grund zurück, wenn der Gegenstand nicht passt. */
  #ablehnung(item) {
    const s = this.actor.system;
    const klein = ["Gnom", "Halbling"].includes(s.rasse);
    if (this.#verwaltet && ["fertigkeit", "waffenfertigkeit", "zauber"].includes(item.type)) {
      return `${item.name}: Fertigkeiten und Zauber werden im Reiter „Erschaffung & Lernen“ gelernt.`;
    }
    if (["fertigkeit", "waffenfertigkeit", "zauber", "waffe", "ruestung"].includes(item.type) && this.actor.items.some((i) => i.type === item.type && i.name === item.name)) {
      return `${item.name} ist schon vorhanden.`;
    }
    if (item.type === "zauber" && s.typArt && !s.abgeleitet.kannZaubern) return `${s.typName || "Dieser Typ"} kann nicht zaubern.`;
    if (!this.#verwaltet && item.type === "rasse" && s.typ && !item.system.typen.includes(s.typ)) return `${s.typName} ist für ${item.name} nicht erlaubt.`;
    if (item.type === "typ" && s.rasse && !(window.KODEX.klassenFuerRasse[s.rasse] ?? []).includes(item.system.kuerzel)) return `${item.name} ist für ${s.rasse} nicht erlaubt.`;
    if (item.type === "waffe" && klein && item.system.kleineVerboten) return `${item.name} ist für ${s.rasse} nicht verwendbar (Kodex).`;
    if (item.type === "waffenfertigkeit" && klein && item.system.kleineVerboten) return `${item.name} ist für ${s.rasse} nicht erlernbar (Kodex).`;
    if (item.type === "waffenfertigkeit" && item.system.nurZauberer && s.typArt && s.typArt !== "Z") return `${item.name} können nur Zauberer lernen.`;
    if (item.type === "fertigkeit" && s.rasse === "Elf" && item.system.elfenNie) return `Elfen lernen ${item.name} nie.`;
    return null;
  }

  // ---------------------------------------------------------------- Kopf
  #kopf() {
    const a = this.actor, s = a.system;
    const unter = [s.typName || "Typ?", s.rasse, `Grad ${s.grad}`, s.spezialisierung ? `Spezialisierung ${s.spezialisierung}` : null].filter(Boolean).join(" · ");
    const vorrat = (kurz, pfad, v) => el("div", { class: ["ma-vorrat", `ma-${kurz.toLowerCase()}`] },
      el("span", { class: "ma-vorrat-name", text: kurz }),
      this.isEditable ? el("button", { type: "button", class: "ma-minus", title: `${kurz} −1`, text: "−", onclick: () => this.#vorratAendern(pfad, -1) }) : null,
      el("span", { class: "ma-vorrat-wert" }, this.isEditable ? el("input", { type: "number", "data-pfad": pfad, value: v.wert, "aria-label": `${kurz} aktuell` }) : String(v.wert), el("small", { text: ` / ${zahlText(v.max)}` })),
      this.isEditable ? el("button", { type: "button", class: "ma-plus", title: `${kurz} +1`, text: "+", onclick: () => this.#vorratAendern(pfad, 1) }) : null,
      el("span", { class: "ma-balken" }, el("span", { style: `width:${v.max ? Math.max(0, Math.min(100, (v.wert / v.max) * 100)) : 0}%` })));
    return el("header", { class: "ma-kopf" },
      el("img", { class: "ma-portrait", src: a.img, alt: "", title: this.isEditable ? "Bild ändern" : null, onclick: () => this.#bildWaehlen() }),
      el("div", { class: "ma-kopf-text" },
        this.isEditable && !this.#verwaltet ? el("input", { type: "text", class: "ma-name", "data-pfad": "name", value: a.name, "aria-label": "Name" }) : el("h1", { class: "ma-name", text: a.name }),
        el("p", { class: "ma-unter", text: unter }),
        el("p", { class: "ma-konto" }, el("span", { text: `ES ${fmt(s.es)}` }), el("span", { text: `EP ${fmt(s.ep)}` }), el("span", { text: `Gold ${fmt(s.gold)} GS` }),
          this.#verwaltet ? el("span", { class: "ma-marke", text: "verwaltet", title: "Eigenschaften, Fertigkeiten, Zauber und Konto werden im Reiter „Erschaffung & Lernen“ geändert." }) : null)),
      el("div", { class: "ma-vorraete" }, vorrat("LP", "system.lp.wert", s.lp), vorrat("AP", "system.ap.wert", s.ap),
        el("div", { class: "ma-glueck" },
          el("label", {}, "SG ", this.#feld("system.sg.wert", s.sg.wert, { typ: "number", breite: "3.2em" }), el("small", { text: ` / ${s.sg.max}` })),
          el("label", {}, "GG ", this.#feld("system.gg", s.gg, { typ: "number", breite: "3.2em" })))));
  }

  #bildWaehlen() {
    if (!this.isEditable) return;
    const FP = foundry.applications?.apps?.FilePicker?.implementation ?? globalThis.FilePicker;
    if (!FP) return;
    new FP({ type: "image", current: this.actor.img, callback: (pfad) => this.actor.update({ img: pfad }) }).render(true);
  }

  // ---------------------------------------------------------------- Bausteine
  #eigenschaften(s) {
    const e = s.eigenschaften;
    return el("div", { class: "ma-eigenschaften" },
      EIGENSCHAFTEN.map((k) => el("div", { class: "ma-eig", title: EIGENSCHAFT_NAMEN[k] },
        el("a", { class: "ma-eig-name ma-wurf", "data-wurf": "pw", "data-eig": k, title: `PW:${EIGENSCHAFT_NAMEN[k]}`, text: k }),
        this.#feld(`system.eigenschaften.${k}`, e[k], { typ: "number", werkzeug: true, klasse: "ma-eig-wert" }),
        el("span", { class: "ma-eig-bonus", text: k === "Au" ? "" : vz(bonus(e[k])) }))),
      el("div", { class: "ma-eig", title: "Bewegungsweite" }, el("span", { class: "ma-eig-name", text: "B" }),
        this.#feld("system.b", s.b, { typ: "number", werkzeug: true, klasse: "ma-eig-wert" }),
        el("span", { class: "ma-eig-bonus", text: s.abgeleitet.bEffektiv !== null && s.abgeleitet.bEffektiv !== s.b ? `${s.abgeleitet.bEffektiv} in Rüstung` : "" })));
  }

  #kampfwerte(s) {
    const d = s.abgeleitet, b = d.boni;
    const gross = (name, wert, zusatz, wurf) => el(wurf ? "a" : "div", { class: ["ma-gross", wurf && "ma-wurf"], "data-wurf": wurf, title: wurf ? `${name} würfeln` : null }, el("span", { class: "ma-gross-name", text: name }), el("span", { class: "ma-gross-wert", text: wert }), zusatz ? el("small", { text: zusatz }) : null);
    return el("div", {},
      el("div", { class: "ma-grosswerte" },
        gross("Abwehr", vz(d.abwehr), d.verteidigungswaffe !== null ? `${vz(d.verteidigungswaffe)} mit Verteidigungswaffe` : null, "abwehr"),
        el("div", { class: "ma-gross ma-resistenz" }, el("span", { class: "ma-gross-name", text: "Resistenz" }),
          el("span", { class: "ma-gross-wert" }, el("a", { class: "ma-wurf", "data-wurf": "resG", title: "WW:Resistenz gegen Geistesmagie", text: vz(d.resistenzGeist) }), " / ", el("a", { class: "ma-wurf", "data-wurf": "resK", title: "WW:Resistenz gegen Körpermagie", text: vz(d.resistenzKoerper) })),
          el("small", { text: "Geist / Körper" })),
        gross("Zaubern", d.kannZaubern ? vz(d.zaubern) : "–", d.kannZaubern ? null : "kein Zauberkundiger", d.kannZaubern ? "zaubern" : null),
        gross("Raufen", vz(d.raufen), null, d.raufen !== null ? "raufen" : null)),
      d.kampfAbzuege.length ? el("p", { class: "ma-warnung", text: "Abzüge auf EW:Angriff und WW:Abwehr: " + d.kampfAbzuege.map((a) => `${vz(a.wert)} ${a.grund}`).join("; ") }) : null,
      el("table", { class: "ma-boni" },
        el("thead", {}, el("tr", {}, ["Ausdauer", "Schaden", "Angriff", "Abwehr", "Resistenz", "Zaubern"].map((t) => el("th", { text: t })))),
        el("tbody", {}, el("tr", {}, [vz(b.AusB), vz(b.SchB), vz(b.AnB), vz(b.AbB) + (d.abwehrBonusMitRuestung !== (b.AbB ?? 0) ? ` (${vz(d.abwehrBonusMitRuestung)})` : ""), `${vz(b.ResG)} / ${vz(b.ResK)}`, vz(b.ZauB)].map((t) => el("td", { text: t }))))),
      el("p", { class: "info", text: "Persönliche Boni (Kodex S. 30-33). In Klammern: Abwehrbonus mit der getragenen Rüstung." }));
  }

  #ruestung(s) {
    const r = s.abgeleitet.ruestung;
    return el("div", { class: "ma-ruestung" },
      el("div", { class: "ma-gross" }, el("span", { class: "ma-gross-name", text: "RK" }), el("span", { class: "ma-gross-wert", text: r.kuerzel })),
      el("div", {}, el("strong", { text: r.name }), el("p", { class: "info", text: r.rs
        ? [`Rüstungsschutz ${r.rs} (−${r.rs} LP bei schweren Treffern)`, r.verlust === "alle" ? "kein positiver Abwehrbonus" : Number(r.verlust) ? `Abwehrbonus −${r.verlust}` : null,
          r.metall?.anb ? `Angriffsbonus −${r.metall.anb}` : null, r.metall?.b ? `B −${r.metall.b}` : null, r.metall?.gw ? `Gw −${r.metall.gw}` : null].filter(Boolean).join(", ") + " (Kodex S. 71-73)."
        : "Keine Rüstung getragen. Rüstungen im Reiter „Kampf“ anlegen." })));
  }

  #waffenTabelle(s, nurAusgeruestet) {
    const d = s.abgeleitet;
    const liste = d.waffen.filter((w) => !nurAusgeruestet || w.ausgeruestet);
    const zeilen = liste.map((w) => el("tr", { "data-item-id": w.id },
      el("td", {}, this.#itemName(w)),
      el("td", { class: "zahl" }, w.ew === null || w.vert ? el("span", { text: w.ew === null ? "–" : vz(w.ew) })
        : el("a", { class: "ma-wurf ma-angriff", "data-wurf": "angriff", "data-item": w.id, title: `Angriff mit ${w.name} (Ziel anvisieren)${w.spezialwaffe ? ", Spezialwaffe +2" : ""}`, text: vz(w.ew) })),
      el("td", { text: w.schaden }),
      el("td", { text: w.vert ? "Abwehr" : w.art === "fernkampf" ? "Fern" : "Nah" }),
      nurAusgeruestet ? null : el("td", {}, this.#schalter(w.id, "system.ausgeruestet", w.ausgeruestet, "bereit")),
      nurAusgeruestet ? null : el("td", {}, this.#loeschKnopf(w.id)),
      w.mangel.length || w.ohneFertigkeit ? el("td", { class: "ma-warnung", text: [w.ohneFertigkeit ? "Fertigkeit fehlt" : null, w.mangel.length ? `Mindestwerte: ${w.mangel.join(", ")}` : null].filter(Boolean).join("; ") }) : el("td")));
    if (nurAusgeruestet && d.raufen !== null) zeilen.push(el("tr", {}, el("td", { text: "Raufen" }), el("td", { class: "zahl" }, el("a", { class: "ma-wurf", "data-wurf": "raufen", title: "EW:Raufen", text: vz(d.raufen) })), el("td", { text: "" }), el("td", { text: "Handgemenge" }), el("td")));
    return el("table", { class: "ma-tabelle" },
      el("thead", {}, el("tr", {}, ["Waffe", "EW", "Schaden", "Art", ...(nurAusgeruestet ? [] : ["", ""]), ""].map((t) => el("th", { text: t })))),
      el("tbody", {}, zeilen.length ? zeilen : el("tr", {}, el("td", { colspan: "7", class: "info", text: nurAusgeruestet ? "Keine Waffe bereit. Im Reiter „Kampf“ Waffen bereitlegen." : "Noch keine Waffen. Aus dem Kompendium hierher ziehen." }))));
  }

  #sinne(s) {
    const d = s.abgeleitet;
    return el("p", { class: "ma-sinne" }, d.sinne.map((x) => el("span", {}, `${x.name} `, el("strong", { text: x.wert === null ? "+" : vz(x.wert) }))),
      d.weitereFaehigkeiten.length ? el("span", { class: "info", text: d.weitereFaehigkeiten.map((f) => `${f.name}${f.wert ? vz(f.wert) : ""}`).join(", ") }) : null);
  }

  #itemName(x) {
    return el("a", { class: "ma-item", "data-item-id": x.id, onclick: () => this.actor.items.get(x.id)?.sheet.render({ force: true }) },
      x.img ? el("img", { src: x.img, alt: "" }) : null, x.name);
  }

  #schalter(id, pfad, an, titel) {
    return this.isEditable ? el("input", { type: "checkbox", "data-item": id, "data-pfad": pfad, checked: !!an, title: titel, "aria-label": titel }) : el("span", { text: an ? "ja" : "" });
  }

  #loeschKnopf(id) {
    const item = this.actor.items.get(id);
    if (!this.isEditable || !item || item.getFlag(SYSTEM_ID, "cmt")) return null;
    return el("button", { type: "button", class: "entfernen", title: `${item.name} entfernen`, text: "×", onclick: async () => {
      const D = foundry.applications?.api?.DialogV2;
      const ok = D ? await D.confirm({ window: { title: "Entfernen" }, content: `<p>${item.name} vom Bogen entfernen?</p>` }) : true;
      if (ok) await item.delete();
    } });
  }

  #itemWert(i, pfad, wert) {
    if (!this.isEditable || i.getFlag?.(SYSTEM_ID, "cmt")) return el("span", { text: zahlText(wert) });
    return el("input", { type: "number", "data-item": i.id, "data-pfad": pfad, value: wert ?? 0, class: "ma-klein", "aria-label": pfad });
  }

  // ---------------------------------------------------------------- Reiter
  async _uebersicht(s) {
    const d = s.abgeleitet;
    const fert = d.fertigkeiten;
    // zwei unabhängige Spalten, damit unterschiedlich hohe Karten keine Lücken reißen
    return [
      el("div", { class: "ma-raster-uebersicht" },
        el("div", { class: "ma-spalte" },
          karte("Eigenschaften", "ma-k-eig", this.#eigenschaften(s)),
          karte("Fertigkeiten", "ma-k-fert", fert.length ? el("ul", { class: "ma-fert-kurz" }, fert.map((f) => el("li", {}, this.#itemName(f), el("a", { class: "zahl ma-wurf", "data-wurf": "fertigkeit", "data-item": f.id, title: `EW:${f.name}`, text: vz(f.ew) })))) : el("p", { class: "info", text: "Noch keine Fertigkeiten." }))),
        el("div", { class: "ma-spalte" },
          karte("Kampfwerte", "ma-k-kampf", this.#kampfwerte(s)),
          karte("Rüstung", "ma-k-ruestung", this.#ruestung(s)),
          karte("Bereite Waffen", "ma-k-waffen", this.#waffenTabelle(s, true)))),
      karte("Sinne und angeborene Fähigkeiten", "ma-k-sinne", this.#sinne(s)),
    ];
  }

  async _fertigkeiten(s) {
    const d = s.abgeleitet;
    const items = new Map(this.actor.items.map((i) => [i.id, i]));
    return [
      karte("Gelernte Fertigkeiten", "ma-k-fert", el("table", { class: "ma-tabelle" },
        el("thead", {}, el("tr", {}, ["Fertigkeit", "Leiteig.", "Wert", "Bonus", "EW", "PP", ""].map((t) => el("th", { text: t })))),
        el("tbody", {}, d.fertigkeiten.length ? d.fertigkeiten.map((f) => el("tr", {},
          el("td", {}, this.#itemName(f)), el("td", { text: f.le }),
          el("td", {}, this.#itemWert(items.get(f.id), "system.wert", f.wert)),
          el("td", { class: "zahl", text: vz(f.bonus) }), el("td", { class: "zahl stark" }, el("a", { class: "ma-wurf", "data-wurf": "fertigkeit", "data-item": f.id, title: `EW:${f.name}`, text: vz(f.ew) })),
          el("td", {}, this.#itemWert(items.get(f.id), "system.pp", f.pp)), el("td", {}, this.#loeschKnopf(f.id))))
          : el("tr", {}, el("td", { colspan: "7", class: "info", text: this.#verwaltet ? "Fertigkeiten entstehen im Reiter „Erschaffung & Lernen“." : "Fertigkeiten aus dem Kompendium hierher ziehen." })))),
      el("p", { class: "info", text: "EW = Fertigkeitswert + Bonus der Leiteigenschaft. PP = Praxispunkte." }),
      this.#verwaltet ? null : el("button", { type: "button", onclick: () => KompendiumBrowser.oeffnen("fertigkeiten"), text: "Kompendium: Fertigkeiten" })),
      karte("Ungelernte Fertigkeiten", "ma-k-ungelernt",
        el("p", { class: "info", text: "Erfolgswert ohne Bonus der Leiteigenschaft (Kodex S. 44). Alle übrigen ungelernt +(0), außer Musizieren, Schreiben, Sprache und Lesen von Zauberschrift." }),
        el("ul", { class: "ma-spalten" }, d.ungelernt.map(([n, w]) => el("li", {}, el("a", { class: "ma-wurf", "data-wurf": "ungelernt", "data-name": n, "data-wert": w, title: `EW:${n} ungelernt`, text: `${n} +(${w})` }))))),
      karte("Sinne und angeborene Fähigkeiten", "ma-k-sinne", this.#sinne(s)),
    ];
  }

  async _kampf(s, items) {
    const d = s.abgeleitet;
    const wf = items.filter((i) => i.type === "waffenfertigkeit").sort((a, b) => a.name.localeCompare(b.name, "de"));
    const ruestungen = items.filter((i) => i.type === "ruestung");
    return [
      karte("Kampfwerte", "ma-k-kampf", this.#kampfwerte(s)),
      karte("Waffenfertigkeiten", "ma-k-wf", el("table", { class: "ma-tabelle" },
        el("thead", {}, el("tr", {}, ["Waffenfertigkeit", "Wert", "EW (mit AnB)", "PP", ""].map((t) => el("th", { text: t })))),
        el("tbody", {}, wf.length ? wf.map((w) => el("tr", {},
          el("td", {}, this.#itemName({ id: w.id, img: w.img, name: w.name })),
          el("td", {}, this.#itemWert(w, "system.wert", w.system.wert)),
          el("td", { class: "zahl stark", text: w.system.verteidigung ? "zur Abwehr" : vz(w.system.wert + d.angriffsBonus) }),
          el("td", {}, this.#itemWert(w, "system.pp", w.system.pp)), el("td", {}, this.#loeschKnopf(w.id))))
          : el("tr", {}, el("td", { colspan: "5", class: "info", text: "Keine Waffenfertigkeiten." }))))),
      karte("Waffen", "ma-k-waffen", this.#waffenTabelle(s, false),
        el("p", { class: "info", text: "Spezialwaffen erhalten +2 auf EW:Angriff. Schaden einschließlich Schadensbonus." }),
        el("button", { type: "button", onclick: () => KompendiumBrowser.oeffnen("waffen"), text: "Kompendium: Waffen" })),
      karte("Rüstungen", "ma-k-ruestung", el("table", { class: "ma-tabelle" },
        el("thead", {}, el("tr", {}, ["Rüstung", "RK", "RS", "AbB-Verlust", "getragen", ""].map((t) => el("th", { text: t })))),
        el("tbody", {}, ruestungen.length ? ruestungen.map((r) => el("tr", {},
          el("td", {}, this.#itemName({ id: r.id, img: r.img, name: r.name })), el("td", { text: r.system.kuerzel }), el("td", { class: "zahl", text: r.system.rs }),
          el("td", { text: r.system.abwehrbonusVerlust === "alle" ? "alle" : r.system.abwehrbonusVerlust === "0" ? "–" : `−${r.system.abwehrbonusVerlust}` }),
          el("td", {}, this.#schalter(r.id, "system.getragen", r.system.getragen, "getragen")), el("td", {}, this.#loeschKnopf(r.id))))
          : el("tr", {}, el("td", { colspan: "6", class: "info", text: "Keine Rüstung." })))),
        el("button", { type: "button", onclick: () => KompendiumBrowser.oeffnen("ruestungen"), text: "Kompendium: Rüstungen" })),
    ];
  }

  async _zauber(s, items) {
    const d = s.abgeleitet;
    const zauber = items.filter((i) => i.type === "zauber");
    const kopf = el("div", { class: "ma-grosswerte" },
      el("div", { class: "ma-gross" }, el("span", { class: "ma-gross-name", text: "Zaubern" }), el("span", { class: "ma-gross-wert", text: d.kannZaubern ? vz(d.zaubern) : "–" })),
      s.spezialisierung ? el("div", { class: "ma-gross" }, el("span", { class: "ma-gross-name", text: "Spezialgebiet" }), el("span", { class: "ma-gross-wert klein", text: s.spezialisierung }), el("small", { text: "+2 auf EW:Zaubern" })) : null);
    const pp = el("table", { class: "ma-tabelle ma-zauber-pp" },
      el("thead", {}, el("tr", {}, ZAUBERGRUPPEN.map((g) => el("th", { text: g })))),
      el("tbody", {}, el("tr", {}, ZAUBERGRUPPEN.map((g) => el("td", { class: "zahl", text: s.zauberPP?.[g] ? String(s.zauberPP[g]) : "–" })))));
    const gruppen = ZAUBERGRUPPEN.map((g) => [g, zauber.filter((z) => z.system.gruppe === g).sort((a, b) => a.system.stufe - b.system.stufe || a.name.localeCompare(b.name, "de"))]).filter(([, l]) => l.length);
    const sonstige = zauber.filter((z) => !ZAUBERGRUPPEN.includes(z.system.gruppe));
    if (sonstige.length) gruppen.push(["Sonstige", sonstige]);
    const tabelle = el("table", { class: "ma-tabelle ma-zauberblatt" },
      el("thead", {}, el("tr", {}, ["Zauber", "Stufe", "AP", "Art", "Zauberdauer", "Reichweite", "Wirkungsziel", "Wirkungsbereich", "Wirkungsdauer", "Wirkung", ""].map((t) => el("th", { text: t })))),
      gruppen.map(([g, l]) => el("tbody", {},
        el("tr", { class: "ma-gruppe" }, el("th", { colspan: "11", text: g })),
        l.map((z) => el("tr", {},
          el("td", {}, this.#itemName({ id: z.id, img: z.img, name: z.name }), d.kannZaubern ? el("a", { class: "ma-wurf ma-zauberwurf", "data-wurf": "zauber", "data-item": z.id, title: `EW:Zaubern ${z.name}`, text: "⚄" }) : null), el("td", { class: "zahl", text: z.system.stufe }),
          el("td", { text: z.system.ap }), el("td", { text: z.system.art }), el("td", { text: z.system.zauberdauer }), el("td", { text: z.system.reichweite }),
          el("td", { text: z.system.wirkungsziel }), el("td", { text: z.system.wirkungsbereich }), el("td", { text: z.system.wirkungsdauer }),
          el("td", { class: "ma-wirkung", text: z.system.kurzwirkung || "" }), el("td", {}, this.#loeschKnopf(z.id)))))));
    return [
      karte("Zaubern", "ma-k-zaubern", kopf, el("h4", { text: "Praxispunkte je Gruppe" }), pp),
      karte("Zauberblatt", "ma-k-zauber", zauber.length ? tabelle : el("p", { class: "info", text: this.#verwaltet ? "Zauber entstehen im Reiter „Erschaffung & Lernen“." : "Zauber aus dem Kompendium hierher ziehen." }),
        el("button", { type: "button", onclick: () => KompendiumBrowser.oeffnen("zauber"), text: "Kompendium: Zauber" })),
    ];
  }

  async _ausruestung(s, items) {
    const sachen = items.filter((i) => i.type === "gegenstand");
    const neu = async () => {
      const [doc] = await this.actor.createEmbeddedDocuments("Item", [{ name: "Neuer Gegenstand", type: "gegenstand", img: "icons/svg/item-bag.svg" }]);
      doc?.sheet.render({ force: true });
    };
    return [
      karte("Geld", "ma-k-geld", el("p", {}, "Gold ", this.#feld("system.gold", s.gold, { typ: "number", werkzeug: true, breite: "7em" }), " GS",
        el("span", { class: "info", text: "  (1 GS = 10 SS = 100 KS)" }))),
      karte("Gegenstände", "ma-k-sachen", el("table", { class: "ma-tabelle" },
        el("thead", {}, el("tr", {}, ["Gegenstand", "Anzahl", "kg", "Wirkung, Inhalt, Erläuterung", ""].map((t) => el("th", { text: t })))),
        el("tbody", {}, sachen.length ? sachen.map((g) => el("tr", {},
          el("td", {}, this.#itemName({ id: g.id, img: g.img, name: g.name })),
          el("td", {}, this.#itemWert(g, "system.anzahl", g.system.anzahl)), el("td", { class: "zahl", text: zahlText(g.system.gewicht) }),
          el("td", { text: g.system.kurzwirkung }), el("td", {}, this.#loeschKnopf(g.id))))
          : el("tr", {}, el("td", { colspan: "5", class: "info", text: "Keine Gegenstände." })))),
        el("p", { class: "info", text: `Gesamtgewicht aller Gegenstände, Waffen und Rüstungen: ${s.abgeleitet.gewicht.toLocaleString("de-DE")} kg` }),
        this.isEditable ? el("button", { type: "button", onclick: neu, text: "Gegenstand anlegen" }) : null),
      s.ausruestungText ? karte("Ausrüstung bei Spielbeginn", "ma-k-start", el("p", { class: "vorformatiert", text: s.ausruestungText })) : null,
    ].filter(Boolean);
  }

  async _persoenlich(s) {
    const p = s.persoenlich;
    const zeile = (label, pfad, wert, werkzeug = true) => el("label", { class: "ma-zeile" }, el("span", { text: label }), this.#feld(pfad, wert, { werkzeug }));
    const klassen = Object.entries(window.KODEX.klassen).map(([k, v]) => [k, v.name]);
    const rassen = Object.keys(window.KODEX.rassen).map((r) => [r, r]);
    const typFeld = this.isEditable && !this.#verwaltet
      ? el("select", { "data-typ": "1", onchange: (ev) => { const k = ev.target.value, kl = window.KODEX.klassen[k]; this.actor.update({ "system.typ": k, "system.typName": kl?.name ?? "", "system.typArt": kl?.art ?? "" }); } },
        el("option", { value: "", text: "–" }), klassen.map(([k, n]) => el("option", { value: k, selected: k === s.typ, text: n })))
      : el("span", { class: "ma-wert", text: s.typName || "–" });
    const textbereich = async (titel, pfad, wert) => {
      if (this.isEditable) { const t = el("textarea", { "data-pfad": pfad, rows: "6" }); t.value = wert ?? ""; return karte(titel, null, t); }
      const div = el("div", { class: "ma-text" });
      const TE = foundry.applications?.ux?.TextEditor?.implementation ?? globalThis.TextEditor;
      div.innerHTML = wert ? await TE.enrichHTML(wert, { relativeTo: this.actor }) : "<p>–</p>";
      return karte(titel, null, div);
    };
    return el("div", { class: "ma-raster-zwei" },
      karte("Figur", "ma-k-figur",
        zeile("Spieler/in", "system.spieler", s.spieler),
        el("label", { class: "ma-zeile" }, el("span", { text: "Typ" }), typFeld),
        el("label", { class: "ma-zeile" }, el("span", { text: "Rasse" }), this.#feld("system.rasse", s.rasse, { werkzeug: true, auswahl: rassen })),
        zeile("Grad", "system.grad", s.grad),
        zeile("Spezialisierung", "system.spezialisierung", s.spezialisierung),
        zeile("Stand", "system.persoenlich.stand", p.stand),
        zeile("Heimat", "system.persoenlich.heimat", p.heimat),
        zeile("Glaube", "system.persoenlich.glaube", p.glaube)),
      karte("Körper", "ma-k-koerper",
        zeile("Geburtsdatum", "system.persoenlich.geburtsdatum", p.geburtsdatum, false),
        zeile("Alter", "system.persoenlich.alter", p.alter),
        zeile("Händigkeit", "system.persoenlich.hand", p.hand),
        zeile("Größe", "system.persoenlich.groesse", p.groesse),
        zeile("Gewicht", "system.persoenlich.gewicht", p.gewicht),
        zeile("Gestalt", "system.persoenlich.gestalt", p.gestalt)),
      await textbereich("Besondere Merkmale", "system.merkmale", s.merkmale),
      await textbereich("Notizen und Hintergrund", "system.notizen", s.notizen));
  }

  async _entwicklung(s) {
    const K = window.KODEX;
    const naechster = s.grad + 1;
    const esNaechster = naechster <= 30 ? K.gradES[naechster - 1] : 40000 + (naechster - 30) * 5000;
    const gradNachES = gradAus(s.es);
    const konto = el("div", { class: "ma-grosswerte" },
      el("div", { class: "ma-gross" }, el("span", { class: "ma-gross-name", text: "Grad" }), el("span", { class: "ma-gross-wert", text: s.grad }), gradNachES > s.grad ? el("small", { class: "ma-hinweis", text: `Aufstieg auf Grad ${gradNachES} möglich` }) : null),
      el("div", { class: "ma-gross" }, el("span", { class: "ma-gross-name", text: "Erfahrungsschatz" }), el("span", { class: "ma-gross-wert", text: fmt(s.es) }), el("small", { text: `nächster Grad ab ${fmt(esNaechster)} ES` })),
      el("div", { class: "ma-gross" }, el("span", { class: "ma-gross-name", text: "Erfahrungspunkte" }), el("span", { class: "ma-gross-wert", text: fmt(s.ep) })),
      el("div", { class: "ma-gross" }, el("span", { class: "ma-gross-name", text: "Gold" }), el("span", { class: "ma-gross-wert", text: fmt(s.gold) }), el("small", { text: "GS" })));
    const eingabe = this.#verwaltet ? null : el("div", { class: "ma-zeilen" },
      el("label", { class: "ma-zeile" }, el("span", { text: "ES" }), this.#feld("system.es", s.es, { typ: "number" })),
      el("label", { class: "ma-zeile" }, el("span", { text: "EP" }), this.#feld("system.ep", s.ep, { typ: "number" })),
      el("label", { class: "ma-zeile" }, el("span", { text: "Grad" }), this.#feld("system.grad", s.grad, { typ: "number" })));
    const tabelle = el("table", { class: "ma-tabelle ma-gradtabelle" },
      el("thead", {}, el("tr", {}, ["Grad", "ab ES", "Abwehr/Resistenz", "Zaubern"].map((t) => el("th", { text: t })))),
      el("tbody", {}, Array.from({ length: Math.min(30, Math.max(s.grad + 3, 6)) }, (_, i) => i + 1).map((g) => el("tr", { class: g === s.grad ? "aktiv" : null },
        el("td", { text: g }), el("td", { class: "zahl", text: fmt(K.gradES[g - 1]) }), el("td", { class: "zahl", text: `+${abTabelle(K.abwehrResistenz, g)}` }), el("td", { class: "zahl", text: `+${abTabelle(K.zaubernGrad, g)}` })))));
    const protokoll = (s.protokoll ?? []).length
      ? el("ol", { class: "ma-protokoll" }, s.protokoll.slice(0, 50).map((e) => el("li", {}, el("small", { text: e.zeit ? new Date(e.zeit).toLocaleString("de-DE") : "" }), " ", e.text)))
      : el("p", { class: "info", text: "Noch keine Buchungen." });
    return [
      karte("Erfahrung und Grad", "ma-k-konto", konto, eingabe,
        this.#verwaltet ? el("p", { class: "info" }, "EP ausgeben, Gold zum Lernen nutzen und Grad bestätigen: ", el("a", { onclick: () => this.#wechseln("werkzeug"), text: "Erschaffung & Lernen" })) : null),
      el("div", { class: "ma-raster-zwei" }, karte("Gradtabelle", "ma-k-grad", tabelle), karte("Protokoll", "ma-k-protokoll", protokoll)),
    ];
  }

  async _werkzeug() {
    // Gesperrt, bis der offizielle Kodex importiert ist: Erschaffung und Lernen beruhen auf seinen Regeln
    if (!game.settings.get(SYSTEM_ID, "kodexImportiert")) return this.#werkzeugGesperrt();
    // Das Werkzeug startet erst, wenn der Reiter geöffnet wird oder es den Charakter schon verwaltet
    if (!this.#werkzeugWurzel && (this.#verwaltet || this.#reiter === "werkzeug")) this.#werkzeugStarten();
    if (!this.#werkzeugWurzel) return el("div", { class: "ma-werkzeug-platz" });
    return [
      this.#verwaltet ? null : el("p", { class: "info ma-werkzeug-hinweis", text: "Sobald du hier etwas einträgst, übernimmt das Werkzeug Eigenschaften, Fertigkeiten, Zauber und Konto dieses Charakters. Die übrigen Reiter zeigen dann das Ergebnis." }),
      this.#werkzeugWurzel,
    ];
  }

  #werkzeugGesperrt() {
    return el("div", { class: "ma-sperre" },
      el("div", { class: "ma-sperre-karte karte" },
        el("h3", { text: "Bitte erst den Kodex im Kompendium importieren!" }),
        el("p", { text: "Erschaffung und Lernen rechnen nach den Regeln des Kodex. Sie werden freigeschaltet, sobald der Spielleiter den eigenen Kodex (PDF) über „Regelwerk-PDF importieren“ eingelesen hat. Dieser Hinweis verschwindet dann von selbst." }),
        game.user.isGM ? el("button", { type: "button", class: "haupt", text: "Regelwerk-PDF importieren", onclick: () => game.midgard.pdfImport() }) : el("p", { class: "info", text: "Das erledigt der Spielleiter." })));
  }

  #werkzeugStarten() {
    this.#werkzeugWurzel = el("div", { class: "ma-werkzeug" });
    this.#startZustand = "startet"; // Speicherungen während des Starts nicht übernehmen
    this.#werkzeug = window.MidgardCMT.starte({
      wurzel: this.#werkzeugWurzel,
      modus: "foundry",
      version: game.system.version,
      zustand: this.#zustandLesen(),
      cssUrl: new URL(`systems/${SYSTEM_ID}/styles/cmt.css`, document.baseURI).href,
      speichere: (zustand, auswertung) => this.#vormerken(zustand, auswertung),
    });
    this.#startZustand = JSON.stringify(this.#werkzeug.zustand());
  }

  #zustandLesen() {
    const text = this.actor.system.zustand;
    if (!text) {
      // noch nicht verwaltet: mit den Bogenwerten vorbelegen, die das Werkzeug kennt
      const s = this.actor.system;
      return { name: this.actor.name, spieler: s.spieler, rasse: s.rasse || "Mensch", klasse: s.typ || null, heimat: s.persoenlich.heimat, glaube: s.persoenlich.glaube };
    }
    try { return JSON.parse(text); } catch (fehler) {
      console.error(`${SYSTEM_ID} | Zustand von ${this.actor.name} nicht lesbar`, fehler);
      ui.notifications.error("Midgard: Die gespeicherten Werkzeugdaten dieses Charakters sind beschädigt.");
      return { name: this.actor.name };
    }
  }

  // ---------------------------------------------------------------- Speichern aus dem Werkzeug
  #vormerken(zustand, auswertung) {
    if (!this.isEditable) return;
    // unveränderten Anfangsstand nicht speichern: Öffnen allein macht den Charakter nicht „verwaltet“
    // Speicherung während des Starts ignorieren (der Abgleich in _onRender übernimmt verwaltete Werte)
    if (this.#startZustand === "startet") return;
    if (!this.#verwaltet && JSON.stringify(zustand) === this.#startZustand) return;
    this.#ausstehend = [JSON.parse(JSON.stringify(zustand)), auswertung];
    clearTimeout(this.#timer);
    this.#timer = setTimeout(() => this.#schreiben(), SPEICHER_VERZOEGERUNG);
  }

  async #schreiben() {
    clearTimeout(this.#timer);
    this.#timer = null;
    const offen = this.#ausstehend;
    if (!offen) return;
    this.#ausstehend = null;
    await ausWerkzeug(this.actor, offen[1], offen[0]);
    this.#veraltet = true;
  }

  /** Neuzeichnen durch Foundry (z. B. nach eigener Speicherung) nicht mitten in die Werkzeugeingabe. */
  render(options, _options) {
    if (this.#reiter === "werkzeug" && this.rendered && this.element?.querySelector(".ma-werkzeug")?.contains(document.activeElement)) {
      this.#veraltet = true;
      return this;
    }
    return super.render(options, _options);
  }

  async _preClose(options) {
    await this.#schreiben();
    return super._preClose?.(options);
  }
}
