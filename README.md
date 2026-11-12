# Midgard 5 für Foundry VTT

Inoffizielles Foundry-System (Foundry VTT 14) für Midgard 5: Charakterbogen mit Reitern, Würfe und Kampf mit Abwehraufforderung, Regeldaten (Fertigkeiten, Waffen, Rüstungen, Zauber, Rassen, Typen) als Kompendien mit Kompendium-Browser, Charaktererschaffung nach dem Kodex und Lernen im Spielverlauf mit EP, Praxispunkten und Gold. Für den privaten Gebrauch einer Spielrunde.

Die Kompendien (Ordner „Midgard 5“) sind leer, bis der Spielleiter seine eigenen PDFs (Der Kodex, Das Arkanum) per Knopf „Regelwerk-PDF importieren“ im Kompendium-Reiter einliest. Der Import legt Zauber, Fertigkeiten, Waffen, Rüstungen, Typen, Rassen, Ausrüstung und Zaubermittel mit Spielwerten und Beschreibung an; außerdem ein Regel-Kompendium aus den Regelkapiteln beider Bücher, mit Verweisen zwischen allen Einträgen. Die Texte landen nur in der eigenen Welt. Vor dem Import bestätigt der Spielleiter, die PDFs rechtmäßig erworben zu haben; erkannt werden die Bücher am Inhalt, nicht am Dateinamen. Erschaffung und Lernen sind erst nach dem Import des Kodex freigeschaltet.

Gestaltung im klassischen Stil (Rahmen mit Goldkante, Pergament, Pixel-Art-Grafiken) mit sechs Farbschemata zur Wahl. Unter Spieleinstellungen › Midgard 5 lassen sich unter anderem Würfelmodus und Methode der Erschaffung, Hausregeln, kritische Ereignisse, verdeckte Würfe, die Freigabe neuer Charaktere durch die Spielleitung, Farbschema und Schriftgröße einstellen; dort liegen auch „Regelwerke importieren“ und „EP verteilen“. Beim Laden der Welt weist ein Startfenster auf den notwendigen Kodex-Import hin.

Enthält pdf.js (Mozilla, Apache License 2.0, `vendor/pdfjs/LICENSE`).

## Installation in Foundry

1. Im Startbildschirm unter „Spielsysteme“ auf „System installieren“ gehen.
2. Unten bei „Manifest-URL“ eintragen:
   `https://raw.githubusercontent.com/oth3llo/Midgard_test/main/system.json`
3. „Installieren“. Neue Versionen meldet Foundry danach selbst unter „Spielsysteme“ („Update verfügbar“).

## Versionen

Jede Version liegt als eigenes ZIP unter `pakete/` (z. B. `pakete/midgard5-cmt-0.3.0.zip`). `system.json` im Wurzelverzeichnis beschreibt immer die neueste Version; Foundry vergleicht sie mit der installierten und bietet das Update an.

Dieses Repository enthält nur das gebaute System. Entwickelt wird es in einem privaten Repository; Inhalte hier nicht von Hand ändern, sie werden bei jeder Version ersetzt.

Midgard ist ein Rollenspiel des Verlags für F&SF-Spiele. Dieses System ist kein offizielles Produkt und enthält keine Regel- oder Beschreibungstexte aus den Büchern.

Schrift: Alegreya und Alegreya SC, SIL Open Font License 1.1 (`schrift/OFL-Alegreya.txt`).
