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
import { einstellungRegistrieren as textFormatRegistrieren, texteUmstellen, kaestenAufwerten } from "./module/textformat.mjs";
import { einstellungenRegistrieren, kompendienAufbauen, kompendienOhnePdf, kodexImportiertPruefen, KOMPENDIUM_STAND } from "./module/kompendien.mjs";
import { KompendiumBrowser, knopfEinbauen } from "./module/browser.mjs";
import { GegenstandBogen } from "./module/gegenstand-bogen.mjs";
import { AbenteurerDaten } from "./module/akteur.mjs";
import { AbenteurerBogen } from "./module/abenteurer-bogen.mjs";
import { GegnerDaten, GegnerBogen, tokenHookEinrichten, gegnerAuswuerfeln, einstellungenRegistrieren as gegnerEinstellungen } from "./module/gegner.mjs";
import { pdfImportStarten, pdfImportieren, einstellungenRegistrieren as importEinstellungen } from "./module/pdf-import.mjs";
import { updatePruefen } from "./module/update.mjs";
import { einstellungenRegistrieren as wurfEinstellungen } from "./module/wuerfe.mjs";
import { einstellungenRegistrieren as kampfEinstellungen, socketEinrichten, karteEinrichten, angreifen } from "./module/kampf.mjs";
import { tabellenwurfEinrichten } from "./module/tabellenwurf.mjs";
import { knopfEinrichten as weltImportEinrichten, packInWelt, importDialog } from "./module/kompendium-import.mjs";
import { einstellungenRegistrieren as systemEinstellungen, beimStart, journalDarstellen, chatKarteAnpassen, StartDialog, RegelwerkeFenster, EpFenster, epVerteilen } from "./module/einstellungen.mjs";

const SYSTEM_ID = "midgard5-cmt";

Hooks.once("init", () => {
  CONFIG.Actor.dataModels.abenteurer = AbenteurerDaten;
  foundry.applications.apps.DocumentSheetConfig.registerSheet(Actor, SYSTEM_ID, AbenteurerBogen, {
    types: ["abenteurer"],
    makeDefault: true,
    label: "MIDGARD.Bogen",
  });
  CONFIG.Actor.dataModels.gegner = GegnerDaten;
  foundry.applications.apps.DocumentSheetConfig.registerSheet(Actor, SYSTEM_ID, GegnerBogen, {
    types: ["gegner"],
    makeDefault: true,
    label: "MIDGARD.GegnerBogen",
  });
  Object.assign(CONFIG.Item.dataModels, GEGENSTAND_MODELLE);
  foundry.applications.apps.DocumentSheetConfig.registerSheet(Item, SYSTEM_ID, GegenstandBogen, {
    types: Object.keys(GEGENSTAND_MODELLE),
    makeDefault: true,
    label: "MIDGARD.GegenstandBogen",
  });
  systemEinstellungen(); // zuerst, damit sie oben in den Spieleinstellungen stehen
  einstellungenRegistrieren();
  wurfEinstellungen();
  importEinstellungen();
  kampfEinstellungen();
  gegnerEinstellungen();
  tokenHookEinrichten();
  weltImportEinrichten();
  textFormatRegistrieren();
  game.midgard = { browser: (kat) => KompendiumBrowser.oeffnen(kat), kompendienAufbauen, kompendienOhnePdf, angreifen, gegnerAuswuerfeln, inWelt: (id, o) => packInWelt(game.packs.get(id), o), inWeltDialog: (id) => importDialog(game.packs.get(id)), pdfImport: pdfImportStarten, pdfImportieren, texteUmstellen, kaestenAufwerten, updatePruefen, stand: KOMPENDIUM_STAND,
    start: () => StartDialog.oeffnen(), regelwerke: () => new RegelwerkeFenster().render({ force: true }),
    epVerteilen: (verteilung, anlass) => (verteilung ? epVerteilen(verteilung, anlass) : new EpFenster().render({ force: true })) };
  console.log(`${SYSTEM_ID} | Midgard-CMT ${game.system.version} geladen`);
});

Hooks.once("ready", async () => {
  socketEinrichten();
  tabellenwurfEinrichten();
  updatePruefen();
  try {
    await kompendienAufbauen();
    await kodexImportiertPruefen();
    await texteUmstellen();
  } catch (fehler) {
    console.error(`${SYSTEM_ID} | Kompendien konnten nicht eingerichtet werden`, fehler);
    ui.notifications.error("Midgard: Kompendien konnten nicht eingerichtet werden (Details in der Konsole).");
  }
  beimStart(); // Farbschema und Startfenster (nach der Kodex-Prüfung, damit der Hinweis stimmt)
});

// Regel-Journale in der Leseansicht (Foundry ruft den Hook je Klasse der Vererbungskette auf)
for (const h of ["renderJournalEntrySheet", "renderJournalEntryPageSheet"]) Hooks.on(h, journalDarstellen);

Hooks.on("renderCompendiumDirectory", knopfEinbauen);
Hooks.on("midgardKompendienGeaendert", () => KompendiumBrowser.zuruecksetzen());
// Kodex importiert oder entfernt: offene Abenteurerbögen neu zeichnen, damit die Sperre verschwindet bzw. erscheint
Hooks.on("midgardKodexStatus", () => {
  const offen = foundry.applications?.instances ? [...foundry.applications.instances.values()] : Object.values(ui.windows ?? {});
  for (const app of offen) if ((app instanceof AbenteurerBogen || app instanceof StartDialog || app instanceof RegelwerkeFenster) && app.rendered) app.render();
});
Hooks.on("renderChatMessageHTML", karteEinrichten);
Hooks.on("renderChatMessageHTML", chatKarteAnpassen);
