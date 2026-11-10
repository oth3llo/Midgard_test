// Datenmodell des Abenteurers und Übernahme der Werte aus dem Erschaffungs- und Lernwerkzeug.
import { EIGENSCHAFTEN, ableiten } from "./regeln.mjs";
import { SYSTEM_ID, packId } from "./kategorien.mjs";
import KOMPENDIUM from "../daten/kompendium.js";

const F = () => foundry.data.fields;
const text = () => new (F().StringField)({ required: true, blank: true, initial: "" });
const zahl = (initial = 0) => new (F().NumberField)({ required: true, nullable: false, integer: true, initial });
const zahlOderLeer = () => new (F().NumberField)({ required: false, nullable: true, integer: true, initial: null });
const vorrat = () => new (F().SchemaField)({ wert: zahl(0), max: zahl(0) });

export class AbenteurerDaten extends foundry.abstract.TypeDataModel {
  static defineSchema() {
    const f = F();
    return {
      // Zustand des Erschaffungs- und Lernwerkzeugs (JSON). Solange er gefüllt ist, verwaltet das
      // Werkzeug Eigenschaften, Fertigkeiten, Zauber und Konto; der Bogen zeigt sie nur an.
      zustand: new f.StringField({ required: true, blank: true, initial: "" }),
      spieler: text(), geschlecht: text(), rasse: new f.StringField({ required: true, blank: true, initial: "Mensch" }),
      typ: text(), typName: text(), typArt: text(), spezialisierung: text(), grad: zahl(1),
      eigenschaften: new f.SchemaField(Object.fromEntries(EIGENSCHAFTEN.map((e) => [e, zahlOderLeer()]))),
      lp: vorrat(), ap: vorrat(), b: zahlOderLeer(),
      sg: vorrat(), gg: zahl(0),
      es: zahl(0), ep: zahl(0), gold: new f.NumberField({ required: true, nullable: false, initial: 0 }),
      faehigkeiten: new f.ArrayField(new f.ObjectField(), { required: true, initial: [] }),
      zauberPP: new f.ObjectField({ required: true, initial: {} }),
      spezialwaffen: new f.ArrayField(new f.ObjectField(), { required: true, initial: [] }),
      persoenlich: new f.SchemaField({
        geburtsdatum: text(), alter: text(), groesse: text(), gewicht: text(), gestalt: text(), hand: text(),
        stand: text(), heimat: text(), glaube: text(), muttersprache: text(),
      }),
      merkmale: new f.HTMLField({ required: true, blank: true, initial: "" }),
      notizen: new f.HTMLField({ required: true, blank: true, initial: "" }),
      ausruestungText: text(),
      protokoll: new f.ArrayField(new f.ObjectField(), { required: true, initial: [] }),
    };
  }

  /** Verwaltet das Werkzeug diesen Charakter? */
  get verwaltet() {
    return !!this.zustand;
  }

  prepareDerivedData() {
    this.abgeleitet = ableiten(this, this.parent?.items ? [...this.parent.items] : []);
  }
}

// ------------------------------------------------------------------ Übernahme aus dem Werkzeug

/** Index aller Kompendien nach Name, für das Anlegen eingebetteter Gegenstände. */
async function kompendiumNachName(kat) {
  const karte = new Map();
  // Datensatz als Rückfall, falls das Kompendium (noch) nicht importiert ist
  for (const e of KOMPENDIUM.kategorien[kat] ?? []) {
    const ziel = { daten: e };
    if (e.system.gruppe) karte.set(`${e.name}|${e.system.gruppe}`, ziel);
    if (!karte.has(e.name)) karte.set(e.name, ziel);
  }
  const pack = game.packs.get(packId(kat));
  if (!pack) return karte;
  const index = await pack.getIndex({ fields: ["system.gruppe"] });
  for (const e of index) {
    const ziel = { pack, id: e._id };
    if (e.system?.gruppe) karte.set(`${e.name}|${e.system.gruppe}`, ziel);
    karte.set(e.name, ziel);
  }
  return karte;
}

async function vorlage(eintrag) {
  if (eintrag.daten) { const d = foundry.utils.deepClone(eintrag.daten); delete d._id; return d; }
  const doc = await eintrag.pack.getDocument(eintrag.id);
  const daten = doc.toObject();
  delete daten._id;
  return daten;
}

/**
 * Schreibt die Auswertung des Werkzeugs (MidgardCMT auswertung()) in den Akteur: Grunddaten,
 * Eigenschaften, Vorräte, und gleicht die vom Werkzeug stammenden Fertigkeiten, Waffenfertigkeiten
 * und Zauber als eingebettete Gegenstände ab. Selbst hinzugefügte Gegenstände bleiben unberührt.
 */
export async function ausWerkzeug(actor, a, zustand) {
  const s = actor.system;
  const aenderung = { "system.zustand": JSON.stringify(zustand) };
  if (a.name && a.name !== actor.name) aenderung.name = a.name;
  const setze = (pfad, wert) => { if (wert !== null && wert !== undefined) aenderung[pfad] = wert; };
  setze("system.spieler", a.spieler);
  setze("system.geschlecht", a.geschlecht);
  setze("system.rasse", a.rasse);
  setze("system.typ", a.typ ?? "");
  setze("system.typName", a.typName);
  setze("system.typArt", a.typArt);
  setze("system.spezialisierung", a.spezialisierung);
  setze("system.grad", a.grad);
  setze("system.es", a.es);
  setze("system.ep", a.ep);
  setze("system.gold", a.gold);
  for (const [k, v] of Object.entries(a.eigenschaften ?? {})) setze(`system.eigenschaften.${k}`, v);
  if (a.lp !== null) { aenderung["system.lp.max"] = a.lp; if (!s.lp.max) aenderung["system.lp.wert"] = a.lp; }
  if (a.ap !== null) { aenderung["system.ap.max"] = a.ap; if (!s.ap.max) aenderung["system.ap.wert"] = a.ap; }
  setze("system.b", a.b);
  if (a.sg !== null && a.sg !== undefined) {
    aenderung["system.sg.max"] = a.sg;
    if (!s.sg.max || s.sg.wert > a.sg) aenderung["system.sg.wert"] = a.sg;
  }
  aenderung["system.spezialwaffen"] = a.spezialwaffen ?? [];
  aenderung["system.faehigkeiten"] = a.faehigkeiten ?? [];
  aenderung["system.zauberPP"] = a.zauberPP ?? {};
  for (const k of ["stand", "heimat", "glaube", "alter", "gestalt", "hand"]) setze(`system.persoenlich.${k}`, a[k] === null ? null : String(a[k] ?? ""));
  if (a.groesse) aenderung["system.persoenlich.groesse"] = `${a.groesse} cm`;
  if (a.gewicht) aenderung["system.persoenlich.gewicht"] = `${a.gewicht} kg`;
  setze("system.ausruestungText", a.ausruestung);
  aenderung["system.protokoll"] = a.protokoll ?? [];
  await actor.update(aenderung, { render: false, diff: true, midgardWerkzeug: true });
  await gegenstaendeAbgleichen(actor, a);
}

async function gegenstaendeAbgleichen(actor, a) {
  const soll = [];   // {schluessel, type, name, kat, system}
  for (const f of a.fertigkeiten ?? []) {
    soll.push({ schluessel: `F:${f.name}|${f.spez}`, type: "fertigkeit", kat: "fertigkeiten", such: f.lernname, name: f.name,
      system: { wert: f.wert, pp: f.pp, angabe: f.spez, ...(f.le ? { leiteigenschaft: f.le } : {}) } });
  }
  for (const w of a.waffen ?? []) {
    soll.push({ schluessel: `W:${w.name}`, type: "waffenfertigkeit", kat: "waffenfertigkeiten", such: w.name, name: w.name, system: { wert: w.wert, pp: w.pp } });
  }
  for (const z of a.zauber ?? []) {
    soll.push({ schluessel: `Z:${z.gruppe}|${z.name}`, type: "zauber", kat: "zauber", such: z.name, gruppe: z.gruppe, name: z.name, system: {} });
  }
  const vorhanden = new Map(actor.items.filter((i) => i.getFlag(SYSTEM_ID, "cmt")).map((i) => [i.getFlag(SYSTEM_ID, "cmt"), i]));
  const indizes = {};
  const neu = [], aendern = [];
  for (const e of soll) {
    const alt = vorhanden.get(e.schluessel);
    vorhanden.delete(e.schluessel);
    if (alt) {
      const diff = {};
      for (const [k, v] of Object.entries(e.system)) if (alt.system[k] !== v) diff[`system.${k}`] = v;
      if (Object.keys(diff).length) aendern.push({ _id: alt.id, ...diff });
      continue;
    }
    indizes[e.kat] ??= await kompendiumNachName(e.kat);
    const treffer = (e.gruppe && indizes[e.kat].get(`${e.name}|${e.gruppe}`)) ?? indizes[e.kat].get(e.such) ?? indizes[e.kat].get(e.name);
    const basis = treffer ? await vorlage(treffer) : { name: e.name, type: e.type, img: "icons/svg/book.svg", system: {} };
    if (e.type === "zauber" && e.gruppe) basis.system.gruppe = e.gruppe;
    basis.name = e.name;
    basis.system = { ...basis.system, ...e.system };
    basis.flags = foundry.utils.mergeObject(basis.flags ?? {}, { [SYSTEM_ID]: { cmt: e.schluessel } }, { inplace: false });
    neu.push(basis);
  }
  const loeschen = [...vorhanden.values()].map((i) => i.id);
  if (loeschen.length) await actor.deleteEmbeddedDocuments("Item", loeschen, { render: false });
  if (aendern.length) await actor.updateEmbeddedDocuments("Item", aendern, { render: false });
  if (neu.length) await actor.createEmbeddedDocuments("Item", neu, { render: false });
}
