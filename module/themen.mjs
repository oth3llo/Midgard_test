// Farbschemata im klassischen Stil: Fensterrahmen dunkel mit Gold- bzw. Metallkante, innen Pergament
// (hell) oder dunkle Fläche. Drei helle und drei dunkle Schemata; jedes setzt alle Farbvariablen
// (dieselben wie in style.css). „auto“ folgt dem hellen oder dunklen Foundry-Design.
const HELL_AKZENTE = {
  a1: "#a8322a", a1h: "#f0d6cf", a2: "#b8692a", a2h: "#f1dcc4", a3: "#b08a2e", a3h: "#efe2b8", a4: "#3e7a3a", a4h: "#d8e8cf",
  a5: "#2f6f74", a5h: "#d0e5e4", a6: "#2d4f8a", a6h: "#d7e0ef", a7: "#6a4a8c", a7h: "#e3d8ee",
  a1t: "#fff", a2t: "#fff", a3t: "#1f1608", a4t: "#fff", a5t: "#fff", a6t: "#fff", a7t: "#fff",
};
const DUNKEL_AKZENTE = {
  a1: "#e0675a", a1h: "#3a2226", a2: "#e8914a", a2h: "#3a2a20", a3: "#e2c06a", a3h: "#363022", a4: "#74c46a", a4h: "#1f3324",
  a5: "#4fc3b8", a5h: "#173335", a6: "#6f97e0", a6h: "#1f2b48", a7: "#a98ae0", a7h: "#2a2442",
  a1t: "#120d0a", a2t: "#120d0a", a3t: "#120d0a", a4t: "#120d0a", a5t: "#120d0a", a6t: "#120d0a", a7t: "#120d0a",
};
const HELL_ZUSTAND = { gut: "#2e6b34", schlecht: "#a8261d", warn: "#8a5a00", "warn-grund": "#f3e2b0", "fehler-grund": "#f1d2c9" };
const DUNKEL_ZUSTAND = { gut: "#74c46a", schlecht: "#ef6a5c", warn: "#e8b955", "warn-grund": "#3a3020", "fehler-grund": "#3d2229" };

export const THEMEN = {
  pergament: {
    name: "Pergament", hell: true, beschreibung: "Nachtblaue Rahmen mit Goldkante, warmes Pergament (Standard hell)",
    farben: { grund: "#e8dab8", flaeche: "#f3e8cc", text: "#2a2015", leise: "#6b5a43", rand: "#1d2742", schatten: "rgba(40, 28, 10, .35)", linie: "#c9b083",
      akzent: "#2d4f8a", "akzent-hell": "#d9e1ee", "auf-akzent": "#fff8e6", ...HELL_ZUSTAND, raster: "rgba(110, 80, 30, .05)",
      rahmen: "#18213a", "rahmen-hell": "#2b3a63", "rahmen-text": "#e9c877", gold: "#c49a45", "gold-dunkel": "#8a6a2a",
      knopf: "#2d4f8a", "knopf-hell": "#3d66ad", "knopf-text": "#f6ecd2", "balken-lp": "#b52a20", "balken-ap": "#3f8a35", ...HELL_AKZENTE },
  },
  elfenhain: {
    name: "Elfenhain", hell: true, beschreibung: "Waldgrüne Rahmen, Messing, helles Salbeipergament",
    farben: { grund: "#dfe6cf", flaeche: "#eef2e0", text: "#1e2a1c", leise: "#56654f", rand: "#1f3324", schatten: "rgba(20, 40, 20, .3)", linie: "#b9c79f",
      akzent: "#2f6b4a", "akzent-hell": "#d3e6d9", "auf-akzent": "#f7f4e2", ...HELL_ZUSTAND, raster: "rgba(40, 70, 30, .05)",
      rahmen: "#1d3326", "rahmen-hell": "#2f5240", "rahmen-text": "#e6cf86", gold: "#b8994a", "gold-dunkel": "#7f6a2c",
      knopf: "#2f6b4a", "knopf-hell": "#3f8a60", "knopf-text": "#f3f0dc", "balken-lp": "#b52a20", "balken-ap": "#3f8a35", ...HELL_AKZENTE, a6: "#2f6b4a", a6h: "#d3e6d9" },
  },
  gletscher: {
    name: "Gletscher", hell: true, beschreibung: "Stahlblaue Rahmen mit Silberkante, kühles Eisweiß",
    farben: { grund: "#dfe7ee", flaeche: "#eef3f7", text: "#18222e", leise: "#50607a", rand: "#1c2a40", schatten: "rgba(20, 35, 60, .3)", linie: "#b8c6d6",
      akzent: "#2b5f9e", "akzent-hell": "#d6e3f3", "auf-akzent": "#f6f9fc", ...HELL_ZUSTAND, raster: "rgba(30, 60, 100, .04)",
      rahmen: "#1a2a44", "rahmen-hell": "#2e4a72", "rahmen-text": "#d6e2f0", gold: "#9fb2c8", "gold-dunkel": "#6b7f99",
      knopf: "#2b5f9e", "knopf-hell": "#3d78c2", "knopf-text": "#f2f6fb", "balken-lp": "#b23a3a", "balken-ap": "#2f8a5a", ...HELL_AKZENTE },
  },
  mitternacht: {
    name: "Mitternacht", hell: false, beschreibung: "Tiefes Nachtblau mit Goldkante (Standard dunkel)",
    farben: { grund: "#141a2c", flaeche: "#1c2439", text: "#ece2c8", leise: "#a99f88", rand: "#070a14", schatten: "rgba(0, 0, 0, .6)", linie: "#2f3a58",
      akzent: "#6f97e0", "akzent-hell": "#26355a", "auf-akzent": "#0e1426", ...DUNKEL_ZUSTAND, raster: "rgba(255, 255, 255, .02)",
      rahmen: "#0e1426", "rahmen-hell": "#1f2b4c", "rahmen-text": "#e2c06a", gold: "#c49a45", "gold-dunkel": "#7d6229",
      knopf: "#2d4f8a", "knopf-hell": "#3d66ad", "knopf-text": "#f3e7c9", "balken-lp": "#c8392c", "balken-ap": "#4f9a3f", ...DUNKEL_AKZENTE },
  },
  glut: {
    name: "Glut", hell: false, beschreibung: "Kohle und Feuerschein, Kupferkante",
    farben: { grund: "#1d1612", flaeche: "#28201a", text: "#f0e3d0", leise: "#b9a58f", rand: "#0a0604", schatten: "rgba(0, 0, 0, .6)", linie: "#47362a",
      akzent: "#e8813a", "akzent-hell": "#43291b", "auf-akzent": "#1d1612", ...DUNKEL_ZUSTAND, raster: "rgba(255, 200, 150, .025)",
      rahmen: "#1a0f0a", "rahmen-hell": "#3b2216", "rahmen-text": "#f0b25a", gold: "#d08a3a", "gold-dunkel": "#8a5420",
      knopf: "#8a3b1d", "knopf-hell": "#b34e25", "knopf-text": "#fbe9d0", "balken-lp": "#c8392c", "balken-ap": "#5a9a3f", ...DUNKEL_AKZENTE, a6: "#e8813a", a6h: "#43291b" },
  },
  tiefsee: {
    name: "Tiefsee", hell: false, beschreibung: "Nachtblau und Türkis, Perlmuttkante",
    farben: { grund: "#0e1a20", flaeche: "#15262e", text: "#dff0f2", leise: "#95b4bb", rand: "#04090c", schatten: "rgba(0, 0, 0, .6)", linie: "#22424c",
      akzent: "#4fd1c5", "akzent-hell": "#173a40", "auf-akzent": "#0e1a20", ...DUNKEL_ZUSTAND, raster: "rgba(150, 255, 240, .02)",
      rahmen: "#08161c", "rahmen-hell": "#143642", "rahmen-text": "#7fe0d4", gold: "#4fb8ac", "gold-dunkel": "#2a6f68",
      knopf: "#1d5f66", "knopf-hell": "#27808a", "knopf-text": "#e6fbf8", "balken-lp": "#c8392c", "balken-ap": "#3f9a6a", ...DUNKEL_AKZENTE, a6: "#4fd1c5", a6h: "#173a40" },
  },
};

export const THEMA_WAHL = {
  auto: "Automatisch (folgt dem Foundry-Design)",
  ...Object.fromEntries(Object.entries(THEMEN).map(([id, t]) => [id, `${t.hell ? "Hell" : "Dunkel"} · ${t.name}`])),
};

/** Elemente, die das Farbschema übernehmen: Bögen, Browser, Regel-Journale, Startdialog. */
const FENSTER = ".midgard-regelwerk, .midgard-start, .midgard-regelwerke, .application.midgard-abenteurer, .application.midgard-browser, .application.midgard-gegenstand";
const ZIELE = `:is(.midgard-cmt.midgard-cmt, ${FENSTER})`;
// Hintergrundtextur (eigene Grafik bilder/textur/hell bzw. dunkel), sonst keine
const block = (sel, t) => `${sel} { ${Object.entries(t.farben).map(([k, v]) => `--${k}: ${v};`).join(" ")} --bild-pergament: var(--bild-textur-${t.hell ? "hell" : "dunkel"}, none); color-scheme: ${t.hell ? "light" : "dark"}; }`;

/** CSS aller Schemata; ohne Wahl erhalten Journale und Dialoge Pergament bzw. Mitternacht nach Foundry-Design. */
export function themenCss() {
  const fremd = `:is(${FENSTER})`;
  return [
    block(fremd, THEMEN.pergament),
    block(`.theme-light ${fremd}`, THEMEN.pergament),
    block(`.theme-dark ${fremd}`, THEMEN.mitternacht),
    ...Object.entries(THEMEN).map(([id, t]) => block(`body.midgard-thema-${id} ${ZIELE}`, t)),
  ].join("\n");
}

/** Schema anwenden (Klasse am body; CSS wird einmal eingefügt). */
export function themaAnwenden(id) {
  if (!document.getElementById("midgard-themen")) {
    const stil = document.createElement("style");
    stil.id = "midgard-themen";
    stil.textContent = themenCss();
    document.head.append(stil);
  }
  for (const k of [...document.body.classList]) if (k.startsWith("midgard-thema-")) document.body.classList.remove(k);
  if (THEMEN[id]) document.body.classList.add(`midgard-thema-${id}`);
  document.body.dataset.midgardThema = THEMEN[id] ? id : "auto";
}
