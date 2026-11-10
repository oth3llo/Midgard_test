// Midgard 5 als Foundry-System (Foundry VTT 14).
// Charakterbogen mit Reitern (module/abenteurer-bogen.mjs); Erschaffung und Lernen laufen vorerst
// über das eingebettete Werkzeug der Browser-Fassung (app.js), dessen Ergebnisse in die Bogenwerte
// und eingebetteten Gegenstände übernommen werden. Die Regeldaten liegen in Welt-Kompendien
// (module/kompendien.mjs) und sind über den Kompendium-Browser erreichbar.
import "./daten/kodex.js";
import "./daten/lernkosten.js";
import "./daten/zauber.js";
import "./app.js";
import { GEGENSTAND_MODELLE } from "./module/datenmodelle.mjs";
import { einstellungenRegistrieren, kompendienAufbauen, KOMPENDIUM_STAND } from "./module/kompendien.mjs";
import { KompendiumBrowser, knopfEinbauen } from "./module/browser.mjs";
import { GegenstandBogen } from "./module/gegenstand-bogen.mjs";
import { AbenteurerDaten } from "./module/akteur.mjs";
import { AbenteurerBogen } from "./module/abenteurer-bogen.mjs";
import { pdfImportStarten, pdfImportieren } from "./module/pdf-import.mjs";
import { einstellungenRegistrieren as wurfEinstellungen } from "./module/wuerfe.mjs";
import { einstellungenRegistrieren as kampfEinstellungen, socketEinrichten, karteEinrichten, angreifen } from "./module/kampf.mjs";

const SYSTEM_ID = "midgard5-cmt";

Hooks.once("init", () => {
  CONFIG.Actor.dataModels.abenteurer = AbenteurerDaten;
  foundry.applications.apps.DocumentSheetConfig.registerSheet(Actor, SYSTEM_ID, AbenteurerBogen, {
    types: ["abenteurer"],
    makeDefault: true,
    label: "MIDGARD.Bogen",
  });
  Object.assign(CONFIG.Item.dataModels, GEGENSTAND_MODELLE);
  foundry.applications.apps.DocumentSheetConfig.registerSheet(Item, SYSTEM_ID, GegenstandBogen, {
    types: Object.keys(GEGENSTAND_MODELLE),
    makeDefault: true,
    label: "MIDGARD.GegenstandBogen",
  });
  einstellungenRegistrieren();
  wurfEinstellungen();
  kampfEinstellungen();
  game.midgard = { browser: (kat) => KompendiumBrowser.oeffnen(kat), kompendienAufbauen, angreifen, pdfImport: pdfImportStarten, pdfImportieren, stand: KOMPENDIUM_STAND };
  console.log(`${SYSTEM_ID} | Midgard-CMT ${game.system.version} geladen`);
});

Hooks.once("ready", async () => {
  socketEinrichten();
  try {
    await kompendienAufbauen();
  } catch (fehler) {
    console.error(`${SYSTEM_ID} | Kompendien konnten nicht eingerichtet werden`, fehler);
    ui.notifications.error("Midgard: Kompendien konnten nicht eingerichtet werden (Details in der Konsole).");
  }
});

Hooks.on("renderCompendiumDirectory", knopfEinbauen);
Hooks.on("midgardKompendienGeaendert", () => KompendiumBrowser.zuruecksetzen());
Hooks.on("renderChatMessageHTML", karteEinrichten);
