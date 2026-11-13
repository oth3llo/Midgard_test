// Charakterbogen des Abenteurers, abgeleitet aus den M5-Datenblättern (Figuren-, Abenteurer-
// und Zauberblatt), aufgeteilt in Reiter. Die Übersicht entspricht dem Abenteurerblatt.
// Solange das Erschaffungs- und Lernwerkzeug einen Charakter verwaltet, sind die von ihm
// berechneten Werte hier schreibgeschützt; geändert werden sie im Reiter „Erschaffung & Lernen“.
import { EIGENSCHAFTEN, EIGENSCHAFT_NAMEN, ZAUBERGRUPPEN, ZUSTAENDE, bonus, vz, gradAus, abTabelle, wuerfelName } from "./regeln.mjs";
import { ausWerkzeug } from "./akteur.mjs";
import { SYSTEM_ID } from "./kategorien.mjs";
import { KompendiumBrowser } from "./browser.mjs";
import { erfolgswurf, pruefwurf, nachricht, esc } from "./wuerfe.mjs";
import { angreifen } from "./kampf.mjs";
import { bildPfad, slug } from "./bilder.mjs";
import { exportOeffnen } from "./export.mjs";

const { ActorSheetV2 } = foundry.applications.sheets;
const SPEICHER_VERZOEGERUNG = 400;

const el = (tag, attrs = {}, ...kinder) => {
  const e = document.createElement(tag);
  // Klickbare Links ohne Ziel (Würfe, Einträge) per Tastatur erreichbar machen
  if (tag === "a" && !attrs?.href) { e.setAttribute("tabindex", "0"); e.setAttribute("role", "button"); }
  for (const [k, v] of Object.entries(attrs ?? {})) {
    if (v === undefined || v === null || v === false) continue;
    if (k === "text") e.textContent = v;
    else if (k === "class" && Array.isArray(v)) e.className = v.filter(Boolean).join(" ");
    else if (k.startsWith("on") && typeof v === "function") e.addEventListener(k.slice(2), v);
    else e.setAttribute(k, v === true ? "" : v);
  }
  for (const k of kinder.flat(Infinity)) if (k !== null && k !== undefined && k !== false) e.append(k);
  // Würfelbare Werte sichtbar kennzeichnen (kleines Würfelsymbol)
  if (tag === "a" && String(attrs?.class ?? "").includes("ma-wurf") && !e.querySelector("i")) e.append(Object.assign(document.createElement("i"), { className: "fa-solid fa-dice-d20 ma-wuerfelsymbol", ariaHidden: "true" }));
  return e;
};
const karte = (titel, klasse, ...inhalt) => el("section", { class: ["karte", klasse] }, titel ? el("h3", { text: titel }) : null, ...inhalt);
const zahlText = (w) => (w === null || w === undefined || w === "" ? "–" : String(w));
const fmt = (n) => Number(n || 0).toLocaleString("de-DE");
// Geld in GS (Dezimalstellen = SS und KS): 12,35 GS → [12, 3, 5]; Text „12 GS 3 SS 5 KS“
const geldTeile = (gold) => { const ks = Math.round((Number(gold) || 0) * 100); return [Math.floor(ks / 100), Math.floor((ks % 100) / 10), ks % 10]; };
const geldText = (gold) => { const [g, s, k] = geldTeile(gold); return [`${fmt(g)} GS`, s ? `${s} SS` : null, k ? `${k} KS` : null].filter(Boolean).join(" "); };
const icon = (name, klasse = "") => el("i", { class: `fa-solid ${name} ${klasse}`.trim(), "aria-hidden": "true" });

export const REITER = [
  { id: "uebersicht", titel: "Übersicht", icon: "fa-user" },
  { id: "fertigkeiten", titel: "Fertigkeiten", icon: "fa-list-check" },
  { id: "kampf", titel: "Kampf", icon: "fa-shield-halved" },
  { id: "zauber", titel: "Zauber", icon: "fa-wand-sparkles" },
  { id: "ausruestung", titel: "Ausrüstung", icon: "fa-box-open" },
  { id: "persoenlich", titel: "Persönliches", icon: "fa-feather" },
  { id: "entwicklung", titel: "Entwicklung", icon: "fa-chart-line" },
  { id: "werkzeug", titel: "Erschaffung & Lernen", icon: "fa-hammer", werkzeug: true },
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
  #leiste = null;           // Statusleiste über dem Werkzeug

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
    // Das Werkzeug ist kein gleichrangiger Reiter, sondern ein abgesetzter Knopf im Kopf
    wurzel.append(this.#kopf(), el("nav", { class: "ma-reiter", role: "tablist" }, reiter.filter((r) => !r.werkzeug).map((r) =>
      el("button", { type: "button", role: "tab", "data-reiter": r.id, class: r.id === this.#reiter ? "aktiv" : null, "aria-selected": String(r.id === this.#reiter), title: r.titel, onclick: () => this.#wechseln(r.id) },
        this.#reiterSymbol(r), el("span", { text: r.titel })))));
    const inhalt = el("div", { class: "ma-inhalt" });
    for (const r of reiter) {
      const panel = el("div", { class: ["ma-panel", r.id === this.#reiter && "aktiv"], "data-panel": r.id, role: "tabpanel" });
      panel.append(...[].concat(await this[`_${r.id}`]?.(s, items) ?? []).filter((x) => x !== null && x !== undefined && x !== false));
      inhalt.append(panel);
    }
    wurzel.append(inhalt);
    // Kopfzellen über Zahlenspalten ebenfalls rechtsbündig
    for (const t of wurzel.querySelectorAll("table.ma-tabelle")) {
      const zeile = [...t.querySelectorAll("tbody tr")].find((tr) => tr.children.length > 1);
      const koepfe = t.querySelectorAll("thead th");
      if (zeile) [...zeile.children].forEach((td, i) => { if (td.classList.contains("zahl")) koepfe[i]?.classList.add("zahl"); });
    }
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
      // Ablegefläche: beim Ziehen über den Bogen sichtbar, außerhalb des Werkzeugs
      w.addEventListener("dragover", (ev) => { ev.preventDefault(); if (!ev.target.closest?.(".ma-werkzeug") && this.isEditable) w.classList.add("ma-ablage-aktiv"); });
      w.addEventListener("dragleave", (ev) => { if (!w.contains(ev.relatedTarget)) w.classList.remove("ma-ablage-aktiv"); });
      w.addEventListener("drop", (ev) => { w.classList.remove("ma-ablage-aktiv"); this.#ablegen(ev); });
      w.addEventListener("click", (ev) => this.#wurfKlick(ev));
      // Enter und Leertaste lösen Links mit Knopf-Rolle aus (Würfe, Einträge öffnen)
      w.addEventListener("keydown", (ev) => {
        const ziel = ev.target.closest?.('a[role="button"]');
        if (!ziel || ziel.closest(".ma-werkzeug") || (ev.key !== "Enter" && ev.key !== " ")) return;
        ev.preventDefault();
        ziel.dispatchEvent(new MouseEvent("click", { bubbles: true, shiftKey: ev.shiftKey }));
      });
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
    for (const b of this.element.querySelectorAll("button[data-reiter]")) { const an = b.dataset.reiter === id; b.classList.toggle("aktiv", an); b.setAttribute("aria-selected", String(an)); }
    for (const p of this.element.querySelectorAll(".ma-panel")) p.classList.toggle("aktiv", p.dataset.panel === id);
  }

  // ---------------------------------------------------------------- Eingaben
  /** Eingabefeld für einen Pfad im Akteur; schreibgeschützt, wenn das Werkzeug ihn verwaltet. */
  #feld(pfad, wert, { typ = "text", werkzeug = false, klasse, breite, auswahl, platzhalter, nurSL = false } = {}) {
    const gesperrt = !this.isEditable || (werkzeug && this.#verwaltet) || (nurSL && !game.user.isGM);
    if (gesperrt) return el("span", { class: ["ma-wert", klasse], text: zahlText(wert), title: werkzeug && this.#verwaltet ? "wird im Reiter „Erschaffung & Lernen“ verwaltet" : nurSL && !game.user.isGM ? "trägt die Spielleitung ein" : null });
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
    if (!game.user.isGM && ["system.ep", "system.es", "system.pp"].includes(pfad)) return;
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
        if (d.wehrlos) return ui.notifications.warn(`${a.name} ist wehrlos und darf keinen WW:Abwehr würfeln (Kodex S. 71).`);
        const abzuege = d.kampfAbzuege.filter((x) => x.nur !== "angriff");
        let mod = 0; const h = [];
        for (const x of abzuege) { mod += x.wert; h.push(`${vz(x.wert)} ${x.grund}`); }
        if (d.verteidigungswaffe !== null) h.push(`Verteidigungswaffe ${vz(d.verteidigungswaffe)} hier nicht eingerechnet; bei Angriffen aus dem Chat automatisch.`);
        return erfolgswurf(a, { art: "WW", titel: "Abwehr", wert: d.abwehr, mod, hinweise: h, gegnerFragen: true, ohneDialog,
          teile: [["Abwehr (Grad)", d.gradAbwehr], ["Abwehrbonus", d.abwehrBonusMitRuestung]], modTeile: abzuege.map((x) => [x.grund, x.wert]) });
      }
      case "resG": return erfolgswurf(a, { art: "WW", titel: "Resistenz (Geist)", wert: d.resistenzGeist, gegnerFragen: true, ohneDialog, teile: [["Resistenz (Grad)", d.gradAbwehr], ["Resistenzbonus Geist", d.boni.ResG]] });
      case "resK": return erfolgswurf(a, { art: "WW", titel: "Resistenz (Körper)", wert: d.resistenzKoerper, gegnerFragen: true, ohneDialog, teile: [["Resistenz (Grad)", d.gradAbwehr], ["Resistenzbonus Körper", d.boni.ResK]] });
      case "zaubern": return erfolgswurf(a, { titel: "Zaubern", wert: d.zaubern, ohneDialog, hinweise: ["Praxispunkte gibt es beim Zaubern eines bestimmten Spruchs (Reiter Zauber)."], teile: [["Zaubern (Grad)", d.gradZaubern], ["Zauberbonus", d.boni.ZauB]] });
      case "raufen": return erfolgswurf(a, { titel: "Raufen", wert: d.raufen, ohneDialog, teile: [["Raufen", d.raufen]] });
      case "ungelernt": return erfolgswurf(a, { titel: `${z.dataset.name} (ungelernt)`, wert: Number(z.dataset.wert), ohneDialog, teile: [["ungelernt", Number(z.dataset.wert)]] });
      case "fertigkeit": {
        if (!item) return;
        const f = d.fertigkeiten.find((x) => x.id === item.id);
        const schwelle = ["Beidhändiger Kampf", "Fechten"].includes(item.name) ? 20 : 16;
        return erfolgswurf(a, { titel: f.name, wert: f.ew, ohneDialog, pp: { schwelle, ziel: { typ: "item", id: item.id }, name: item.name },
          teile: [["Fertigkeitswert", f.wert], [`Bonus ${f.le}`, f.bonus]] });
      }
      case "angriff": return angreifen(a, z.dataset.item, { ohneDialog });
      case "zauber": {
        if (!item) return;
        const spezial = s.spezialisierung && s.spezialisierung === item.system.gruppe ? 2 : 0;
        const ap = Number.parseInt(item.system.ap, 10);
        const zusatz = item.system.ap ? `<p class="mk-klein">AP-Verbrauch: ${item.system.ap}${Number.isFinite(ap) && String(ap) === item.system.ap.trim() ? ` <button type="button" data-midgard-aktion="ap" data-ap="${ap}">${ap} AP abziehen</button>` : ""}</p>` : "";
        return erfolgswurf(a, { titel: `Zaubern · ${item.name}`, wert: d.zaubern + spezial, ohneDialog, zusatz,
          teile: [["Zaubern (Grad)", d.gradZaubern], ["Zauberbonus", d.boni.ZauB], ["Spezialgebiet", spezial]],
          hinweise: spezial ? ["+2 Spezialgebiet"] : [], pp: { schwelle: 20, ziel: { typ: "zauber", gruppe: item.system.gruppe }, name: `Zaubern: ${item.system.gruppe}` } });
      }
    }
  }

  // ---------------------------------------------------------------- Ziehen und Ablegen
  async #ablegen(ev) {
    // im Werkzeug nur die Ausrüstungskarte (Ablagefläche der Erschaffung)
    if (ev.target.closest(".ma-werkzeug") && !ev.target.closest(".cmt-ablage")) return;
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
    if (vorhanden && item.type === "gegenstand") { await vorhanden.update({ "system.anzahl": (vorhanden.system.anzahl || 0) + 1 }); return this.#nachAblage(item); }
    const neu = item.toObject();
    delete neu._id;
    if (item.type === "waffe") {
      const mangel = Object.entries(item.system.mindest ?? {}).filter(([k, v]) => v && (s.eigenschaften[k] ?? 0) < v);
      if (mangel.length) ui.notifications.warn(`${item.name}: Mindestwerte nicht erfüllt (${mangel.map(([k, v]) => `${k} ${v}`).join(", ")}).`);
    }
    await this.actor.createEmbeddedDocuments("Item", [neu]);
    this.#nachAblage(item);
  }

  /** Nach dem Ablegen in den Reiter wechseln, in dem der Eintrag erscheint, und kurz bestätigen. */
  #nachAblage(item) {
    const reiter = { gegenstand: "ausruestung", waffe: "kampf", ruestung: "kampf", waffenfertigkeit: "kampf", fertigkeit: "fertigkeiten", zauber: "zauber" }[item.type];
    ui.notifications.info(`${this.actor.name}: ${item.name} hinzugefügt.`);
    // während der Erschaffung im Werkzeug bleiben und dessen Liste „Schon auf dem Bogen“ auffrischen
    if (this.#reiter === "werkzeug") { this.#werkzeug?.neuZeichnen?.(); return; }
    if (reiter && reiter !== this.#reiter) this.#wechseln(reiter);
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
      this.#portraitElement(a),
      el("div", { class: "ma-kopf-text" },
        this.isEditable && !this.#verwaltet ? el("input", { type: "text", class: "ma-name", "data-pfad": "name", value: a.name, "aria-label": "Name" }) : el("h1", { class: "ma-name", text: a.name }),
        el("p", { class: "ma-unter", text: unter }),
        el("p", { class: "ma-konto" }, this.#slFeld("es", "ES", s.es), this.#slFeld("ep", "EP", s.ep), el("span", { title: "Geld (1 GS = 10 SS = 100 KS); ändern im Reiter Ausrüstung", text: geldText(s.gold) }),
          this.#verwaltet ? el("span", { class: "ma-marke", title: "Eigenschaften, Fertigkeiten, Zauber und Konto werden mit „Erschaffung & Lernen“ geändert; hier sind sie gesperrt." }, icon("fa-lock"), " vom Werkzeug verwaltet") : null,
          el("button", { type: "button", class: ["ma-werkzeug-knopf", this.#reiter === "werkzeug" && "aktiv"], "data-reiter": "werkzeug", "aria-pressed": String(this.#reiter === "werkzeug"), onclick: () => this.#wechseln("werkzeug") }, icon("fa-hammer"), " Erschaffung & Lernen"),
          el("button", { type: "button", class: "ma-export-knopf", title: "Alle Werte übersichtlich zum Abschreiben in den Papierbogen, geordnet nach Figuren-, Abenteuer- und Zauberblatt", onclick: () => exportOeffnen(this.actor) }, icon("fa-file-export"), " Export"))),
      el("div", { class: "ma-vorraete" }, vorrat("LP", "system.lp.wert", s.lp), vorrat("AP", "system.ap.wert", s.ap),
        el("div", { class: "ma-glueck" },
          el("label", { title: "Schicksalsgunst: 1 SG opfern, um einen eigenen EW, WW oder einen Schadenswurf gegen sich zu wiederholen (Kodex S. 166)" }, el("abbr", { title: "Schicksalsgunst", text: "SG" }), " ", this.#feld("system.sg.wert", s.sg.wert, { typ: "number", breite: "3.2em" }), el("small", { text: ` / ${s.sg.max}` })),
          el("label", { title: "Göttliche Gnade: Eingreifen einer übernatürlichen Macht in Notlagen (Das Arkanum)" }, el("abbr", { title: "Göttliche Gnade", text: "GG" }), " ", this.#feld("system.gg", s.gg, { typ: "number", breite: "3.2em" })),
          // Glückspunkte nur mit der Einstellung (Kodex S. 167)
          game.settings.get(SYSTEM_ID, "glueckspunkte")
            ? el("label", { class: "ma-gp", title: "Glückspunkte: 1 GP für einen Wurf wiederholen, einen Treffer abmildern oder einen Hinweis erhalten (Kodex S. 167)" }, el("abbr", { title: "Glückspunkte", text: "GP" }), " ", this.#feld("system.gp", s.gp, { typ: "number", breite: "3.2em" }))
            : null)));
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

  #kampfwerte(s, { kompakt = false } = {}) {
    const d = s.abgeleitet, b = d.boni;
    const abzugText = (art) => d.kampfAbzuege.filter((a) => a.nur !== (art === "angriff" ? "abwehr" : "angriff")).map((a) => `${vz(a.wert)} ${a.grund}${a.nurNah ? " (nah)" : ""}`).join("; ");
    const gross = (name, wert, zusatz, wurf) => el(wurf ? "a" : "div", { class: ["ma-gross", wurf && "ma-wurf"], "data-wurf": wurf, title: wurf ? `${name} würfeln` : null }, el("span", { class: "ma-gross-name", text: name }), el("span", { class: "ma-gross-wert", text: wert }), zusatz ? el("small", { text: zusatz }) : null);
    return el("div", {},
      el("div", { class: "ma-grosswerte" },
        gross("Abwehr", vz(d.abwehr), d.verteidigungswaffe !== null ? `${vz(d.verteidigungswaffe)} mit Verteidigungswaffe` : null, "abwehr"),
        el("div", { class: "ma-gross ma-resistenz" }, el("span", { class: "ma-gross-name", text: "Resistenz" }),
          el("span", { class: "ma-gross-wert" }, el("a", { class: "ma-wurf", "data-wurf": "resG", title: "WW:Resistenz gegen Geistesmagie", text: vz(d.resistenzGeist) }), " / ", el("a", { class: "ma-wurf", "data-wurf": "resK", title: "WW:Resistenz gegen Körpermagie", text: vz(d.resistenzKoerper) })),
          el("small", { text: "Geist / Körper" })),
        gross("Zaubern", d.kannZaubern ? vz(d.zaubern) : "–", d.kannZaubern ? null : "kein Zauberkundiger", d.kannZaubern ? "zaubern" : null),
        gross("Raufen", vz(d.raufen), null, d.raufen !== null ? "raufen" : null)),
      d.wehrlos ? el("p", { class: "ma-warnung", text: "Wehrlos: kein WW:Abwehr möglich." }) : null,
      abzugText("angriff") ? el("p", { class: "ma-warnung", text: `EW:Angriff: ${abzugText("angriff")}` }) : null,
      abzugText("abwehr") ? el("p", { class: "ma-warnung", text: `WW:Abwehr: ${abzugText("abwehr")}` }) : null,
      kompakt ? null : el("table", { class: "ma-boni" },
        el("thead", {}, el("tr", {}, ["Ausdauer", "Schaden", "Angriff", "Abwehr", "Resistenz", "Zaubern"].map((t) => el("th", { text: t })))),
        el("tbody", {}, el("tr", {}, [vz(b.AusB), vz(b.SchB), vz(b.AnB), vz(b.AbB) + (d.abwehrBonusMitRuestung !== (b.AbB ?? 0) ? ` (${vz(d.abwehrBonusMitRuestung)})` : ""), `${vz(b.ResG)} / ${vz(b.ResK)}`, vz(b.ZauB)].map((t) => el("td", { text: t }))))),
      kompakt ? null : el("p", { class: "info", text: "Persönliche Boni (Kodex S. 30-33). In Klammern: Abwehrbonus mit der getragenen Rüstung." }));
  }

  #zustaende(s) {
    const d = s.abgeleitet;
    const automatisch = [
      d.erschoepft ? { name: "erschöpft", icon: "fa-battery-empty", text: "0 AP: EW:Angriff und WW:Abwehr –4, keine Verteidigungswaffe; Angreifer +4 (Kodex S. 71)." } : null,
      d.belastet ? { name: d.last.stufe === "zu schwer" ? "über Höchstlast" : "schwer belastet", icon: "fa-weight-hanging", text: `${fmt(d.last.kg)} kg über der Normallast von ${d.last.normal} kg: B halbiert, –4 auf Kampf- und Bewegungsfertigkeiten (Kodex S. 58).` } : null,
    ].filter(Boolean);
    // Einstellung „nur anzeigen“: Hinweis statt Verrechnung
    if (!d.automatik) for (const z of automatisch) z.text = `${z.text} Nur Anzeige: wird laut Einstellung nicht verrechnet.`;
    return el("div", { class: "ma-zustaende" },
      el("div", { class: "ma-zustand-knoepfe" }, ZUSTAENDE.map((z) => {
        const an = d.zustaende[z.id];
        return el("button", { type: "button", class: ["ma-zustand", an && "an"], "data-zustand": z.id, "aria-pressed": String(an), title: z.text, disabled: !this.isEditable,
          onclick: () => this.actor.update({ [`system.zustaende.${z.id}`]: !an }) }, icon(z.icon), el("span", { text: z.name }));
      }),
      automatisch.map((z) => el("span", { class: "ma-zustand an automatisch", title: `${z.text} Ergibt sich von selbst.` }, icon(z.icon), el("span", { text: z.name })))),
      el("p", { class: "info", text: "Zustände wirken sich auf Angriffe und Abwehr aus. Wer gerade erschöpft oder belastet ist, sieht es hier von selbst. Beschreibung beim Darüberfahren." }));
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
        : el("a", { class: "ma-wurf ma-angriff", "data-wurf": "angriff", "data-item": w.id, title: `Angriff mit ${w.name} (Ziel anvisieren)${w.spezialwaffe ? ", Spezialwaffe +2" : ""}` },
          el("i", { class: "fa-solid fa-dice-d20", "aria-hidden": "true" }), " ", vz(w.ew))),
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

  /**
   * Geld als Gold-, Silber- und Kupferstücke (1 GS = 10 SS = 100 KS), bearbeitbar für alle, die die Figur führen.
   * Gespeichert wird ein Wert in GS; bei Charakteren aus dem Werkzeug über dessen Zustand und Protokoll.
   */
  #geldFeld(s) {
    const [gs, ss, ks] = geldTeile(s.gold);
    if (!this.isEditable) return el("p", { class: "ma-geld", text: geldText(s.gold) });
    const feld = (wert, name, titel) => el("label", { class: "ma-geld-teil", title: titel }, el("input", { type: "number", min: 0, step: 1, value: wert, "data-geld": name, "aria-label": titel }), el("span", { text: name }));
    const wurzel = el("div", { class: "ma-geld" }, feld(gs, "GS", "Goldstücke"), feld(ss, "SS", "Silberstücke"), feld(ks, "KS", "Kupferstücke"),
      el("span", { class: "info", text: "1 GS = 10 SS = 100 KS. Einkäufe und Belohnungen direkt hier eintragen." }));
    wurzel.addEventListener("change", (ev) => {
      if (!ev.target.dataset.geld) return;
      const wert = (n) => Math.max(0, Math.trunc(Number(wurzel.querySelector(`[data-geld=${n}]`).value) || 0));
      this.#geldSetzen(Math.round((wert("GS") + wert("SS") / 10 + wert("KS") / 100) * 100) / 100);
    });
    return wurzel;
  }

  async #geldSetzen(neu) {
    const a = this.actor, s = a.system;
    if (neu === s.gold) return;
    const text = `Geld ${geldText(s.gold)} → ${geldText(neu)}`;
    if (!s.zustand) return a.update({ "system.gold": neu });
    // vom Werkzeug verwaltet: im Zustand und Protokoll buchen (sonst überschreibt der nächste Abgleich), mit Rückgängig
    const z = JSON.parse(s.zustand);
    z.spiel ??= {}; z.spiel.protokoll ??= [];
    const vorher = JSON.parse(JSON.stringify({ spiel: { ...z.spiel, protokoll: undefined }, eig: z.eig, pAwurf: z.pAwurf, Wkwurf: z.Wkwurf, Au: z.Au, festPA: z.festPA ?? null, festWk: z.festWk ?? null }));
    z.spiel.gold = neu;
    const eintrag = { zeit: new Date().toISOString(), text };
    z.spiel.protokoll.unshift({ ...eintrag, vorher });
    await a.update({ "system.gold": neu, "system.zustand": JSON.stringify(z), "system.protokoll": [eintrag, ...(s.protokoll ?? [])] });
  }

  /** ES oder EP: für die Spielleitung als Eingabe, sonst als Text. */
  #slFeld(art, name, wert, { roh = false } = {}) {
    if (!game.user.isGM || !this.isEditable) return el("span", { text: roh ? zahlText(wert) : `${name} ${fmt(wert)}` });
    const feld = el("input", { type: "number", value: wert ?? 0, class: "ma-sl-feld", "aria-label": name, title: `Spielleitung: ${name} direkt setzen`,
      onchange: (ev) => this.#slKorrektur({ [art]: Number(ev.target.value) || 0 }) });
    return roh ? feld : el("label", { class: "ma-sl-wert" }, `${name} `, feld);
  }

  /**
   * Korrektur der Spielleitung (ES, EP, PP). Verwaltet das Werkzeug den Charakter, wird sie in dessen
   * Zustand und Protokoll gebucht (mit Rückgängig), sonst würde der nächste Abgleich sie überschreiben.
   */
  async #slKorrektur({ es, ep, pp, zauberPP }) {
    if (!game.user.isGM) return;
    const a = this.actor, s = a.system, upd = {}, texte = [];
    let schluessel = null, neuPP = null;
    if (es !== undefined && es !== s.es) { upd["system.es"] = es; texte.push(`ES ${fmt(s.es)} → ${fmt(es)}`); }
    if (ep !== undefined && ep !== s.ep) {
      upd["system.ep"] = ep; texte.push(`EP ${fmt(s.ep)} → ${fmt(ep)}`);
      // mehr EP = erhaltene EP: auch der Erfahrungsschatz steigt (Kodex S. 165); weniger EP ist eine Korrektur
      if (es === undefined && ep > s.ep) { es = (s.es ?? 0) + (ep - s.ep); upd["system.es"] = es; texte.push(`ES ${fmt(s.es)} → ${fmt(es)}`); }
    }
    if (pp && pp.wert !== (pp.item.system.pp ?? 0)) { schluessel = pp.item.getFlag(SYSTEM_ID, "cmt"); neuPP = pp.wert; texte.push(`PP für ${pp.item.name} ${pp.item.system.pp ?? 0} → ${pp.wert}`); }
    if (zauberPP && zauberPP.wert !== (s.zauberPP?.[zauberPP.gruppe] ?? 0)) {
      upd[`system.zauberPP.${zauberPP.gruppe}`] = zauberPP.wert; schluessel = `Z:${zauberPP.gruppe}`; neuPP = zauberPP.wert;
      texte.push(`PP für Zaubern: ${zauberPP.gruppe} ${s.zauberPP?.[zauberPP.gruppe] ?? 0} → ${zauberPP.wert}`);
    }
    if (!texte.length) return;
    if (s.zustand) {
      const z = JSON.parse(s.zustand);
      z.spiel ??= {}; z.spiel.pp ??= {}; z.spiel.protokoll ??= [];
      const vorher = JSON.parse(JSON.stringify({ spiel: { ...z.spiel, protokoll: undefined }, eig: z.eig, pAwurf: z.pAwurf, Wkwurf: z.Wkwurf, Au: z.Au, festPA: z.festPA ?? null, festWk: z.festWk ?? null }));
      if (es !== undefined) z.spiel.es = es;
      if (ep !== undefined) z.spiel.ep = ep;
      if (schluessel) { if (neuPP) z.spiel.pp[schluessel] = neuPP; else delete z.spiel.pp[schluessel]; }
      const eintrag = { zeit: new Date().toISOString(), text: `Spielleitung: ${texte.join(", ")}` };
      z.spiel.protokoll.unshift({ ...eintrag, vorher });
      upd["system.zustand"] = JSON.stringify(z);
      upd["system.protokoll"] = [eintrag, ...(s.protokoll ?? [])];
    }
    if (pp) await pp.item.update({ "system.pp": neuPP });
    await a.update(upd);
    ui.notifications.info(`${a.name}: ${texte.join(", ")}.`);
  }

  #itemWert(i, pfad, wert) {
    const nurSL = pfad === "system.pp" && !game.user.isGM;   // Praxispunkte vergibt die Spielleitung
    // Spielleitung: PP auch bei Einträgen, die das Werkzeug verwaltet (über dessen Zustand gebucht)
    if (pfad === "system.pp" && game.user.isGM && this.isEditable && i.getFlag?.(SYSTEM_ID, "cmt")) {
      return el("input", { type: "number", min: 0, value: wert ?? 0, class: "ma-klein", "aria-label": `PP ${i.name}`, title: "Spielleitung: Praxispunkte setzen",
        onchange: (ev) => this.#slKorrektur({ pp: { item: i, wert: Math.max(0, Number(ev.target.value) || 0) } }) });
    }
    if (!this.isEditable || i.getFlag?.(SYSTEM_ID, "cmt") || nurSL) return el("span", { text: zahlText(wert), title: nurSL ? "Praxispunkte trägt die Spielleitung ein" : null });
    return el("input", { type: "number", "data-item": i.id, "data-pfad": pfad, value: wert ?? 0, class: "ma-klein", "aria-label": pfad });
  }

  // ---------------------------------------------------------------- Reiter
  async _uebersicht(s) {
    const d = s.abgeleitet;
    const fert = d.fertigkeiten;
    // zwei unabhängige Spalten, damit unterschiedlich hohe Karten keine Lücken reißen
    // oben die Eigenschaften in einer Reihe, darunter links Kampf, rechts Zustände und Fertigkeiten
    return [
      karte(null, "ma-k-eig ma-eig-reihe", this.#eigenschaften(s)),
      el("div", { class: "ma-raster-uebersicht" },
        el("div", { class: "ma-spalte" },
          karte("Kampfwerte", "ma-k-kampf", this.#kampfwerte(s, { kompakt: true })),
          karte("Bereite Waffen", "ma-k-waffen", this.#waffenTabelle(s, true)),
          karte("Rüstung", "ma-k-ruestung", this.#ruestung(s))),
        el("div", { class: "ma-spalte" },
          karte("Zustände", "ma-k-zustaende", this.#zustaende(s)),
          karte("Fertigkeiten", "ma-k-fert", fert.length ? el("ul", { class: "ma-fert-kurz" }, fert.map((f) => el("li", {}, this.#itemName(f), el("a", { class: "zahl ma-wurf", "data-wurf": "fertigkeit", "data-item": f.id, title: `EW:${f.name}`, text: vz(f.ew) })))) : el("p", { class: "info", text: "Noch keine Fertigkeiten." })),
          karte("Sinne und angeborene Fähigkeiten", "ma-k-sinne", this.#sinne(s)))),
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
          el("td", { class: "zahl" }, this.#itemWert(items.get(f.id), "system.wert", f.wert)),
          el("td", { class: "zahl", text: vz(f.bonus) }), el("td", { class: "zahl stark" }, el("a", { class: "ma-wurf", "data-wurf": "fertigkeit", "data-item": f.id, title: `EW:${f.name}`, text: vz(f.ew) })),
          el("td", { class: "zahl" }, this.#itemWert(items.get(f.id), "system.pp", f.pp)), el("td", {}, this.#loeschKnopf(f.id))))
          : el("tr", {}, el("td", { colspan: "7", class: "info", text: this.#verwaltet ? "Fertigkeiten entstehen im Reiter „Erschaffung & Lernen“." : "Fertigkeiten aus dem Kompendium hierher ziehen." })))),
      el("p", { class: "info", text: "EW = Fertigkeitswert + Bonus der Leiteigenschaft. PP = Praxispunkte." }),
      this.#verwaltet ? null : el("button", { type: "button", class: "ma-knopf", onclick: () => KompendiumBrowser.oeffnen("fertigkeiten", { neben: this }) }, icon("fa-book-open"), " Kompendium: Fertigkeiten")),
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
          el("td", { class: "zahl" }, this.#itemWert(w, "system.wert", w.system.wert)),
          el("td", { class: "zahl stark", text: w.system.verteidigung ? "zur Abwehr" : vz(w.system.wert + d.angriffsBonus) }),
          el("td", { class: "zahl" }, this.#itemWert(w, "system.pp", w.system.pp)), el("td", {}, this.#loeschKnopf(w.id))))
          : el("tr", {}, el("td", { colspan: "5", class: "info", text: "Keine Waffenfertigkeiten." }))))),
      karte("Waffen", "ma-k-waffen", this.#waffenTabelle(s, false),
        el("p", { class: "info", text: "Spezialwaffen erhalten +2 auf EW:Angriff. Schaden einschließlich Schadensbonus." }),
        el("button", { type: "button", class: "ma-knopf", onclick: () => KompendiumBrowser.oeffnen("waffen", { neben: this }) }, icon("fa-book-open"), " Kompendium: Waffen")),
      karte("Rüstungen", "ma-k-ruestung", el("table", { class: "ma-tabelle" },
        el("thead", {}, el("tr", {}, ["Rüstung", "RK", "RS", "AbB-Verlust", "getragen", ""].map((t) => el("th", { text: t })))),
        el("tbody", {}, ruestungen.length ? ruestungen.map((r) => el("tr", {},
          el("td", {}, this.#itemName({ id: r.id, img: r.img, name: r.name })), el("td", { text: r.system.kuerzel }), el("td", { class: "zahl", text: r.system.rs }),
          el("td", { text: r.system.abwehrbonusVerlust === "alle" ? "alle" : r.system.abwehrbonusVerlust === "0" ? "–" : `−${r.system.abwehrbonusVerlust}` }),
          el("td", {}, this.#schalter(r.id, "system.getragen", r.system.getragen, "getragen")), el("td", {}, this.#loeschKnopf(r.id))))
          : el("tr", {}, el("td", { colspan: "6", class: "info", text: "Keine Rüstung." })))),
        el("button", { type: "button", class: "ma-knopf", onclick: () => KompendiumBrowser.oeffnen("ruestungen", { neben: this }) }, icon("fa-book-open"), " Kompendium: Rüstungen")),
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
      el("tbody", {}, el("tr", {}, ZAUBERGRUPPEN.map((g) => el("td", { class: "zahl" }, game.user.isGM && this.isEditable
        ? el("input", { type: "number", min: 0, value: s.zauberPP?.[g] ?? 0, class: "ma-klein", "aria-label": `PP Zaubern ${g}`, title: "Spielleitung: Praxispunkte setzen",
          onchange: (ev) => this.#slKorrektur({ zauberPP: { gruppe: g, wert: Math.max(0, Number(ev.target.value) || 0) } }) })
        : el("span", { text: s.zauberPP?.[g] ? String(s.zauberPP[g]) : "–" }))))));
    const gruppen = ZAUBERGRUPPEN.map((g) => [g, zauber.filter((z) => z.system.gruppe === g).sort((a, b) => a.system.stufe - b.system.stufe || a.name.localeCompare(b.name, "de"))]).filter(([, l]) => l.length);
    const sonstige = zauber.filter((z) => !ZAUBERGRUPPEN.includes(z.system.gruppe));
    if (sonstige.length) gruppen.push(["Sonstige", sonstige]);
    // Spalte „Wirkung“ nur, wenn mindestens ein Zauber eine Kurzwirkung hat
    const mitWirkung = zauber.some((z) => z.system.kurzwirkung);
    const tabelle = el("table", { class: "ma-tabelle ma-zauberblatt" },
      el("thead", {}, el("tr", {}, ["Zauber", "Stufe", "AP", "Art", "Zauberdauer", "Reichweite", "Wirkungsziel", "Wirkungsbereich", "Wirkungsdauer", ...(mitWirkung ? ["Wirkung"] : []), ""].map((t) => el("th", { text: t })))),
      gruppen.map(([g, l]) => el("tbody", {},
        el("tr", { class: "ma-gruppe" }, el("th", { colspan: mitWirkung ? "11" : "10", text: g })),
        l.map((z) => el("tr", {},
          el("td", {}, this.#itemName({ id: z.id, img: z.img, name: z.name }), d.kannZaubern ? el("a", { class: "ma-wurf ma-zauberwurf", "data-wurf": "zauber", "data-item": z.id, title: `EW:Zaubern ${z.name}`, "aria-label": `EW:Zaubern ${z.name}` }, el("i", { class: "fa-solid fa-dice-d20", "aria-hidden": "true" })) : null), el("td", { class: "zahl", text: z.system.stufe }),
          el("td", { text: z.system.ap }), el("td", { text: z.system.art }), el("td", { text: z.system.zauberdauer }), el("td", { text: z.system.reichweite }),
          el("td", { text: z.system.wirkungsziel }), el("td", { text: z.system.wirkungsbereich }), el("td", { text: z.system.wirkungsdauer }),
          mitWirkung ? el("td", { class: "ma-wirkung", text: z.system.kurzwirkung || "" }) : null, el("td", {}, this.#loeschKnopf(z.id)))))));
    // Zaubermittel, Tränke und Spruchrollen aus dem Gepäck: auch für Abenteurer, die selbst nicht zaubern
    const mittel = items.filter((i) => i.type === "gegenstand" && (i.system.kategorie === "Zaubermittel" || /spruchrolle|trank|elixier|amulett|zauber/i.test(i.name)));
    const mittelKarte = karte("Zaubermittel im Gepäck", "ma-k-zaubermittel", mittel.length
      ? el("ul", { class: "ma-zaubermittel" }, mittel.map((m) => el("li", {}, this.#itemName({ id: m.id, img: m.img, name: m.name }), m.system.anzahl > 1 ? el("span", { class: "ma-anzahl", text: `× ${m.system.anzahl}` }) : null, m.system.kurzwirkung ? el("small", { text: m.system.kurzwirkung }) : null)))
      : el("p", { class: "info", text: "Keine Zaubermittel. Tränke, Spruchrollen und Amulette aus dem Kompendium Ausrüstung erscheinen hier." }),
      el("button", { type: "button", class: "ma-knopf", onclick: () => KompendiumBrowser.oeffnen("gegenstaende", { neben: this }) }, icon("fa-flask"), " Kompendium: Ausrüstung"));
    if (!d.kannZaubern && !zauber.length) {
      return [
        karte("Zaubern", "ma-k-zaubern", el("p", { class: "info", text: s.typName ? `${s.typName} ${s.typArt === "K" ? "ist ein Kämpfer und " : ""}kann nicht zaubern. Zauberwirkungen kommen für diesen Charakter aus Zaubermitteln und Spruchrollen.` : "Sobald ein zauberkundiger Abenteurertyp gewählt ist, stehen hier Zaubern, Praxispunkte je Gruppe und das Zauberblatt." })),
        mittelKarte,
      ];
    }
    return [
      karte("Zaubern", "ma-k-zaubern", kopf, el("h4", { text: "Praxispunkte je Gruppe" }), pp),
      karte("Zauberblatt", "ma-k-zauber", zauber.length ? tabelle : el("p", { class: "info", text: this.#verwaltet ? "Zauber entstehen im Reiter „Erschaffung & Lernen“." : "Zauber aus dem Kompendium hierher ziehen." }),
        el("button", { type: "button", class: "ma-knopf", onclick: () => KompendiumBrowser.oeffnen("zauber", { neben: this }) }, icon("fa-book-open"), " Kompendium: Zauber")),
      mittelKarte,
    ];
  }

  async _ausruestung(s, items) {
    const sachen = items.filter((i) => i.type === "gegenstand");
    const neu = async () => {
      const [doc] = await this.actor.createEmbeddedDocuments("Item", [{ name: "Neuer Gegenstand", type: "gegenstand", img: "icons/svg/item-bag.svg" }]);
      doc?.sheet.render({ force: true });
    };
    return [
      karte("Geld", "ma-k-geld", this.#geldFeld(s)),
      karte("Gegenstände", "ma-k-sachen", el("table", { class: "ma-tabelle" },
        el("thead", {}, el("tr", {}, ["Gegenstand", "Anzahl", "kg", "Wirkung, Inhalt, Erläuterung", ""].map((t) => el("th", { text: t })))),
        el("tbody", {}, sachen.length ? sachen.map((g) => el("tr", {},
          el("td", {}, this.#itemName({ id: g.id, img: g.img, name: g.name })),
          el("td", { class: "zahl" }, this.#itemWert(g, "system.anzahl", g.system.anzahl)), el("td", { class: "zahl", text: zahlText(g.system.gewicht) }),
          el("td", { text: g.system.kurzwirkung }), el("td", {}, this.#loeschKnopf(g.id))))
          : el("tr", {}, el("td", { colspan: "5", class: "info", text: "Keine Gegenstände." })))),
        this.#lastAnzeige(s),
        this.isEditable ? el("div", { class: "ma-knopfreihe" },
          el("button", { type: "button", class: "ma-knopf", onclick: () => KompendiumBrowser.oeffnen("gegenstaende", { neben: this }) }, icon("fa-book-open"), " Kompendium: Ausrüstung"),
          el("button", { type: "button", class: "ma-knopf", onclick: neu }, icon("fa-plus"), " Gegenstand anlegen")) : null,
        this.isEditable ? el("p", { class: "info", text: "Gegenstände aus dem Kompendium hierher ziehen; vorhandene erhöhen die Anzahl." }) : null),
      s.ausruestungText ? karte("Ausrüstung bei Spielbeginn", "ma-k-start", el("p", { class: "vorformatiert", text: s.ausruestungText })) : null,
    ].filter(Boolean);
  }

  #lastAnzeige(s) {
    const l = s.abgeleitet.last;
    if (l.normal === null) return el("p", { class: "info", text: `Getragen: ${fmt(l.kg)} kg. Lastgrenzen erscheinen, sobald die Stärke eingetragen ist.` });
    const proz = (x) => Math.min(100, (x / l.hoechst) * 100);
    const satz = l.stufe === "frei" ? `${fmt(l.kg)} von ${l.normal} kg Normallast`
      : l.stufe === "belastet" ? `${fmt(l.kg)} kg: schwer belastet (B halbiert, –4 auf Kampf und Bewegung); Normallast ${l.normal} kg`
      : `${fmt(l.kg)} kg: über der Höchstlast von ${l.hoechst} kg`;
    return el("div", { class: ["ma-last", `ma-last-${l.stufe.replace(" ", "-")}`] },
      el("div", { class: "ma-last-balken", role: "meter", "aria-valuemin": "0", "aria-valuemax": String(l.hoechst), "aria-valuenow": String(Math.min(l.kg, l.hoechst)), "aria-label": "Last" },
        el("span", { class: "ma-last-fuell", style: `width:${proz(l.kg)}%` }),
        el("span", { class: "ma-last-marke", style: `left:${proz(l.normal)}%`, title: `Normallast ${l.normal} kg` }),
        el("span", { class: "ma-last-marke", style: `left:${proz(l.schwer)}%`, title: `schwere Last ${l.schwer} kg (nicht acht Stunden lang)` })),
      el("p", { class: "info", text: `${satz}. Höchstlast ${l.hoechst} kg (–1 AP je 10 min). Getragene Rüstung zählt nicht mit (Kodex S. 58).` }));
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
      el("div", { class: "ma-gross" }, el("span", { class: "ma-gross-name", text: "Erfahrungsschatz" }), el("span", { class: "ma-gross-wert", text: fmt(s.es) }), el("small", { text: gradNachES > s.grad ? `Grad ${gradNachES} erreicht, Aufstieg noch nicht bestätigt` : `Grad ${naechster} ab ${fmt(esNaechster)} ES` })),
      el("div", { class: "ma-gross" }, el("span", { class: "ma-gross-name", text: "Erfahrungspunkte" }), el("span", { class: "ma-gross-wert", text: fmt(s.ep) })),
      el("div", { class: "ma-gross" }, el("span", { class: "ma-gross-name", text: "Gold" }), el("span", { class: "ma-gross-wert", text: fmt(s.gold) }), el("small", { text: "GS" })));
    const eingabe = this.#verwaltet && !game.user.isGM ? null : el("div", { class: "ma-zeilen" },
      el("label", { class: "ma-zeile" }, el("span", { text: "ES" }), this.#slFeld("es", "ES", s.es, { roh: true })),
      el("label", { class: "ma-zeile" }, el("span", { text: "EP" }), this.#slFeld("ep", "EP", s.ep, { roh: true })),
      this.#verwaltet ? el("p", { class: "info", text: "Spielleitung: Änderungen werden im Protokoll von „Erschaffung & Lernen“ gebucht und lassen sich dort rückgängig machen." })
        : el("label", { class: "ma-zeile" }, el("span", { text: "Grad" }), this.#feld("system.grad", s.grad, { typ: "number" })));
    const tabelle = el("table", { class: "ma-tabelle ma-gradtabelle" },
      el("thead", {}, el("tr", {}, ["Grad", "ab ES", "Abwehr/Resistenz", "Zaubern"].map((t) => el("th", { text: t })))),
      el("tbody", {}, Array.from({ length: Math.min(30, Math.max(s.grad + 3, 6)) }, (_, i) => i + 1).map((g) => el("tr", { class: g === s.grad ? "aktiv" : null },
        el("td", { text: g }), el("td", { class: "zahl", text: fmt(K.gradES[g - 1]) }), el("td", { class: "zahl", text: `+${abTabelle(K.abwehrResistenz, g)}` }), el("td", { class: "zahl", text: `+${abTabelle(K.zaubernGrad, g)}` })))));
    const protokoll = (s.protokoll ?? []).length
      ? el("ol", { class: "ma-protokoll" }, s.protokoll.slice(0, 50).map((e) => el("li", {}, el("small", { text: e.zeit ? new Date(e.zeit).toLocaleString("de-DE") : "" }), " ", e.text)))
      : el("p", { class: "info", text: "Noch keine Buchungen." });
    return [
      karte("Erfahrung und Grad", "ma-k-konto", konto, eingabe,
        this.#verwaltet ? el("p", { class: "info" }, "EP ausgeben, Gold zum Lernen nutzen und Grad bestätigen: ", el("button", { type: "button", class: "ma-knopf", onclick: () => this.#wechseln("werkzeug") }, icon("fa-hammer"), " Erschaffung & Lernen")) : null),
      this.#lernbarKarte(),
      el("div", { class: "ma-raster-zwei" }, karte("Gradtabelle", "ma-k-grad", tabelle), karte("Protokoll", "ma-k-protokoll", protokoll)),
    ].filter(Boolean);
  }

  /**
   * „Jetzt lernbar“: was mit den aktuellen EP und dem Gold bezahlbar ist (aus der Lernliste des Werkzeugs).
   * Ein Klick fragt nach und bucht wie dort; ohne Werkzeug (von Hand angelegte Figur) entfällt die Karte.
   */
  #lernbarKarte() {
    if (!this.#verwaltet || !game.settings.get(SYSTEM_ID, "kodexImportiert")) return null;
    if (!this.#werkzeugWurzel) this.#werkzeugStarten();
    const l = this.#werkzeug?.lernbar?.();
    if (!l) return null;
    const kopf = el("p", { class: "info", text: `Mit ${fmt(l.ep)} EP und ${fmt(l.gold)} GS jetzt lernbar. Ein Klick fragt nach und bucht; Praxispunkte werden zuerst verrechnet. Gold statt EP, Belohnungen und Spruchrollen: „Erschaffung & Lernen“.` });
    if (l.gesperrt) return karte("Jetzt lernbar", "ma-k-lernbar", el("p", { class: "info", text: l.gesperrt }));
    if (!l.gruppen.length) return karte("Jetzt lernbar", "ma-k-lernbar", el("p", { class: "info", text: `Mit ${fmt(l.ep)} EP und ${fmt(l.gold)} GS ist gerade nichts lernbar.` }));
    return karte("Jetzt lernbar", "ma-k-lernbar", kopf, l.gruppen.map((g) => el("div", { class: "ma-lerngruppe" },
      el("h4", { text: `${g.titel} (${g.eintraege.length})` }),
      el("div", { class: "ma-lernbar-liste" }, g.eintraege.map((e) => el("button", { type: "button", class: "ma-lernbar", title: e.weitere ? `weitere ${e.weitere} Stufe(n) bezahlbar, in der Lernliste auf einmal buchbar` : null, onclick: () => e.aktion() },
        el("span", { text: e.titel }), el("small", { text: e.kosten })))))),
      el("button", { type: "button", class: "ma-knopf", onclick: () => { const z = this.#werkzeug?.zustand(); if (z) { z.ansicht = "tabellen"; this.#werkzeug.neuZeichnen(); } this.#wechseln("werkzeug"); } }, icon("fa-list"), " Vollständige Lernliste"));
  }

  async _werkzeug() {
    // Gesperrt, bis der offizielle Kodex importiert ist: Erschaffung und Lernen beruhen auf seinen Regeln
    if (!game.settings.get(SYSTEM_ID, "kodexImportiert")) return this.#werkzeugGesperrt();
    // Das Werkzeug startet erst, wenn der Reiter geöffnet wird oder es den Charakter schon verwaltet
    if (!this.#werkzeugWurzel && (this.#verwaltet || this.#reiter === "werkzeug")) this.#werkzeugStarten();
    if (!this.#werkzeugWurzel) return el("div", { class: "ma-werkzeug-platz" });
    // Freigabe von außen geändert (Spielleitung, Einstellung): Werkzeug mit den neuen Sperren zeichnen
    const sperre = JSON.stringify(this.#sperren());
    if (this.#letzteSperre !== null && sperre !== this.#letzteSperre) this.#werkzeug?.neuZeichnen();
    this.#letzteSperre = sperre;
    this.#leiste = el("div", { class: "ma-werkzeug-leiste", role: "status" }, icon("fa-hammer"), el("span", { class: "ma-werkzeug-stand" }),
      this.#freigabeElement(),
      el("button", { type: "button", class: "ma-knopf", onclick: () => this.#wechseln("uebersicht") }, icon("fa-arrow-left"), " Zurück zum Bogen"));
    this.#leisteAktualisieren(this.#werkzeug.auswertung());
    return [
      this.#leiste,
      this.#verwaltet ? null : el("p", { class: "info ma-werkzeug-hinweis", text: "Sobald du hier etwas einträgst, übernimmt das Werkzeug Eigenschaften, Fertigkeiten, Zauber und Konto dieses Charakters. Die übrigen Reiter zeigen dann das Ergebnis." }),
      this.#werkzeugWurzel,
    ];
  }

  /** Einstellung „Erschaffung freigeben“: muss die Spielleitung den Charakter freigeben? */
  get #freigabePflicht() { return game.settings.get(SYSTEM_ID, "erschaffungFreigabe") === "spielleiter"; }
  get #freigegeben() { return !!this.actor.getFlag?.(SYSTEM_ID, "freigegeben"); }

  /**
   * Sperren für das Werkzeug: Spieler lernen erst nach der Freigabe; danach ist die Erschaffung
   * für sie abgeschlossen. Die Spielleitung darf immer alles.
   */
  #sperren() {
    if (!this.#freigabePflicht || game.user.isGM) return {};
    return this.#freigegeben
      ? { erschaffung: "Die Erschaffung ist von der Spielleitung freigegeben und damit abgeschlossen. Änderungen nimmt die Spielleitung vor." }
      : { lernen: "Lernen und Steigern sind gesperrt, bis die Spielleitung den Charakter freigegeben hat." };
  }

  #freigabeElement() {
    if (!this.#freigabePflicht) return null;
    const frei = this.#freigegeben;
    if (!game.user.isGM) return el("span", { class: ["ma-freigabe", frei ? "frei" : "offen"] }, icon(frei ? "fa-circle-check" : "fa-hourglass-half"), frei ? " freigegeben" : " wartet auf Freigabe");
    return el("button", { type: "button", class: "ma-knopf ma-freigabe-knopf", onclick: async () => {
      await this.actor.setFlag(SYSTEM_ID, "freigegeben", !frei);
      this.#werkzeug?.neuZeichnen();
      ui.notifications.info(`${this.actor.name}: ${frei ? "Freigabe zurückgenommen" : "Charakter freigegeben"}.`);
      this.render();
    } }, icon(frei ? "fa-lock-open" : "fa-stamp"), frei ? " Freigabe zurücknehmen" : " Charakter freigeben");
  }

  #leisteAktualisieren(a) {
    const ziel = this.#leiste?.querySelector(".ma-werkzeug-stand");
    if (!ziel || !a) return;
    ziel.textContent = a.fertig
      ? `Lernen · Grad ${a.grad} · ${fmt(a.ep)} EP · ${fmt(a.gold)} GS verfügbar`
      : `Erschaffung läuft: ${[a.rasse, a.typName].filter(Boolean).join(" · ") || "noch kein Typ gewählt"}. Fertig, sobald Typ, Eigenschaften, LP und AP feststehen.`;
  }

  #werkzeugGesperrt() {
    return el("div", { class: "ma-sperre" },
      el("div", { class: "ma-sperre-karte karte" },
        el("h3", { text: "Bitte erst den Kodex im Kompendium importieren!" }),
        el("p", { text: "Erschaffung und Lernen rechnen nach den Regeln des Kodex. Sie werden freigeschaltet, sobald der Spielleiter den eigenen Kodex (PDF) über „Regelwerk-PDF importieren“ eingelesen hat. Dieser Hinweis verschwindet dann von selbst." }),
        game.user.isGM ? el("button", { type: "button", class: "haupt", text: "Regelwerk-PDF importieren", onclick: () => game.midgard.pdfImport() }) : el("p", { class: "info", text: "Das erledigt der Spielleiter." })));
  }

  #letzteSperre = null;

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
      // Vorgaben aus den Systemeinstellungen
      wuerfelModus: game.settings.get(SYSTEM_ID, "erschaffungWuerfel"),
      methode: game.settings.get(SYSTEM_ID, "erschaffungMethode"),
      wurfMelden: game.settings.get(SYSTEM_ID, "erschaffungChat") ? (w) => this.#wurfMelden(w) : null,
      mindestsumme: game.settings.get(SYSTEM_ID, "hausregelMindestsumme"),
      neuanfaenge: game.settings.get(SYSTEM_ID, "neuanfaenge"),
      sperren: () => this.#sperren(),
      spielleitung: () => game.user.isGM,      // EP und PP nur durch die Spielleitung
      // Ausrüstung bei der Erschaffung: Kompendium neben dem Bogen öffnen, vorhandene Ausrüstung anzeigen
      kompendium: (kat) => KompendiumBrowser.oeffnen(kat, { neben: this }),
      gegenstaende: () => this.actor.items.filter((i) => ["gegenstand", "waffe", "ruestung"].includes(i.type))
        .map((i) => (i.type === "gegenstand" && i.system.anzahl > 1 ? `${i.name} (${i.system.anzahl})` : i.name)),
    });
    this.#startZustand = JSON.stringify(this.#werkzeug.zustand());
  }

  /**
   * Porträt: eigenes Bild des Akteurs, sonst das Rassenporträt passend zum Geschlecht
   * (bilder/rassen/<rasse>-maennlich|weiblich, ohne Geschlecht bilder/rassen/<rasse>).
   * Nur Anzeige; das Bild des Akteurs (Seitenleiste, Token) bleibt unverändert.
   */
  #portraitElement(a) {
    const standard = !a.img || /(^|\/)mystery-man\.svg$/.test(a.img);
    const s = a.system, rasse = slug(s.rasse || "Mensch");
    const geschlecht = /^w/i.test(s.geschlecht ?? "") ? "weiblich" : /^m/i.test(s.geschlecht ?? "") ? "maennlich" : null;
    const ersatz = standard ? ((geschlecht && bildPfad(`rassen/${rasse}-${geschlecht}`)) || bildPfad(`rassen/${rasse}`)) : null;
    return el("img", { class: ["ma-portrait", ersatz && "ma-portrait-rasse"], src: ersatz ?? a.img, alt: "", title: this.isEditable ? (ersatz ? "Rassenporträt (Standard). Klicken, um ein eigenes Bild zu wählen" : "Bild ändern") : null, onclick: () => this.#bildWaehlen() });
  }

  /** Reitersymbol: eigene Grafik (bilder/reiter/<id>), sonst Font Awesome. */
  #reiterSymbol(r) {
    const pfad = bildPfad(`reiter/${r.id}`);
    if (!pfad) return icon(r.icon);
    // absolute Adresse: relative Pfade in CSS-Variablen löst der Browser gegen das Stylesheet auf
    return el("i", { class: "mit-bild", "aria-hidden": "true", style: `--bild: url("${new URL(pfad, document.baseURI).href}")` });
  }

  /** Digitale Würfe des Erschaffungswerkzeugs als Chatkarte. */
  #wurfMelden({ aktion, schritt, wuerfe }) {
    const name = wuerfelName;
    const gruppen = new Map();
    for (const [n, w] of wuerfe) gruppen.set(n, [...(gruppen.get(n) ?? []), w]);
    const zeilen = [...gruppen].map(([n, l]) => `<li><strong>${name(n)}</strong> ${l.join(", ")}</li>`).join("");
    return nachricht(this.actor, `<div class="midgard-karte mk-erschaffung"><header>Erschaffung · ${esc(schritt)}</header>
      <p class="mk-klein">${esc(aktion)}</p><ul class="mk-wuerfe">${zeilen}</ul></div>`, [], { erschaffung: true });
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
    this.#leisteAktualisieren(auswertung);
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
