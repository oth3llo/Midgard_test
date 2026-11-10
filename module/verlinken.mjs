// Verlinkt Begriffe in den importierten Texten mit den passenden Kompendium-Einträgen
// (Regelseiten, Zauber, Fertigkeiten, Rüstungen, Zaubermittel). Foundry zeigt @UUID-Verweise als
// anklickbare Links; ein Klick öffnet den Eintrag. Je Text wird jeder Begriff höchstens einmal
// verlinkt, der Eintrag selbst nie. Vor jedem Durchlauf werden die eigenen Links entfernt, so
// dass ein erneuter Import oder ein weiteres Buch die Verlinkung vollständig neu aufbaut.
import { SYSTEM_ID, packId } from "./kategorien.mjs";

export const REGEL_PACK = "midgard-regeln";
const LINK = /@UUID\[([^\]]+)\]\{([^}]*)\}/g;
const ARTIKEL = /^(Der|Die|Das|Den|Dem) /;
// Begriffe, die als Wort zu allgemein sind, um sie überall zu verlinken
const ALLGEMEIN = new Set(["Licht", "Feuer", "Kampf", "Sinne", "Magier", "Hexer", "Druiden", "Priester", "Barden", "Schamanen", "Thaumaturgen",
  "Ordenskrieger", "Umkreis", "Strahl", "Verschiedenes", "Kosten und Dauer", "Trinken", "Raufen", "Einprägen", "Sehen", "Hören", "Riechen"]);
// Weitere Schreibweisen je Regelseite: Einzahl, gebeugte Formen, Kurzformen. „re:“ = regulärer Ausdruck
const ALIASE = {
  "Widerstandswürfe": ["Widerstandswurf", "Widerstandswurfs"], "Erfolgswürfe": ["Erfolgswurf", "Erfolgswurfs"],
  "Prüfwürfe": ["Prüfwurf", "Prüfwurfs", "re:PW(?:[+–-]\\d+)?:[\\p{L}()/+0-9]+"],
  "Aktionsphasen": ["Aktionsphase"], "Zauberduelle": ["Zauberduell", "Zauberduells"], "Die Rüstklassen": ["Rüstklasse", "Rüstklassen"],
  "Glückspunkte (GP)": ["Glückspunkte", "Glückspunkt"], "Wettbewerbe": ["Wettbewerb"], "Schwere Verletzungen": ["schwere Verletzung", "schweren Verletzung"],
  "Kritischer Schaden": ["kritischen Schaden", "kritischer Schaden"], "Kritische Kampfereignisse": ["kritische Kampfereignisse", "kritischen Treffer", "kritischer Treffer"],
  "Freie Prozentwürfe": ["freier Prozentwurf", "freien Prozentwurf"], "Ungelernte Fertigkeiten": ["ungelernte Fertigkeiten", "ungelernte Fertigkeit"],
  "Angriff und Abwehr": ["re:WW(?:[+–-]\\d+)?:Abwehr", "re:EW(?:[+–-]\\d+)?:Angriff"],
  "Der Schaden und die Folgen": ["schweren Schaden", "schwerer Schaden", "leichten Schaden", "leichter Schaden", "schweren Treffer", "schwerer Treffer", "leichten Treffer", "leichter Treffer"],
  "Zaubern und Resistenz - die magischen Fähigkeiten": ["re:WW(?:[+–-]\\d+)?:Resistenz", "re:EW(?:[+–-]\\d+)?:Zaubern"],
  "Wirkungsdauer, Reichweite und Wirkungsbereich": ["Wirkungsbereich", "Wirkungsdauer", "Reichweite"],
  "Zauberdauer im Kampfgeschehen": ["Zauberdauer"], "Der Zwang zur Konzentration": ["Konzentration"],
  "Drei Arten von Magie": ["Geistesmagie", "Körpermagie", "Umgebungsmagie", "Geisteszauber", "Körperzauber", "Umgebungszauber"],
  "Initiativbestimmung": ["Initiative", "Initiativwurf"], "Rüstungsschutz": ["Rüstungsschutzes"],
  "Lebensgefährliche Verletzungen": ["lebensgefährlich verletzt", "lebensgefährlichen Verletzungen"],
  "Heilung und Erholung": ["Regeneration"],
};
const SIGNAL_ZAUBER = "(?:Zauber|Zaubers|Spruch|Spruchs|Sprüche|Wundertat|Dweomer|Dweomerzauber|Zauberlied|Lied|wie)";

const esc = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
const wort = (muster) => `(?<![\\p{L}\\p{N}])(?:${muster})(?![\\p{L}\\p{N}])`;

/** Links in einem Text entfernen (nur die Beschriftung bleibt). */
export const entlinken = (html) => String(html ?? "").replace(LINK, "$2");

/** Begriffsliste: [{muster (RegExp-Quelle), uuid, laenge}] */
async function begriffe() {
  const liste = [];
  const add = (muster, uuid, laenge) => liste.push({ re: new RegExp(muster, "u"), uuid, laenge });
  // Regelseiten
  const regeln = game.packs.get(`world.${REGEL_PACK}`);
  if (regeln) {
    for (const j of await regeln.getDocuments()) {
      for (const p of j.pages) {
        const titel = p.name.trim();
        if (titel.length < 5 || ALLGEMEIN.has(titel)) continue;
        const formen = new Set([titel, titel.replace(ARTIKEL, ""), ...(ALIASE[titel] ?? [])]);
        for (const f of formen) {
          if (f.startsWith("re:")) { add(wort(f.slice(3)), p.uuid, 12); continue; }
          if (f.length >= 5 && !ALLGEMEIN.has(f)) add(wort(esc(f)), p.uuid, f.length);
        }
      }
    }
  }
  const items = async (kat) => {
    const pack = game.packs.get(packId(kat));
    return pack ? Array.from(await pack.getIndex(), (e) => ({ name: e.name, uuid: e.uuid ?? `Compendium.${pack.collection}.Item.${e._id}` })) : [];
  };
  // Zauber: mehrteilige Namen überall, einteilige nur mit Hinweis („Spruch Angst“, „Angst (s. S. 63)“)
  for (const z of await items("zauber")) {
    if (z.name.includes(" ")) add(wort(esc(z.name)), z.uuid, z.name.length);
    else add(`(?<=${SIGNAL_ZAUBER} )${esc(z.name)}(?![\\p{L}])|${wort(esc(z.name))}(?= \\(s\\. S\\.)`, z.uuid, z.name.length);
  }
  // Fertigkeiten: nach EW:/WW:/PW: überall, mehrteilige Namen auch frei
  for (const kat of ["fertigkeiten", "waffenfertigkeiten"]) {
    for (const f of await items(kat)) {
      const n = esc(f.name.replace(/:/g, ": ?"));
      add(`(?<=(?:EW|WW|PW)(?:[+–-]\\d+)?:)${n}(?![\\p{L}])`, f.uuid, f.name.length + 3);
      if (f.name.includes(" ") && f.name.length > 8) add(wort(n), f.uuid, f.name.length);
    }
  }
  for (const r of await items("ruestungen")) add(wort(esc(r.name)), r.uuid, r.name.length);
  for (const g of await items("gegenstaende")) {
    if ((g.name.includes(" ") && g.name.length > 10) || ["Zauberöl", "Weihwasser", "Maganbrot", "Schnellkraut", "Flohpulver", "Berserkerpilz", "Heiltrunk", "Krafttrunk", "Reckentrunk", "Liebestrank"].includes(g.name)) {
      add(wort(esc(g.name)), g.uuid, g.name.length);
    }
  }
  return liste.sort((a, b) => b.laenge - a.laenge);
}

/** Verlinkt einen HTML-Text. Text innerhalb von Tags und bestehende Links bleiben unberührt. */
export function verlinkeText(html, liste, selbst) {
  const benutzt = new Set([selbst]);
  const teile = String(html).split(/(<[^>]+>)/);
  for (const b of liste) {
    if (benutzt.has(b.uuid)) continue;
    for (let i = 0; i < teile.length; i++) {
      const t = teile[i];
      if (!t || t.startsWith("<")) continue;
      // nicht in bereits gesetzte Links hinein ersetzen
      const stuecke = t.split(/(@UUID\[[^\]]+\]\{[^}]*\})/);
      let fertig = false;
      for (let k = 0; k < stuecke.length && !fertig; k += 2) {
        const m = stuecke[k].match(b.re);
        if (!m) continue;
        stuecke[k] = stuecke[k].slice(0, m.index) + `@UUID[${b.uuid}]{${m[0]}}` + stuecke[k].slice(m.index + m[0].length);
        fertig = true;
      }
      if (fertig) { teile[i] = stuecke.join(""); benutzt.add(b.uuid); break; }
    }
  }
  return teile.join("");
}

/** Verlinkt alle importierten Texte in allen Kompendien neu. Gibt die Zahl geänderter Einträge zurück. */
export async function allesVerlinken() {
  const liste = await begriffe();
  let geaendert = 0;
  const schreiben = async (pack, aenderungen, Klasse) => {
    if (!aenderungen.length) return;
    const gesperrt = pack.locked;
    if (gesperrt) await pack.configure({ locked: false });
    try { await Klasse.updateDocuments(aenderungen, { pack: pack.collection }); }
    finally { if (gesperrt) await pack.configure({ locked: true }); }
    geaendert += aenderungen.length;
  };
  for (const kat of ["fertigkeiten", "waffenfertigkeiten", "waffen", "ruestungen", "zauber", "rassen", "typen", "gegenstaende"]) {
    const pack = game.packs.get(packId(kat));
    if (!pack) continue;
    const aenderungen = [];
    for (const d of await pack.getDocuments()) {
      if (!d.getFlag(SYSTEM_ID, "pdfImport")?.seite || !d.system.beschreibung) continue;
      const neu = verlinkeText(entlinken(d.system.beschreibung), liste, d.uuid);
      if (neu !== d.system.beschreibung) aenderungen.push({ _id: d.id, "system.beschreibung": neu });
    }
    await schreiben(pack, aenderungen, Item);
  }
  const regeln = game.packs.get(`world.${REGEL_PACK}`);
  if (regeln) {
    const gesperrt = regeln.locked;
    if (gesperrt) await regeln.configure({ locked: false });
    try {
      for (const j of await regeln.getDocuments()) {
        const seiten = [];
        for (const p of j.pages) {
          const alt = p.text?.content ?? "";
          const neu = verlinkeText(entlinken(alt), liste, p.uuid);
          if (neu !== alt) seiten.push({ _id: p.id, "text.content": neu });
        }
        if (seiten.length) { await j.updateEmbeddedDocuments("JournalEntryPage", seiten); geaendert += seiten.length; }
      }
    } finally { if (gesperrt) await regeln.configure({ locked: true }); }
  }
  return geaendert;
}
