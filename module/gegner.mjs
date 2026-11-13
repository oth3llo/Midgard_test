// Gegner: Tiere, Fabelwesen und Nichtspielerfiguren mit Spieldaten wie im Kodex-Bestiarium
// (Grad, LP/AP als Würfelformel, RK, Gf, St/Gw/In, B, Abwehr, Resistenz, Angriffe, Raufen).
// Die abgeleiteten Werte haben dieselbe Form wie beim Abenteurer, damit Angriffe auf Gegner und
// Angriffe von Gegnern über module/kampf.mjs laufen (Ziel anvisieren, WW:Abwehr, Schaden).
import { ZUSTAENDE, vz, schadensFormel, wNotation } from "./regeln.mjs";
import { SYSTEM_ID } from "./kategorien.mjs";
import { erfolgswurf, esc } from "./wuerfe.mjs";
import { angreifen } from "./kampf.mjs";
import { angriffeZerlegen } from "./pdf/bestiarium.mjs";
import KOMPENDIUM from "../daten/kompendium.js";

const F = () => foundry.data.fields;
const text = () => new (F().StringField)({ required: true, blank: true, initial: "" });
const zahl = (initial = 0) => new (F().NumberField)({ required: true, nullable: false, integer: true, initial });
const zahlOderLeer = () => new (F().NumberField)({ required: false, nullable: true, integer: true, initial: null });
const vorrat = () => new (F().SchemaField)({ wert: zahl(0), max: zahl(0) });

// Rüstungsschutz nach Rüstklasse aus dem Datensatz (OR 0, TR 1, LR 2 …); „VR/LR“ zählt die erste
const RS = Object.fromEntries((KOMPENDIUM.kategorien.ruestungen ?? []).map((r) => [r.system.kuerzel, r.system.rs]));
export const rsVon = (rk) => RS[String(rk ?? "").split("/")[0].trim()] ?? 0;

export function einstellungenRegistrieren() {
  game.settings.register(SYSTEM_ID, "gegnerAuswuerfeln", {
    name: "Gegner: LP und AP beim Platzieren würfeln",
    hint: "Jeder Gegner-Token, der neu auf die Szene kommt (nicht verknüpft), erhält eigene LP und AP nach der Würfelformel seiner Spieldaten (Kodex S. 182). Aus: Durchschnittswerte.",
    scope: "world", config: true, type: Boolean, default: true,
  });
}

export class GegnerDaten extends foundry.abstract.TypeDataModel {
  static defineSchema() {
    const f = F();
    return {
      art: text(), grad: zahl(0), gf: zahlOderLeer(), quelle: text(),
      // Auftritt im Abenteuer, z. B. „2 Riesenratten“: ein Eintrag je Art, die Anzahl als Hinweis
      auftritt: text(), anzahl: zahlOderLeer(),
      lpFormel: text(), apFormel: text(), lp: vorrat(), ap: vorrat(),
      rk: new f.StringField({ required: true, blank: true, initial: "OR" }),
      eigenschaften: new f.SchemaField({ St: text(), Gw: text(), In: text() }),
      b: text(),
      abwehr: zahlOderLeer(), resistenzGeist: zahlOderLeer(), resistenzKoerper: zahlOderLeer(), schb: zahlOderLeer(),
      angriffe: new f.ArrayField(new f.ObjectField(), { required: true, initial: [] }),
      raufen: new f.ObjectField({ required: true, initial: {} }),
      faehigkeiten: new f.ArrayField(new f.StringField({ blank: true }), { required: true, initial: [] }),
      zustaende: new f.SchemaField(Object.fromEntries(["liegend", "geblendet", "ueberrascht", "wehrlos"].map((k) => [k, new f.BooleanField({ required: true, initial: false })]))),
      beschreibung: new f.HTMLField({ required: true, blank: true, initial: "" }),
      notizen: new f.HTMLField({ required: true, blank: true, initial: "" }),
    };
  }

  prepareDerivedData() {
    this.abgeleitet = gegnerAbleiten(this);
  }
}

/** Abgeleitete Werte in der Form des Abenteurers (für kampf.mjs und die Würfe). */
export function gegnerAbleiten(s) {
  const r = {};
  r.ohneLP = /^\*$/.test(s.lpFormel.trim());
  r.apUnendlich = /∞/.test(s.apFormel);
  r.ruestung = { name: s.rk, kuerzel: s.rk, rs: rsVon(s.rk) };
  r.abwehr = s.abwehr ?? 0;
  r.gradAbwehr = r.abwehr;
  r.abwehrBonusMitRuestung = 0;
  r.abwehrTeile = [["Abwehr", r.abwehr]];
  r.resistenzGeist = s.resistenzGeist;
  r.resistenzKoerper = s.resistenzKoerper;
  r.angriffsBonus = 0;
  r.verteidigungswaffe = null;
  r.erschoepft = !r.apUnendlich && s.ap.max > 0 && s.ap.wert <= 0;
  r.kampfAbzuege = [];
  if (r.erschoepft) r.kampfAbzuege.push({ wert: -4, grund: "erschöpft (0 AP)", nurNah: false });
  r.zustaende = Object.fromEntries(ZUSTAENDE.map((z) => [z.id, !!s.zustaende?.[z.id]]));
  for (const z of ZUSTAENDE) {
    if (!r.zustaende[z.id]) continue;
    if (z.angriff) r.kampfAbzuege.push({ wert: z.angriff, grund: z.name, nurNah: !!z.nurNah, nur: "angriff" });
    if (z.abwehr) r.kampfAbzuege.push({ wert: z.abwehr, grund: z.name, nurNah: false, nur: "abwehr" });
  }
  r.wehrlos = r.zustaende.wehrlos;
  r.gegnerZuschlag = (nah, angreiferLiegt) => {
    const gruende = [];
    if (r.erschoepft) gruende.push("erschöpft");
    if (r.wehrlos) gruende.push("wehrlos");
    if (r.zustaende.liegend && nah && !angreiferLiegt) gruende.push("liegt am Boden");
    return gruende.length ? { wert: 4, grund: `Ziel ${gruende.join(", ")}` } : null;
  };
  // Angriffe als „Waffen“ (wie beim Abenteurer), Waffen ohne Schaden mit dem Schadensbonus
  r.waffen = (s.angriffe ?? []).map((a, i) => ({
    id: `a${i}`, name: a.anzahl > 1 ? `${a.anzahl}× ${a.name}` : a.name, grundname: a.name, fertigkeit: a.name, ew: a.ew ?? null, vert: false,
    art: /^(Wurf|Speerschleuder|Bogen|Armbrust|Schleuder)/i.test(a.name) ? "fernkampf" : "nahkampf",
    schaden: a.schaden || (s.schb !== null ? `Waffe ${vz(s.schb)}` : "Waffe"),
    formel: schadensFormel(String(a.formel ?? "").replace(/–/g, "-")),
    ausgeruestet: true, mangel: [], ohneFertigkeit: false, spezialwaffe: false,
  }));
  if (s.raufen?.ew) r.waffen.push({ id: "raufen", name: "Raufen", grundname: "Raufen", fertigkeit: "Raufen", ew: s.raufen.ew, vert: false, art: "nahkampf",
    schaden: s.raufen.schaden ?? "", formel: schadensFormel(String(s.raufen.schaden ?? "").replace(/–/g, "-")), ausgeruestet: true, mangel: [] });
  r.raufen = s.raufen?.ew ?? null;
  return r;
}

/** Durchschnitt einer Formel wie „3W6+2“ oder „30“ (gerundet); null, wenn nicht berechenbar. */
export function durchschnitt(f) {
  const t = String(f ?? "").replace(/–/g, "-").replace(/\s+/g, "");
  if (/^\d+$/.test(t)) return Number(t);
  const m = t.match(/^(\d*)W(\d+)([+-]\d+)?$/i);
  if (!m) return null;
  return Math.max(1, Math.round(Number(m[1] || 1) * (Number(m[2]) + 1) / 2 + Number(m[3] || 0)));
}

/** Würfelformel für Foundry („3W6–1“ → „3d6-1“) oder null. */
const wurfFormel = (f) => {
  const t = String(f ?? "").replace(/–/g, "-").replace(/\s+/g, "");
  return /^\d*W\d+([+-]\d+)?$/i.test(t) ? t.replace(/W/i, "d") : /^\d+$/.test(t) ? t : null;
};

/** LP und AP aus den Formeln: Durchschnitt (würfeln = false) oder gewürfelt; Minimum 1 (Kodex S. 182). */
export async function lpApBestimmen(s, { wuerfeln = false } = {}) {
  const eins = async (formel) => {
    const w = wurfFormel(formel);
    if (!w) return null;
    if (!wuerfeln) return durchschnitt(formel);
    const r = await new Roll(w).evaluate();
    return Math.max(1, r.total);
  };
  const lp = /^\*$/.test(s.lpFormel.trim()) ? 0 : await eins(s.lpFormel);
  let ap = /∞/.test(s.apFormel) ? 0 : /^=\s*LP$/.test(s.apFormel.trim()) ? lp : await eins(s.apFormel);
  return { lp, ap };
}

/** LP und AP eines Gegners neu würfeln und auf das Maximum setzen. */
export async function gegnerAuswuerfeln(actor, { stumm = false } = {}) {
  const { lp, ap } = await lpApBestimmen(actor.system, { wuerfeln: true });
  const upd = {};
  if (lp !== null) Object.assign(upd, { "system.lp.max": lp, "system.lp.wert": lp });
  if (ap !== null) Object.assign(upd, { "system.ap.max": ap, "system.ap.wert": ap });
  if (Object.keys(upd).length) await actor.update(upd);
  if (!stumm) ui.notifications?.info(`${actor.name}: LP ${lp ?? "–"}, AP ${ap === 0 && /∞/.test(actor.system.apFormel) ? "∞" : ap ?? "–"} gewürfelt.`);
  return { lp, ap };
}

/** Neue Gegner-Tokens: eigene LP/AP würfeln (Einstellung), nur beim Spielleiter, der den Token anlegt. */
export function tokenHookEinrichten() {
  Hooks.on("createToken", async (token, _opt, userId) => {
    if (userId !== game.user.id || !game.user.isGM || token.actorLink || token.actor?.type !== "gegner") return;
    if (!game.settings.get(SYSTEM_ID, "gegnerAuswuerfeln")) return;
    await gegnerAuswuerfeln(token.actor, { stumm: true });
  });
}

// ------------------------------------------------------------------ Bogen

const { ActorSheetV2 } = foundry.applications.sheets;
const el = (tag, attrs = {}, ...kinder) => {
  const e = document.createElement(tag);
  if (tag === "a" && !attrs?.href) { e.setAttribute("tabindex", "0"); e.setAttribute("role", "button"); }
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
const icon = (n) => el("i", { class: `fa-solid ${n}`, "aria-hidden": "true" });
const t = (w) => (w === null || w === undefined || w === "" ? "–" : String(w));

export class GegnerBogen extends ActorSheetV2 {
  static DEFAULT_OPTIONS = {
    classes: ["midgard-abenteurer", "midgard-gegner"],
    position: { width: 640, height: 760 },
    window: { resizable: true },
    form: { submitOnChange: false, closeOnSubmit: false },
  };

  #bearbeiten = false;

  async _renderHTML() {
    const a = this.actor, s = a.system, d = s.abgeleitet;
    const darf = this.isEditable;
    const wurzel = el("div", { class: ["ma-wurzel", "midgard-cmt", "mg-wurzel"] });
    const vorrat = (kurz, pfad, v, unendlich) => el("div", { class: ["ma-vorrat", `ma-${kurz.toLowerCase()}`] },
      el("span", { class: "ma-vorrat-name", text: kurz }),
      unendlich ? el("span", { class: "ma-vorrat-wert", text: "∞" }) : [
        darf ? el("button", { type: "button", class: "ma-minus", text: "−", title: `${kurz} −1`, onclick: () => a.update({ [pfad]: Math.max(-10, v.wert - 1) }) }) : null,
        el("span", { class: "ma-vorrat-wert" }, darf ? el("input", { type: "number", value: v.wert, "aria-label": `${kurz} aktuell`, onchange: (ev) => a.update({ [pfad]: Number(ev.target.value) || 0 }) }) : String(v.wert), el("small", { text: ` / ${v.max}` })),
        darf ? el("button", { type: "button", class: "ma-plus", text: "+", title: `${kurz} +1`, onclick: () => a.update({ [pfad]: v.wert + 1 }) }) : null,
        el("span", { class: "ma-balken" }, el("span", { style: `width:${v.max ? Math.max(0, Math.min(100, (v.wert / v.max) * 100)) : 0}%` }))]);
    const unter = [s.art !== a.name ? s.art : null, `Grad ${s.grad}`, s.gf !== null ? `Gf ${s.gf}` : null, s.quelle].filter(Boolean).join(" · ");
    wurzel.append(el("header", { class: "ma-kopf mg-kopf" },
      el("img", { class: "ma-portrait", src: a.img, alt: "" }),
      el("div", { class: "ma-kopf-text" },
        darf ? el("input", { type: "text", class: "ma-name", value: a.name, "aria-label": "Name", onchange: (ev) => a.update({ name: ev.target.value }) }) : el("h1", { class: "ma-name", text: a.name }),
        el("p", { class: "ma-unter", text: unter }),
        s.auftritt ? el("p", { class: "mg-auftritt", title: "Für jeden Gegner einen eigenen Token auf die Szene ziehen" }, icon("fa-users"), ` Im Abenteuer: ${s.auftritt}`) : null,
        el("p", { class: "mg-formeln", text: `LP ${t(s.lpFormel)} · AP ${t(s.apFormel)}` },
          darf ? el("button", { type: "button", class: "ma-knopf mg-wuerfeln", title: "LP und AP nach der Formel neu würfeln", onclick: () => gegnerAuswuerfeln(a) }, icon("fa-dice"), " LP/AP würfeln") : null,
          game.user.isGM ? el("button", { type: "button", class: "ma-knopf", "aria-pressed": String(this.#bearbeiten), onclick: () => { this.#bearbeiten = !this.#bearbeiten; this.render(); } }, icon("fa-pen"), this.#bearbeiten ? " Fertig" : " Bearbeiten") : null)),
      el("div", { class: "ma-vorraete" },
        d.ohneLP ? el("div", { class: "ma-vorrat ma-lp" }, el("span", { class: "ma-vorrat-name", text: "LP" }), el("span", { class: "ma-vorrat-wert", text: "keine" })) : vorrat("LP", "system.lp.wert", s.lp),
        vorrat("AP", "system.ap.wert", s.ap, d.apUnendlich))));

    const inhalt = el("div", { class: "ma-inhalt mg-inhalt" });
    if (this.#bearbeiten && game.user.isGM) inhalt.append(this.#bearbeitung(s));
    else {
      const wurf = (titel, wert, art, typ) => (wert === null || wert === undefined ? el("span", { text: "–" })
        : el("a", { class: "ma-wurf", "data-gwurf": typ, title: `${art}:${titel}`, text: vz(wert) }));
      inhalt.append(...[
        karte("Spieldaten", "mg-werte", el("div", { class: "mg-raster" },
          ...[["St", s.eigenschaften.St], ["Gw", s.eigenschaften.Gw], ["In", s.eigenschaften.In], ["B", s.b], ["RK", `${s.rk}${d.ruestung.rs ? ` (RS ${d.ruestung.rs})` : ""}`]]
            .map(([n, w]) => el("div", { class: "mg-wert" }, el("small", { text: n }), el("strong", { text: t(w) }))),
          el("div", { class: "mg-wert" }, el("small", { text: "Abwehr" }), el("strong", {}, wurf("Abwehr", s.abwehr, "WW", "abwehr"))),
          el("div", { class: "mg-wert" }, el("small", { text: "Resistenz G/K" }), el("strong", {}, wurf("Resistenz (Geist)", s.resistenzGeist, "WW", "resG"), " / ", wurf("Resistenz (Körper)", s.resistenzKoerper, "WW", "resK"))),
          s.schb !== null ? el("div", { class: "mg-wert" }, el("small", { text: "SchB" }), el("strong", { text: vz(s.schb) })) : null)),
        karte("Angriffe", "mg-angriffe", d.waffen.length ? el("table", { class: "ma-tabelle" },
          el("thead", {}, el("tr", {}, ["Angriff", "EW", "Schaden"].map((x) => el("th", { text: x })))),
          el("tbody", {}, d.waffen.map((w) => el("tr", {},
            el("td", { text: w.name }),
            el("td", { class: "zahl" }, w.ew === null ? el("span", { text: "–" }) : el("a", { class: "ma-wurf ma-angriff", "data-gwurf": "angriff", "data-angriff": w.id, title: `Angriff: ${w.name} (Ziel anvisieren)`, text: vz(w.ew) })),
            // Angabe wie im Kodex („je 1W6“, „1W6 & 2 LP“), sonst die Würfelformel
            el("td", { text: w.schaden && !/^\d*W\d+([+–-]\d+)?$/.test(w.schaden.replace(/\s/g, "")) ? w.schaden : w.formel ? wNotation(w.formel) : w.schaden || "–" })))))
          : el("p", { class: "info", text: "Keine Angriffe (nur Magie oder harmlos)." }),
          el("p", { class: "info", text: "Ziel anvisieren und den EW anklicken: Das Ziel erhält in der Chatkarte die Aufforderung zum WW:Abwehr." })),
        s.faehigkeiten.length ? karte("Fähigkeiten und Besonderheiten", "mg-faehigkeiten", el("ul", {}, s.faehigkeiten.map((f) => el("li", { text: f })))) : null,
        karte("Zustände", "ma-k-zustaende", el("div", { class: "ma-zustand-knoepfe" }, ZUSTAENDE.map((z) => {
          const an = d.zustaende[z.id];
          return el("button", { type: "button", class: ["ma-zustand", an && "an"], "aria-pressed": String(an), title: z.text, disabled: !darf, onclick: () => a.update({ [`system.zustaende.${z.id}`]: !an }) }, icon(z.icon), el("span", { text: z.name }));
        }))),
      ].filter(Boolean));
      if (s.beschreibung) {
        const TE = foundry.applications?.ux?.TextEditor?.implementation ?? globalThis.TextEditor;
        const div = el("div", { class: "ma-text mg-beschreibung" });
        div.innerHTML = await TE.enrichHTML(s.beschreibung, { relativeTo: a });
        inhalt.append(karte("Beschreibung", null, div));
      }
    }
    wurzel.append(inhalt);
    return wurzel;
  }

  /** Bearbeiten (Spielleitung): Spieldaten als Felder, Angriffe in Kodex-Schreibweise. */
  #bearbeitung(s) {
    const a = this.actor;
    const feld = (label, pfad, wert, typ = "text") => el("label", { class: "ma-zeile" }, el("span", { text: label }),
      el("input", { type: typ, value: wert ?? "", onchange: (ev) => a.update({ [pfad]: typ === "number" ? (ev.target.value === "" ? null : Number(ev.target.value)) : ev.target.value }) }));
    const angriffText = [s.angriffe.map((x) => `${x.anzahl > 1 ? `${x.anzahl}×` : ""}${x.name}${x.ew !== null && x.ew !== undefined ? `+${x.ew}` : ""}${x.schaden ? ` (${x.schaden})` : ""}`).join(", "),
      s.raufen?.ew ? ` - Raufen+${s.raufen.ew}${s.raufen.schaden ? ` (${s.raufen.schaden})` : ""}` : ""].join("");
    const angriff = el("textarea", { rows: "3", "aria-label": "Angriffe" }); angriff.value = angriffText;
    angriff.addEventListener("change", () => { const z = angriffeZerlegen(angriff.value); a.update({ "system.angriffe": z.angriffe, "system.raufen": z.raufen ?? {} }); });
    const faeh = el("textarea", { rows: "4", "aria-label": "Fähigkeiten" }); faeh.value = s.faehigkeiten.join("\n");
    faeh.addEventListener("change", () => a.update({ "system.faehigkeiten": faeh.value.split("\n").map((x) => x.trim()).filter(Boolean) }));
    return karte("Spieldaten bearbeiten", "mg-bearbeiten",
      el("div", { class: "ma-raster-zwei" },
        el("div", {}, feld("Art", "system.art", s.art), feld("Grad", "system.grad", s.grad, "number"), feld("Gefährlichkeit (Gf)", "system.gf", s.gf, "number"),
          feld("LP-Formel", "system.lpFormel", s.lpFormel), feld("AP-Formel", "system.apFormel", s.apFormel), feld("Rüstklasse", "system.rk", s.rk), feld("Quelle", "system.quelle", s.quelle)),
        el("div", {}, feld("St", "system.eigenschaften.St", s.eigenschaften.St), feld("Gw", "system.eigenschaften.Gw", s.eigenschaften.Gw), feld("In", "system.eigenschaften.In", s.eigenschaften.In),
          feld("B", "system.b", s.b), feld("Abwehr", "system.abwehr", s.abwehr, "number"), feld("Resistenz Geist", "system.resistenzGeist", s.resistenzGeist, "number"),
          feld("Resistenz Körper", "system.resistenzKoerper", s.resistenzKoerper, "number"), feld("Schadensbonus", "system.schb", s.schb, "number"))),
      el("label", { class: "ma-zeile mg-block" }, el("span", { text: "Angriffe (wie im Kodex: „Biss+7 (1W6), Klaue+7 (1W6–2) - Raufen+5 (1W6–4)“)" }), angriff),
      el("label", { class: "ma-zeile mg-block" }, el("span", { text: "Fähigkeiten (eine je Zeile)" }), faeh));
  }

  _replaceHTML(result, content) { content.replaceChildren(result); }

  async _onRender(context, options) {
    await super._onRender?.(context, options);
    const w = this.element;
    if (w.dataset.midgardEreignisse) return;
    w.dataset.midgardEreignisse = "1";
    w.addEventListener("submit", (ev) => { ev.preventDefault(); ev.stopImmediatePropagation(); }, { capture: true });
    w.addEventListener("click", (ev) => this.#wurf(ev));
    w.addEventListener("keydown", (ev) => {
      const z = ev.target.closest?.('a[role="button"]');
      if (!z || (ev.key !== "Enter" && ev.key !== " ")) return;
      ev.preventDefault();
      z.dispatchEvent(new MouseEvent("click", { bubbles: true, shiftKey: ev.shiftKey }));
    });
  }

  #wurf(ev) {
    const z = ev.target.closest?.("[data-gwurf]");
    if (!z) return;
    ev.preventDefault();
    const a = this.actor, s = a.system, d = s.abgeleitet, ohneDialog = ev.shiftKey;
    if (!a.isOwner) return ui.notifications.warn("Nur wer diese Figur führt, kann für sie würfeln.");
    switch (z.dataset.gwurf) {
      case "angriff": return angreifen(a, z.dataset.angriff, { ohneDialog });
      case "abwehr": {
        if (d.wehrlos) return ui.notifications.warn(`${a.name} ist wehrlos und darf keinen WW:Abwehr würfeln.`);
        const abzuege = d.kampfAbzuege.filter((x) => x.nur !== "angriff");
        return erfolgswurf(a, { art: "WW", titel: "Abwehr", wert: d.abwehr, mod: abzuege.reduce((n, x) => n + x.wert, 0), hinweise: abzuege.map((x) => `${vz(x.wert)} ${x.grund}`),
          gegnerFragen: true, ohneDialog, teile: d.abwehrTeile, modTeile: abzuege.map((x) => [x.grund, x.wert]) });
      }
      case "resG": return erfolgswurf(a, { art: "WW", titel: "Resistenz (Geist)", wert: s.resistenzGeist, gegnerFragen: true, ohneDialog, teile: [["Resistenz Geist", s.resistenzGeist]] });
      case "resK": return erfolgswurf(a, { art: "WW", titel: "Resistenz (Körper)", wert: s.resistenzKoerper, gegnerFragen: true, ohneDialog, teile: [["Resistenz Körper", s.resistenzKoerper]] });
    }
  }
}

/** Gegner-Daten aus einem gelesenen Bestiarium-Eintrag (für das Kompendium). */
export function gegnerAusBestiarium(w, { quelle, html, img }) {
  const v = w.werte;
  const s = {
    art: w.art, grad: w.grad, gf: v.gf, quelle,
    lpFormel: v.lpFormel, apFormel: v.apFormel, rk: v.rk || "OR",
    eigenschaften: { St: String(v.st ?? ""), Gw: String(v.gw ?? ""), In: String(v.in ?? "") }, b: String(v.b ?? ""),
    abwehr: v.abwehr, resistenzGeist: v.resistenzGeist, resistenzKoerper: v.resistenzKoerper, schb: v.schb,
    angriffe: v.angriffe, raufen: v.raufen ?? {}, faehigkeiten: v.faehigkeiten,
    auftritt: w.auftritt ? `${w.auftritt} (S. ${w.seite})` : "", anzahl: w.anzahl ?? null,
    // Hinweis am Anfang der Beschreibung: wie viele dieser Gegner das Abenteuer vorsieht
    beschreibung: (w.auftritt ? `<p class="midgard-hinweis"><strong>Im Abenteuer: ${w.auftritt}</strong> (S. ${w.seite}). Für jeden einen eigenen Token auf die Szene ziehen; jeder würfelt seine LP und AP selbst.</p>` : "") + html,
  };
  // Startwerte: Durchschnitt der Formeln; beim Platzieren eines Tokens wird gewürfelt (Einstellung)
  const lp = /^\*$/.test(s.lpFormel) ? 0 : durchschnitt(s.lpFormel) ?? 0;
  const ap = /∞/.test(s.apFormel) ? 0 : /^=\s*LP$/.test(s.apFormel) ? lp : durchschnitt(s.apFormel) ?? 0;
  s.lp = { wert: lp, max: lp };
  s.ap = { wert: ap, max: ap };
  return { name: w.name, type: "gegner", img: img ?? "icons/svg/mystery-man.svg", system: s };
}

