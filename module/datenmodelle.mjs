// Datenmodelle der Gegenstandstypen. Die Felder entsprechen den Einträgen, die
// foundry/kompendium_erzeugen.mjs aus den geprüften Regeldaten erzeugt.

const f = () => foundry.data.fields;
const text = (initial = "") => new (f().StringField)({ required: true, blank: true, initial });
const zahl = (initial = 0, opt = {}) => new (f().NumberField)({ required: true, nullable: false, integer: true, initial, ...opt });
const zahlOderLeer = (opt = {}) => new (f().NumberField)({ required: false, nullable: true, initial: null, ...opt });
const ja = (initial = false) => new (f().BooleanField)({ initial });
const html = () => new (f().HTMLField)({ required: true, blank: true, initial: "" });
const objekt = () => new (f().ObjectField)({ required: true, initial: {} });
const liste = (feld) => new (f().ArrayField)(feld, { required: true, initial: [] });

/** Felder, die jeder Gegenstand hat: Beschreibung, Fundstelle. */
function gemeinsam() {
  return { beschreibung: html(), quelle: text() };
}

class FertigkeitDaten extends foundry.abstract.TypeDataModel {
  static defineSchema() {
    return {
      leiteigenschaft: text(), lerngruppe: text(), startwert: zahl(), lernLE: zahl(), wert: zahl(),
      ungelernt: zahlOderLeer({ integer: true }), mitAngabe: ja(), angabe: text(), pp: zahl(0, { min: 0 }),
      startlisten: liste(objekt()), elfenNie: ja(), elfenNichtBeiStart: ja(), ...gemeinsam(),
    };
  }
}

class WaffenfertigkeitDaten extends foundry.abstract.TypeDataModel {
  static defineSchema() {
    return {
      lerngruppe: text(), startwert: zahl(), wert: zahl(), lernLE: zahl(), schwierigkeit: text(), pp: zahl(0, { min: 0 }),
      verteidigung: ja(), nurZauberer: ja(), spezialwaffeMoeglich: ja(true), kleineVerboten: ja(), ...gemeinsam(),
    };
  }
}

class WaffeDaten extends foundry.abstract.TypeDataModel {
  static defineSchema() {
    const F = f();
    return {
      grundname: text(), fertigkeit: text(), schaden: text(),
      mindest: new F.SchemaField({ St: zahlOderLeer(), Gs: zahlOderLeer(), Gw: zahlOderLeer() }),
      art: new F.StringField({ required: true, initial: "nahkampf", choices: ["nahkampf", "fernkampf", "verteidigung"] }),
      preis: zahlOderLeer({ min: 0 }), gewicht: zahlOderLeer({ min: 0, integer: false }),
      kleineVerboten: ja(), kleineZweihaendig: ja(), ausgeruestet: ja(), ...gemeinsam(),
    };
  }
}

class RuestungDaten extends foundry.abstract.TypeDataModel {
  static defineSchema() {
    return {
      kuerzel: text(), rs: zahl(0, { min: 0 }), abwehrbonusVerlust: text("0"),
      preis: zahlOderLeer({ min: 0 }), gewicht: zahlOderLeer({ min: 0, integer: false }), getragen: ja(), ...gemeinsam(),
    };
  }
}

class GegenstandDaten extends foundry.abstract.TypeDataModel {
  static defineSchema() {
    return {
      anzahl: zahl(1, { min: 0 }), preis: zahlOderLeer({ min: 0, integer: false }), preisText: text(),
      gewicht: zahlOderLeer({ min: 0, integer: false }), kategorie: text(), unterkategorie: text(), ...gemeinsam(),
    };
  }
}

class ZauberDaten extends foundry.abstract.TypeDataModel {
  static defineSchema() {
    return {
      gruppe: text(), stufe: zahl(1, { min: 0 }), art: text(), ursprung: text(), ap: text(), zauberdauer: text(),
      reichweite: text(), wirkungsziel: text(), wirkungsbereich: text(), wirkungsdauer: text(),
      agens: text(), reagens: text(), material: text(), ...gemeinsam(),
    };
  }
}

class RasseDaten extends foundry.abstract.TypeDataModel {
  static defineSchema() {
    return {
      min: objekt(), max: objekt(), schwach: text(), aussehen: new (f().ObjectField)({ required: false, nullable: true, initial: null }),
      typen: liste(text()), faehigkeiten: liste(objekt()), ...gemeinsam(),
    };
  }
}

class TypDaten extends foundry.abstract.TypeDataModel {
  static defineSchema() {
    return {
      kuerzel: text(), art: text(), artName: text(), wichtig: text(), apBonus: zahl(), standMod: zahl(),
      freiWaffen: zahl(), le: objekt(), waffenLE: zahl(), zauberLE: zahl(), zauberGruppen: liste(text()),
      typisch: liste(new (f().ArrayField)(objekt())), typischerZauber: liste(text()), ausruestung: text(),
      zauberKosten: objekt(), ...gemeinsam(),
    };
  }
}

export const GEGENSTAND_MODELLE = {
  fertigkeit: FertigkeitDaten,
  waffenfertigkeit: WaffenfertigkeitDaten,
  waffe: WaffeDaten,
  ruestung: RuestungDaten,
  gegenstand: GegenstandDaten,
  zauber: ZauberDaten,
  rasse: RasseDaten,
  typ: TypDaten,
};
