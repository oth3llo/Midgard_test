// Regeln zur Charaktererschaffung nach "Der Kodex" (Midgard 5), S. 20-47,
// mit den Korrekturen aus "02_Kodex_Errata". Seitenzahlen beziehen sich auf den Kodex.
window.KODEX = {
  eigenschaften: ["St", "Gs", "Gw", "Ko", "In", "Zt"],
  eigenschaftNamen: {
    St: "Stärke", Gs: "Geschicklichkeit", Gw: "Gewandtheit", Ko: "Konstitution",
    In: "Intelligenz", Zt: "Zaubertalent", pA: "persönliche Ausstrahlung",
    Wk: "Willenskraft", Au: "Aussehen",
  },

  // S. 21: Grenzwerte der Rassen. min/max je Eigenschaft, schwach = Eigenschaft mit Höchstwert
  rassen: {
    Mensch: { min: {}, max: {}, au: null },
    Elf: { min: { Gw: 81, Ko: 51, In: 51, Zt: 51 }, max: { St: 90 }, schwach: "St", au: { min: 81 } },
    Gnom: { min: { Gs: 81, Gw: 81, Ko: 51 }, max: { St: 60 }, schwach: "St", au: { max: 80 } },
    Halbling: { min: { Gs: 61, Gw: 91, Ko: 41 }, max: { St: 80 }, schwach: "St", au: null },
    Zwerg: { min: { St: 61, Ko: 61 }, max: { Gw: 80 }, schwach: "Gw", au: { max: 80 } },
  },

  // S. 23
  klassenFuerRasse: {
    Mensch: ["As", "Bb", "Gl", "Hä", "Kr", "Sp", "Wa", "Ba", "Or", "Dr", "Hx", "Ma", "PB", "PS", "Sc"],
    Elf: ["Gl", "Kr", "Wa", "Ba", "Dr", "Hx", "Ma"],
    Gnom: ["As", "Gl", "Sp", "Wa", "Dr", "Hx", "Ma"],
    Halbling: ["As", "Hä", "Sp", "Wa", "Ba", "PB"],
    Zwerg: ["Hä", "Kr", "Ma", "PB", "PS"],
  },

  // S. 23 und S. 38-39. art: K = Kämpfer, ZK = zauberkundiger Kämpfer, Z = Zauberer
  klassen: {
    As: {
      name: "Assassine", art: "K", wichtig: "Gs, Gw", ap: 1, standMod: -10, freiWaffen: 4,
      typisch: [[{ name: "Meucheln", wert: 8, le: "Gs" }]],
      le: { Alltag: 1, Halbwelt: 2, Sozial: 4, Unterwelt: 8 }, waffenLE: 24,
    },
    Bb: {
      name: "Barbar", art: "K", wichtig: "St, Gw", ap: 2, standMod: 0, freiWaffen: 3,
      typisch: [[{ name: "Spurensuche", wert: 8, le: "In" }],
        [{ name: "Überleben", wert: 8, le: "In", spez: "Heimatlandschaft (Gebirge, Steppe oder Wald)" }]],
      le: { Alltag: 2, Freiland: 4, Kampf: 1, "Körper": 2 }, waffenLE: 24,
    },
    Gl: {
      name: "Glücksritter", art: "K", wichtig: "Gs, pA", ap: 1, standMod: 0, freiWaffen: 3,
      typisch: [[{ name: "Fechten", wert: 5, le: "Gs" }, { name: "Beidhändiger Kampf", wert: 5, le: "Gs" }]],
      le: { Alltag: 2, Halbwelt: 3, Sozial: 8 }, waffenLE: 24,
    },
    "Hä": {
      name: "Händler", art: "K", wichtig: "In, Gs/pA", ap: 1, standMod: -10, freiWaffen: 2,
      typisch: [[{ name: "Geschäftssinn", wert: 8, le: "In" }]],
      le: { Alltag: 4, Sozial: 8, Wissen: 4 }, waffenLE: 20,
    },
    Kr: {
      name: "Krieger", art: "K", wichtig: "St, Gw", ap: 2, standMod: 0, freiWaffen: 4,
      typisch: [[{ name: "Kampf in Vollrüstung", wert: 5, le: "St" }]],
      le: { Alltag: 2, Kampf: 3, "Körper": 1 }, waffenLE: 36,
    },
    Sp: {
      name: "Spitzbube", art: "K", wichtig: "Gs, Gw/In", ap: 1, standMod: -20, freiWaffen: 2,
      typisch: [[{ name: "Fallenmechanik", wert: 8, le: "Gs" }, { name: "Geschäftssinn", wert: 8, le: "In" }]],
      le: { Alltag: 2, Halbwelt: 6, Unterwelt: 12 }, waffenLE: 20,
    },
    Wa: {
      name: "Waldläufer", art: "K", wichtig: "Gw, In", ap: 2, standMod: -10, freiWaffen: 3,
      typisch: [[{ name: "Scharfschießen", wert: 5, le: "Gs" }]],
      le: { Alltag: 1, Freiland: 11, "Körper": 4 }, waffenLE: 20,
    },
    Ba: {
      name: "Barde", art: "ZK", wichtig: "In, pA", ap: 1, standMod: 20, freiWaffen: 2,
      typisch: [[{ name: "Musizieren", wert: 12, le: "Gs" }],
        [{ name: "Landeskunde", wert: 8, le: "In", spez: "Heimat" }]],
      le: { Alltag: 2, Sozial: 4, Wissen: 4 }, waffenLE: 16,
      zauberLE: 3, zauberGruppen: ["Zauberlieder"], ausruestung: "magisches Instrument",
    },
    Or: {
      name: "Ordenskrieger", art: "ZK", wichtig: "St, Zt", ap: 1, standMod: 0, freiWaffen: 3,
      typisch: [[{ name: "Athletik", wert: 8, le: "St" }, { name: "Meditieren", wert: 8, le: "Wk" }]],
      le: { Alltag: 2, Kampf: 3, Wissen: 2 }, waffenLE: 18,
      zauberLE: 3, zauberGruppen: ["Wundertaten"], ausruestung: "Kettenrüstung",
    },
    Dr: {
      name: "Druide", art: "Z", wichtig: "In, Zt", ap: 0, standMod: 10, freiWaffen: 1,
      typisch: [[{ name: "Pflanzenkunde", wert: 8, le: "In" }],
        [{ name: "Schreiben", wert: 12, le: "In", spez: "Ogam-Zeichen" }]],
      le: { Alltag: 2, Freiland: 4, Wissen: 2 }, waffenLE: 6,
      zauberLE: 5, zauberGruppen: ["Dweomer"], typischerZauber: ["Tiere rufen"],
    },
    Hx: {
      name: "Hexer", art: "Z", wichtig: "In, Zt", ap: 0, standMod: 0, freiWaffen: 1,
      typisch: [[{ name: "Gassenwissen", wert: 8, le: "In" }, { name: "Verführen", wert: 8, le: "pA" }]],
      le: { Alltag: 3, Sozial: 2, Wissen: 2 }, waffenLE: 2,
      zauberLE: 6, zauberGruppen: ["Beherrschen", "Verändern"],
      typischerZauber: ["Verwünschen", "Binden des Vertrauten"],
    },
    Ma: {
      name: "Magier", art: "Z", wichtig: "In, Zt", ap: 0, standMod: 10, freiWaffen: 1,
      typisch: [[{ name: "Zauberkunde", wert: 8, le: "In" }],
        [{ name: "Schreiben", wert: 12, le: "In", spez: "Muttersprache" }]],
      le: { Alltag: 1, Wissen: 5 }, waffenLE: 2,
      zauberLE: 7, zauberGruppen: ["Beherrschen", "Bewegen", "Erkennen", "Erschaffen", "Formen", "Verändern", "Zerstören"],
      typischerZauber: ["Erkennen von Zauberei"],
    },
    PB: {
      name: "Priester, Beschützer", art: "Z", wichtig: "In, Zt", ap: 0, standMod: 20, freiWaffen: 1,
      typisch: [[{ name: "Menschenkenntnis", wert: 8, le: "In" }],
        [{ name: "Schreiben", wert: 12, le: "In", spez: "Muttersprache" }]],
      le: { Alltag: 2, Sozial: 2, Wissen: 3 }, waffenLE: 6,
      zauberLE: 5, zauberGruppen: ["Wundertaten"], typischerZauber: ["Heilen von Wunden"],
    },
    PS: {
      name: "Priester, Streiter", art: "Z", wichtig: "Zt, St/Gw", ap: 0, standMod: 20, freiWaffen: 2,
      typisch: [[{ name: "Erste Hilfe", wert: 8, le: "Gs" }],
        [{ name: "Schreiben", wert: 12, le: "In", spez: "Muttersprache" }]],
      le: { Alltag: 3, Kampf: 2, Wissen: 2 }, waffenLE: 8,
      zauberLE: 5, zauberGruppen: ["Wundertaten"],
      typischerZauber: ["Bannen von Finsterwerk", "Strahlender Panzer"],
    },
    Sc: {
      name: "Schamane", art: "Z", wichtig: "Zt, Gw/In", ap: 1, standMod: 0, freiWaffen: 2,
      typisch: [[{ name: "Tierkunde", wert: 8, le: "In" }],
        [{ name: "Überleben", wert: 8, le: "In", spez: "Heimatlandschaft (Gebirge, Steppe oder Wald)" }]],
      le: { Alltag: 2, "Körper": 4, Wissen: 2 }, waffenLE: 6,
      zauberLE: 5, zauberGruppen: ["Dweomer", "Wundertaten"],
      typischerZauber: ["Austreibung des Bösen", "Bannen von Gift"],
    },
  },

  // S. 39: 2 LE nach Stand
  stand: [
    { name: "Unfreie", bis: 10, gruppe: "Halbwelt" },
    { name: "Volk", bis: 50, gruppe: "Alltag" },
    { name: "Mittelschicht", bis: 90, gruppe: "Wissen" },
    { name: "Adel", bis: 999, gruppe: "Sozial", nurLeicht: true },
  ],

  // S. 40-41: Lernlisten für neue Abenteurer. stufe: leicht/normal/schwer
  // name = Name im Kodex, lern = Name in den Lerntabellen (falls abweichend)
  startFertigkeiten: {
    Alltag: [
      ["leicht", 1, ["Bootfahren", 12, "Gs"], ["Glücksspiel", 12, "Gs"], ["Klettern", 12, "St"], ["Musizieren", 12, "Gs"],
        ["Reiten", 12, "Gw"], ["Schwimmen", 12, "Gw"], ["Seilkunst", 12, "Gs"], ["Wagenlenken", 12, "Gs"]],
      ["normal", 1, ["Schreiben", 8, "In"], ["Sprache", 8, "In"]],
      ["schwer", 2, ["Erste Hilfe", 8, "Gs"], ["Etikette", 8, "In"]],
    ],
    Freiland: [
      ["leicht", 1, ["Überleben", 8, "In"]],
      ["normal", 2, ["Naturkunde", 8, "In"], ["Pflanzenkunde", 8, "In"], ["Tierkunde", 8, "In"]],
      ["schwer", 4, ["Schleichen", 8, "Gw"], ["Spurensuche", 8, "In"], ["Tarnen", 8, "Gw"]],
    ],
    Halbwelt: [
      ["leicht", 1, ["Balancieren", 12, "Gw"], ["Fälschen", 12, "Gs"], ["Gaukeln", 12, "Gs"], ["Glücksspiel", 12, "Gs"], ["Klettern", 12, "St"]],
      ["normal", 2, ["Akrobatik", 8, "Gw"]],
      ["schwer", 2, ["Gassenwissen", 8, "In"], ["Stehlen", 8, "Gs"]],
    ],
    Kampf: [
      ["leicht", 1, ["Geländelauf", 12, "Gw"], ["Reiten", 12, "Gw"], ["Reiterkampf", 12, "Gw"]],
      ["normal", 2, ["Anführen", 8, "pA"], ["Athletik", 8, "St"]],
    ],
    "Körper": [
      ["leicht", 1, ["Balancieren", 12, "Gw"], ["Geländelauf", 12, "Gw"], ["Klettern", 12, "St"], ["Schwimmen", 12, "Gw"]],
      ["normal", 1, ["Tauchen", 8, "Ko"]],
      ["schwer", 2, ["Akrobatik", 8, "Gw"], ["Athletik", 8, "St"], ["Laufen", 8, "Ko"], ["Meditieren", 8, "Wk"]],
    ],
    Sozial: [
      ["leicht", 2, ["Anführen", 8, "pA"], ["Etikette", 8, "In"], ["Verführen", 8, "pA"], ["Verstellen", 8, "pA"]],
      ["normal", 2, ["Beredsamkeit", 8, "pA"], ["Gassenwissen", 8, "In"], ["Verhören", 8, "pA"]],
      ["schwer", 4, ["Menschenkenntnis", 8, "In"]],
    ],
    Unterwelt: [
      ["leicht", 2, ["Gassenwissen", 8, "In"], ["Stehlen", 8, "Gs"]],
      ["normal", 4, ["Fallen entdecken", 8, "In"], ["Schleichen", 8, "Gw"], ["Schlösser öffnen", 8, "Gs"], ["Spurensuche", 8, "In"], ["Tarnen", 8, "Gw"]],
    ],
    Wissen: [
      ["leicht", 1, ["Lesen von Zauberschrift", 8, "In"], ["Schreiben", 8, "In"], ["Sprache", 8, "In"]],
      ["normal", 2, ["Erste Hilfe", 8, "Gs"], ["Meditieren", 8, "Wk"]],
      ["schwer", 2, ["Alchimie", 8, "In"], ["Heilkunde", 8, "In"], ["Landeskunde", 8, "In"], ["Naturkunde", 8, "In"],
        ["Pflanzenkunde", 8, "In"], ["Tierkunde", 8, "In"], ["Zauberkunde", 8, "In"]],
    ],
  },
  // Fertigkeiten, die mehrfach mit unterschiedlicher Angabe gelernt werden (Sprache, Land, Gelände ...)
  mitAngabe: {
    Schreiben: "Schrift/Sprache", Sprache: "Sprache", Landeskunde: "Land",
    "Überleben": "Gelände",
  },
  // Namen im Kodex -> Namen in den Lerntabellen von material/lernen
  lernName: {
    Alchimie: "Alchemie", Schreiben: "Schreiben:Sprache", Sprache: "Sprechen:Sprache",
    Muttersprache: "Sprechen:Sprache", Gemeinsprache: "Sprechen:Sprache",
  },

  // S. 40-41: Waffenfertigkeiten bei Spielbeginn (Startwert +5, Schilde/Parierwaffen +1)
  startWaffen: [
    ["leicht", 2, "Spießwaffen", "Stichwaffen", "Zauberstäbe", "Schilde"],
    ["normal", 4, "Einhandschlagwaffen", "Einhandschwerter", "Stielwurfwaffen", "Wurfklingen", "Wurfspieße", "Parierwaffen"],
    ["schwer", 6, "Fechtwaffen", "Zweihandschlagwaffen", "Zweihandschwerter", "Armbrüste", "Blasrohre", "Bögen", "Schleudern", "Wurfscheiben"],
    ["sehr schwer", 8, "Kettenwaffen", "Stockwaffen", "waffenloser Kampf"],
  ],
  nurZauberer: ["Zauberstäbe"],
  verteidigungsWaffen: ["Schilde", "Parierwaffen"],
  // Errata zu S. 37: keine Spezialwaffe aus diesen Fertigkeiten
  keineSpezialwaffe: ["Kettenwaffen", "Stockwaffen", "waffenloser Kampf", "Zauberstäbe", "Schilde", "Parierwaffen"],

  // S. 42-43: Waffen mit Mindestwerten (Schaden aus dem Kapitel Waffenfertigkeiten, S. 135ff)
  waffenListe: {
    "Einhandschlagwaffen": [["Handaxt", "St11", "1W6", 10], ["Keule", "", "1W6–1", 8], ["Kriegshammer", "St61, Gs11", "1W6", 12],
      ["Schlachtbeil", "St91, Gs21", "1W6+1", 25], ["Streitaxt", "St61, Gs11", "1W6+1", 20], ["Streitkolben", "St31", "1W6", 12]],
    "Einhandschwerter": [["Anderthalbhänder", "St81, Gs21", "1W6+1", 200], ["Krummsäbel", "St31, Gs11", "1W6", 100], ["Langschwert", "St31, Gs21", "1W6+1", 100]],
    "Fechtwaffen": [["Florett", "Gs81", "2W6–4", 100], ["Fuchtel", "St61, Gs31", "1W6+1", 100], ["Rapier", "St11, Gs51", "1W6", 70]],
    "Kettenwaffen": [["Kriegsflegel", "St61, Gs31", "2W6–1", 30], ["Morgenstern", "St61, Gs61", "1W6+2", 40], ["NunChaku", "St31, Gs61", "1W6–1", 10]],
    "Spießwaffen": [["Glefe", "St11, Gs61", "1W6 / 1W6+2", 30], ["Hellebarde", "St61, Gs61", "1W6 / 1W6+2", 50], ["Speer, leichter", "", "1W6–1 / 1W6+1", 6],
      ["Stielhammer", "St81, Gs31", "1W6 / 1W6+1", 50], ["Stoßspeer", "St31, Gs11", "1W6 / 2W6", 8]],
    "Stichwaffen": [["Dolch", "", "1W6–1", 5], ["Kurzschwert", "", "1W6", 20], ["Ochsenzunge", "Gs31", "2W6–4", 10]],
    "Stockwaffen": [["Bo-Stab", "St21, Gs61", "1W6", 10], ["Kampfstab", "St31, Gs61", "1W6", 10]],
    "Zauberstäbe": [["Magierstab", "Gs31", "1W6", 15], ["Magierstecken", "St31, Gs31", "1W6+1", 20]],
    "Zweihandschlagwaffen": [["Barbarenstreitaxt", "St81, Gs31", "2W6", 50], ["Glefe", "St11, Gs61", "1W6+2", 30], ["Hellebarde", "St61, Gs61", "2W6–1", 50],
      ["Ogerhammer", "St91, Gs31", "4W6–4", 70], ["Schlachtbeil", "St61, Gs21", "1W6+3", 25], ["Stabkeule", "St81", "2W6–2", 15], ["Stielhammer", "St81, Gs31", "2W6", 50]],
    "Zweihandschwerter": [["Anderthalbhänder", "St31, Gs21", "1W6+2", 200], ["Bihänder", "St61, Gs31", "2W6", 200]],
    "waffenloser Kampf": [["Faustkampf", "St31, Gw21", "1W6–4", 0], ["Ringen", "St21, Gw31", "1W6–4", 0]],
    "Stielwurfwaffen": [["Wurfaxt", "St31, Gs31", "1W6", 25], ["Wurfeisen", "St61, Gs61", "1W6", 30], ["Wurfhammer", "St61, Gs31", "1W6", 25], ["Wurfkeule", "St31, Gs31", "1W6–1", 12]],
    "Wurfklingen": [["Wurfmesser", "Gs61", "1W6–1", 10], ["Wurfpfeil", "St11, Gs31", "1W6–2", 3]],
    "Wurfscheiben": [["Wurfscheibe", "St61, Gs61", "1W6–2", 2], ["Wurfstern", "Gs61", "1W6–3", 1]],
    "Wurfspieße": [["Speerschleuder", "St31, Gs61", "1W6", 8], ["Wurfspeer", "St31, Gs21", "1W6–1", 6], ["Wurfspieß", "St61, Gs21", "1W6", 8]],
    "Armbrüste": [["Armbrust, leicht", "Gs31", "1W6", 40], ["Armbrust, schwer", "St61, Gs31", "2W6–1", 40], ["Handarmbrust", "Gs31", "1W6–1", 100]],
    "Blasrohre": [["Blasrohr, kurz", "Gs61", "Gift", 5], ["Blasrohr, lang", "Gs61", "Gift", 8]],
    "Bögen": [["Bogen", "St31, Gs31", "1W6", 15], ["Kompositbogen", "St61, Gs61", "1W6+1", null], ["Kurzbogen", "St11, Gs31", "1W6–1", 15], ["Langbogen", "St61, Gs61", "1W6+1", 40]],
    "Schleudern": [["Schleuder", "Gs61", "1W6", 1], ["Stockschleuder", "St31, Gs81", "2W6–2", 7]],
    "Schilde": [["Buckler", "Gs61", "1W6–3", 10], ["Schild, großer", "St61", "–", 15], ["Schild, kleiner", "St31, Gs11", "–", 10]],
    "Parierwaffen": [["Kampfgabeln, Paar", "St31, Gs61", "1W6–3 / 2W6–4", 15], ["Parierdolch", "Gs61", "1W6–1", 8]],
  },
  // S. 37: Gnome und Halblinge können diese Waffen nicht benutzen
  kleineVerboten: {
    fertigkeiten: ["Zweihandschwerter", "Zweihandschlagwaffen", "Stockwaffen"],
    waffen: ["Glefe", "Hellebarde", "Stielhammer", "Langbogen", "Kompositbogen", "Armbrust, schwer", "Stockschleuder", "Kriegsflegel"],
    zweihaendig: ["Langschwert", "Streitaxt", "Stoßspeer", "Morgenstern"],
  },
  // S. 38-39 (Kasten): Elfen dürfen diese Fertigkeiten bei Spielbeginn nicht wählen
  elfenVerboten: ["Fälschen", "Fechten", "Gassenwissen", "Gerätekunde", "Geschäftssinn", "Glücksspiel", "Meucheln", "Schlösser öffnen", "Stehlen"],
  // S. 44: diese dürfen Elfen auch später nie lernen
  elfenNie: ["Fälschen", "Gassenwissen", "Glücksspiel", "Meucheln", "Schlösser öffnen", "Stehlen"],

  // S. 41 (mit Errata): Zauber bei Spielbeginn. * = Schwarze Magie, nicht für Elfen
  startZauber: {
    Dweomer: { 1: ["Bärenwut", "Baum", "Erkennen von Krankheit", "Kraftspende", "Linienlesen", "Mutlosigkeit", "Wandeln wie der Wind", "Wundersame Tarnung", "Zähmen"],
      2: ["Fährtenduft", "Lebensflammen", "Lindern von Krankheit", "Wittern", "Zaubersprung"] },
    Beherrschen: { 1: ["Angst", "Anstacheln", "Anziehen", "Macht über das Selbst", "Macht über die Sinne", "Schlummer", "Verwirren"],
      2: ["Besänftigen", "Blaue Bannsphäre"] },
    Bewegen: { 1: ["Befestigen", "Heranholen", "Stimmenwerfen", "Windstoß", "Zauberschloss"],
      2: ["Höhenblick", "Macht über Unbelebtes", "Zauberschlüssel"] },
    Erkennen: { 1: ["Dinge wiederfinden", "Erkennen von Leben", "Mitfühlen", "Zwiesprache"],
      2: ["Heimfeder", "Person wiederfinden", "Seelenkompass", "Warnung"] },
    Erschaffen: { 1: ["Brot und Wasser", "Feuerfinger", "Flammenkreis", "Frostball", "Silberstaub"],
      2: ["Eisiger Nebel", "Feuerkugel", "Flammende Hand", "Zauberstimme"] },
    Formen: { 1: ["Flicken", "Geräusche dämpfen", "Hauch des Winters", "Hörnerklang", "Lauschen", "Rost", "Schatten verstärken", "Vermehren", "Verschmutzen"],
      2: ["Nebel wecken", "Schattenrobe", "Sehen von Verborgenem", "Stille", "Sumpfboden"] },
    "Verändern": { 1: ["Felsenfaust", "Hitzeschutz", "Hören von Fernem", "Kälteschutz", "Reaktionsschnelle", "Scharfblick", "Schwäche", "Stärke"],
      2: ["Dämonische Zaubermacht", "Sehen in Dunkelheit", "Wasseratmen"] },
    "Zerstören": { 1: ["Bannen von Licht", "Dinge verbergen", "Kraft entziehen*"],
      2: ["Kraftraub", "Verursachen von Wunden*"] },
    Wundertaten: { 1: ["Bannen von Dunkelheit", "Blutmeisterschaft", "Erkennen der Aura", "Erkennen von Krankheit", "Göttlicher Schutz vor dem Bösen",
      "Handauflegen", "Heiliger Zorn", "Schützende Hülle", "Schwingenkeule"],
      2: ["Arm der Götter", "Erkennen von Besessenheit", "Segnen", "Wagemut"] },
    Zauberlieder: { 1: ["Das Lied der Feier", "Das Lied der Tapferkeit", "Die anfeuernde Ballade"],
      2: ["Das Lied des Fesselns", "Das Lied der Ruhe", "Das Lied der Verführung", "Das Lied des Wagemuts"] },
  },
  magierSpezialgebiete: ["Beherrschen", "Bewegen", "Erkennen", "Erschaffen", "Formen", "Verändern", "Zerstören"],

  // S. 27: besondere Fähigkeiten
  besondere: [
    [5, "Sehen", -2], [10, "Hören", -2], [15, "Riechen", -2], [20, "Sechster Sinn", 2], [30, "Sehen", 2], [40, "Hören", 2],
    [50, "Riechen", 2], [55, "Nachtsicht", 2], [60, "Gute Reflexe", 9], [65, "Richtungssinn", 12], [70, "Robustheit", 9],
    [75, "Schmerzunempfindlichkeit", 9], [80, "Trinken", 12], [85, "Wachgabe", 6], [90, "Wahrnehmung", 8], [95, "Einprägen", 4],
    [99, "Berserkergang", null], [100, "freie Wahl", null],
  ],
  rassenFaehigkeiten: {
    Mensch: [], Elf: [["Nachtsicht", 2]], Gnom: [["Nachtsicht", 2], ["Robustheit", 12], ["Hören", 2]],
    Halbling: [["Gute Reflexe", 9], ["Riechen", 2]], Zwerg: [["Nachtsicht", 2], ["Robustheit", 9]],
  },
  sinne: ["Sehen", "Hören", "Riechen", "Sechster Sinn", "Nachtsicht"],

  // S. 33 (Zusatzregel)
  groesse: {
    Mensch: { m: [2, 20, 150], w: [2, 20, 140] }, Elf: { a: [2, 6, 160] }, Gnom: { a: [1, 6, 90] },
    Halbling: { a: [2, 6, 100] }, Zwerg: { a: [1, 6, 130] },
  },
  gewicht: {
    Mensch: { m: [4, 0, -120], w: [4, -4, -120] }, Elf: { a: [4, -8, -120] }, Gnom: { a: [3, 0, -90] },
    Halbling: { a: [3, 3, -90] }, Zwerg: { a: [4, 0, -90] },
  },

  // S. 44: ungelernte Fertigkeiten (Wert in Klammern)
  ungelernt: [
    ["Akrobatik", 6], ["Anführen", 6], ["Balancieren", 6], ["Beredsamkeit", 3], ["Betäuben", 6], ["Bootfahren", 3],
    ["Fallen entdecken", 0], ["Fallenmechanik", 0], ["Geländelauf", 6], ["Klettern", 6], ["Landeskunde", 6],
    ["Menschenkenntnis", 3], ["Reiten", 6], ["Schleichen", 3], ["Schwimmen", 3], ["Seilkunst", 3], ["Spurensuche", 0],
    ["Stehlen", 3], ["Tarnen", 3], ["Tauchen", 6], ["Überleben", 6], ["Verführen", 3], ["Verhören", 3], ["Verstellen", 3],
    ["Wagenlenken", 3],
  ],
  ungelerntRasse: {
    Elf: { Schleichen: 6, Spurensuche: 3 }, Halbling: { Schleichen: 6, Tarnen: 6 },
    Gnom: { Tarnen: 6, "Fallen entdecken": 3, Fallenmechanik: 3, Spurensuche: 3 }, Zwerg: { "Fallen entdecken": 3 },
  },

  // S. 165-167: Grad, Abwehr/Resistenz/Zaubern, Ausdauer
  gradES: [0, 100, 250, 500, 750, 1000, 1250, 1500, 1750, 2000, 2500, 3000, 3500, 4000, 4500, 5000, 6000, 7000, 8000, 9000,
    10000, 12500, 15000, 17500, 20000, 22500, 25000, 30000, 35000, 40000],
  abwehrResistenz: [[1, 11], [2, 12], [5, 13], [10, 14], [15, 15], [20, 16], [25, 17], [30, 18]],
  zaubernGrad: [[1, 11], [2, 12], [4, 13], [6, 14], [8, 15], [10, 16], [15, 17], [20, 18]],
};
