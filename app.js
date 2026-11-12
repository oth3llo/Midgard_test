/* Midgard 5 Charaktererschaffung und Lernen nach dem Kodex.
   Einbettbar: MidgardCMT.starte({ wurzel, modus, zustand, speichere, cssUrl })
   - modus "browser": eigenständige Seite, mehrere Charaktere im Browser-Speicher
   - modus "foundry": ein Charakter je Aufruf, gespeichert über speichere(zustand)
   Vorgaben der Spielleitung (Foundry-Einstellungen): wuerfelModus "frei" | "digital" | "tisch",
   methode "I" | "II" (sonst freie Wahl), wurfMelden({ aktion, schritt, wuerfe: [[Seiten, Ergebnis], …] }),
   mindestsumme (Hausregel, 0 = aus), neuanfaenge (erlaubte Neuanfänge der Eigenschaften, 0 = unbegrenzt),
   sperren() → { erschaffung: Text|null, lernen: Text|null } (Freigabe durch die Spielleitung) */
(function () {
  "use strict";

  // Ein Wertfeld löst beim Verlassen ein Neuzeichnen aus. Passiert das mitten in einem Klick
  // (Maustaste schon gedrückt), würde der Klick ins Leere gehen. Dann wird erst danach gezeichnet.
  let zeigerUnten = false;
  const wartend = new Set();
  document.addEventListener("pointerdown", () => { zeigerUnten = true; }, true);
  document.addEventListener("pointerup", () => {
    setTimeout(() => { zeigerUnten = false; for (const f of [...wartend]) { wartend.delete(f); f(); } }, 0);
  }, true);

  function starte(opts) {
  const FOUNDRY = opts.modus === "foundry";
  const wurzel = opts.wurzel;
  const K = window.KODEX;
  const L = window.LERNKOSTEN;
  const ZAUBER = window.ZAUBER || []; // Zauber des Arkanums mit Gruppe und Spruchstufe
  const SPEICHER = "midgard5-charakter";        // alte Einzelablage (wird übernommen)
  const BIBLIOTHEK = "midgard5-bibliothek";     // alle Charaktere dieses Browsers
  // Hausregel: Summe der 6 Basiseigenschaften, darunter darf neu gewürfelt werden (0 = Hausregel aus)
  const MINDESTSUMME = Number.isFinite(opts.mindestsumme) ? opts.mindestsumme : 420;
  const NEUANFAENGE = Number.isFinite(opts.neuanfaenge) && opts.neuanfaenge > 0 ? opts.neuanfaenge : null;
  const sperren = () => { try { return (opts.sperren && opts.sperren()) || {}; } catch (e) { return {}; } };

  // ---------------------------------------------------------------- Hilfen
  const $ = (sel) => wurzel.querySelector(sel);
  function h(tag, attrs, ...kinder) {
    const el = document.createElement(tag);
    for (const [k, v] of Object.entries(attrs || {})) {
      if (v === null || v === undefined || v === false) continue;
      if (k === "class") el.className = v;
      else if (k.startsWith("on")) el.addEventListener(k.slice(2), v);
      else if (k === "html") el.innerHTML = v;
      else el.setAttribute(k, v === true ? "" : v);
    }
    for (const kind of kinder.flat(Infinity)) {
      if (kind === null || kind === undefined || kind === false) continue;
      el.append(kind instanceof Node ? kind : document.createTextNode(String(kind)));
    }
    return el;
  }
  // Würfe eines Würfeln-Knopfs werden gesammelt und danach gemeldet (z. B. in den Foundry-Chat)
  let wurfPuffer = null;
  const W = (n) => { const w = 1 + Math.floor(Math.random() * n); if (wurfPuffer) wurfPuffer.push([n, w]); return w; };
  const WUERFEL_MODUS = ["digital", "tisch"].includes(opts.wuerfelModus) ? opts.wuerfelModus : "frei";
  const METHODE_FEST = ["I", "II"].includes(opts.methode) ? opts.methode : null;
  const Wn = (anzahl, seiten) => Array.from({ length: anzahl }, () => W(seiten));
  const summe = (a) => a.reduce((x, y) => x + y, 0);
  const fl = Math.floor;
  const zahl = (v) => (v === "" || v === null || v === undefined || isNaN(+v) ? null : +v);
  const vz = (n) => (n === null || n === undefined ? "–" : n > 0 ? "+" + n : n < 0 ? "–" + Math.abs(n) : "0");
  const fmt = (n) => (n === null || n === undefined ? "–" : n.toLocaleString("de-DE"));
  const lernName = (name) => K.lernName[name] || name;
  const fertigkeitDaten = (name) => L.fertigkeiten.find((f) => f.name.toLowerCase() === lernName(name).toLowerCase());
  const waffenDaten = (name) => L.waffen.find((w) => w.name === name);

  // ---------------------------------------------------------------- Zustand
  function leererZustand() {
    return {
      version: 1, id: neueId(), schritt: 0, ansicht: null,
      name: "", spieler: "", geschlecht: "m", rasse: "Mensch",
      methode: "II", eig: { St: null, Gs: null, Gw: null, Ko: null, In: null, Zt: null },
      toolWuerfel: false, m1: {}, groesseWurf: null, gewichtWurf: null,
      wuerfe: {}, m2: { wuerfe: Array(9).fill(null), zuordnung: {} },
      pAwurf: null, Wkwurf: null, Au: null, festPA: null, festWk: null,
      klasse: null,
      lpWurf: null, apWurf: null, bWurf: null,
      haendigkeitWurf: null, gestaltGroesse: "mittelgroß", gestaltFigur: "normal",
      groesse: null, gewicht: null, alter: "",
      standWurf: null, heimat: "", muttersprache: "", gemeinsprache: "Comentang", glaube: "",
      besondereWurf: null, besondereFrei: "", besondereZweit: null,
      typischWahl: {}, typischSpez: {},
      kaeufe: [],   // {name, spez, wert, le, topf, kosten, extra}
      waffen: [],   // {name, wert, kosten, topf}
      zauber: [],   // {name, gruppe, le}
      typischerZauber: null, magierSpezial: null,
      spezialwaffen: [], ausruestung: "",
      spiel: leeresSpiel(),
    };
  }
  // Spielverlauf: EP-Konto, Gold, Praxispunkte, Steigerungen, später gelernte Fertigkeiten/Zauber, Protokoll
  function leeresSpiel() {
    return { es: 0, ep: 0, gold: 0, pp: {}, werte: {}, neu: [], protokoll: [], apPlus: 0, gradBestaetigt: 1 };
  }
  function neueId() { return "c" + Date.now().toString(36) + Math.random().toString(36).slice(2, 7); }
  function normalisieren(obj) {
    const c = Object.assign(leererZustand(), obj);
    c.spiel = Object.assign(leeresSpiel(), obj.spiel || {});
    if (!obj.id) c.id = neueId();
    return c;
  }
  function bibliothekLaden() {
    try {
      const t = localStorage.getItem(BIBLIOTHEK);
      if (t) {
        const b = JSON.parse(t);
        for (const id of Object.keys(b.charaktere)) b.charaktere[id] = normalisieren(b.charaktere[id]);
        if (Object.keys(b.charaktere).length) return b;
      }
      const alt = localStorage.getItem(SPEICHER);
      if (alt) { const c = normalisieren(JSON.parse(alt)); return { aktiv: c.id, charaktere: { [c.id]: c } }; }
    } catch (e) { /* gesperrter oder kaputter Speicher: neu beginnen */ }
    const c = leererZustand();
    return { aktiv: c.id, charaktere: { [c.id]: c } };
  }
  let BIBL, S;
  if (FOUNDRY) {
    S = normalisieren(opts.zustand || {});
    BIBL = { aktiv: S.id, charaktere: { [S.id]: S } };
    // Vorgaben der Spielleitung gehen den eigenen Einstellungen vor
    if (WUERFEL_MODUS !== "frei") S.toolWuerfel = WUERFEL_MODUS === "digital";
    // feste Methode nur, solange noch keine Eigenschaft steht (bestehende Charaktere behalten ihre Würfe)
    if (METHODE_FEST && Object.values(S.eig || {}).every((v) => v === null || v === undefined)) S.methode = METHODE_FEST;
  } else {
    BIBL = bibliothekLaden();
    S = BIBL.charaktere[BIBL.aktiv] || Object.values(BIBL.charaktere)[0];
  }
  function speichern() {
    if (FOUNDRY) { if (opts.speichere) opts.speichere(S, auswertung()); return; }
    BIBL.charaktere[S.id] = S; BIBL.aktiv = S.id;
    try { localStorage.setItem(BIBLIOTHEK, JSON.stringify(BIBL)); } catch (e) { /* privat/gesperrt: ohne Speicher weiter */ }
  }

  // ---------------------------------------------------------------- Regeln
  const bonus = (w) => (w === null ? null : w <= 5 ? -2 : w <= 20 ? -1 : w <= 80 ? 0 : w <= 95 ? 1 : 2);
  const klasse = () => (S.klasse ? K.klassen[S.klasse] : null);
  const istZauberer = () => klasse() && klasse().art === "Z";
  const istKaempfer = () => klasse() && klasse().art !== "Z";
  const kannZaubern = () => klasse() && (klasse().art === "Z" || klasse().art === "ZK");
  const istKlein = () => ["Gnom", "Halbling"].includes(S.rasse);

  // pA und Wk werden bei der Erschaffung aus Wurf, In und Ko berechnet. Ab dem ersten Gradaufstieg
  // sind sie festgeschrieben: steigen später In oder Ko, ändern sie sich nicht mit (Kodex S. 166).
  function pARoh() { return S.pAwurf === null || S.eig.In === null ? null : Math.min(100, Math.max(1, S.pAwurf + 4 * fl(S.eig.In / 10) - 20)); }
  function WkRoh() { return S.Wkwurf === null || S.eig.Ko === null || S.eig.In === null ? null : Math.min(100, Math.max(1, S.Wkwurf + 2 * (fl(S.eig.Ko / 10) + fl(S.eig.In / 10)) - 20)); }
  function pA() { return S.festPA !== null && S.festPA !== undefined ? S.festPA : pARoh(); }
  function Wk() { return S.festWk !== null && S.festWk !== undefined ? S.festWk : WkRoh(); }
  function festschreiben() { if (S.festPA === null || S.festPA === undefined) { S.festPA = pARoh(); S.festWk = WkRoh(); } }
  function wert(e) { return e === "pA" ? pA() : e === "Wk" ? Wk() : e === "Au" ? S.Au : S.eig[e]; }

  function berechne() {
    const e = S.eig, r = {};
    r.AnB = bonus(e.Gs); r.AbB = bonus(e.Gw); r.ZauB = bonus(e.Zt);
    const zus = istZauberer() ? [2, 2] : istKaempfer() ? [0, 1] : [0, 0];
    if (S.rasse === "Mensch") {
      r.ResG = bonus(e.In) === null ? null : bonus(e.In) + zus[0];
      r.ResK = bonus(e.Ko) === null ? null : bonus(e.Ko) + zus[1];
    } else {
      const fest = { Elf: 2, Gnom: 4, Halbling: 4, Zwerg: 3 }[S.rasse];
      r.ResG = fest + zus[0]; r.ResK = fest + zus[1];
    }
    r.AusB = e.Ko === null || e.St === null ? null : fl(e.Ko / 10) + fl(e.St / 20);
    r.SchB = e.St === null || e.Gs === null ? null : fl(e.St / 20) + fl(e.Gs / 30) - 3;
    const lpRasse = { Gnom: -3, Halbling: -2, Zwerg: 1 }[S.rasse] || 0;
    r.LP = S.lpWurf === null || e.Ko === null ? null : S.lpWurf + 7 + fl(e.Ko / 10) + lpRasse;
    r.AP = S.apWurf === null || r.AusB === null || !klasse() ? null : S.apWurf + 1 + r.AusB + klasse().ap;
    r.B = S.bWurf === null ? null : S.bWurf + bFormel().plus;
    r.Raufen = e.St === null || e.Gw === null ? null : fl((e.St + e.Gw) / 20) + r.AnB + (S.rasse === "Zwerg" ? 1 : 0);
    r.Trinken = e.Ko === null ? null : fl(e.Ko / 10);
    r.Wahrnehmung = 6;
    // besondere Fähigkeiten zusammenführen
    const f = {};
    for (const [n, w] of K.rassenFaehigkeiten[S.rasse]) f[n] = w;
    for (const b of besondereListe()) {
      if (b.name === "Trinken") { r.Trinken = 12; continue; }
      if (b.name === "Wahrnehmung") { r.Wahrnehmung = 8; continue; }
      // Abzug auf einen angeborenen Sinn hebt ihn auf (S. 27), sonst zählt der bessere Wert
      if (f[b.name] !== undefined && b.wert < 0) f[b.name] += b.wert;
      else f[b.name] = Math.max(f[b.name] ?? -99, b.wert);
    }
    r.faehigkeiten = Object.entries(f).filter(([, w]) => w !== 0).map(([n, w]) => ({ name: n, wert: w }));
    r.SG = S.rasse === "Halbling" ? 4 : 0;
    return r;
  }
  function bFormel() {
    return { Gnom: { n: 2, plus: 8 }, Halbling: { n: 2, plus: 8 }, Zwerg: { n: 3, plus: 12 } }[S.rasse] || { n: 4, plus: 16 };
  }
  function besondereAus(w) {
    if (w === null) return null;
    const z = K.besondere.find(([bis]) => w <= bis);
    if (!z) return null;
    let [, name, wertB] = z;
    if (name === "Berserkergang") wertB = Wk() === null ? null : 18 - fl(Wk() / 5);
    return { name, wert: wertB };
  }
  function besondereListe() {
    const out = [];
    const a = besondereAus(S.besondereWurf);
    if (!a) return out;
    if (a.name === "freie Wahl") {
      const frei = K.besondere.find((b) => b[1] === S.besondereFrei);
      if (frei) out.push({ name: frei[1], wert: frei[1] === "Berserkergang" ? (Wk() === null ? 0 : 18 - fl(Wk() / 5)) : frei[2] });
      const z = besondereAus(S.besondereZweit);
      if (z && z.name !== "freie Wahl") out.push(z);
    } else out.push(a);
    return out;
  }
  function stand() {
    if (S.standWurf === null || !klasse()) return null;
    const w = S.standWurf + klasse().standMod;
    return K.stand.find((s) => w <= s.bis);
  }
  function haendigkeit() {
    if (S.rasse === "Gnom") return "beidhändig";
    const w = S.haendigkeitWurf;
    return w === null ? null : w <= 15 ? "Rechtshänder" : w <= 19 ? "Linkshänder" : "Beidhänder";
  }

  // LE-Töpfe für Fertigkeiten
  function toepfe() {
    const k = klasse();
    if (!k) return [];
    const t = Object.entries(k.le).map(([g, n]) => ({ id: g, gruppe: g, le: n, titel: g === "Körper" ? "Körperbeherrschung" : g }));
    const st = stand();
    if (st) t.push({ id: "Stand", gruppe: st.gruppe, le: 2, nurLeicht: !!st.nurLeicht, titel: `Stand (${st.name}): ${st.gruppe}${st.nurLeicht ? ", nur leicht" : ""}` });
    return t;
  }
  function verbraucht(topfId) {
    return summe(S.kaeufe.filter((x) => x.topf === topfId).map((x) => x.kosten)) +
      summe(S.waffen.filter((x) => x.topf === topfId).map((x) => x.kosten));
  }
  function typischeFertigkeiten() {
    const k = klasse();
    if (!k) return [];
    return k.typisch.map((slot, i) => {
      const wahl = slot[S.typischWahl[i] || 0] || slot[0];
      return Object.assign({}, wahl, { spez: S.typischSpez[i] || wahl.spez || "" , quelle: "typisch" });
    });
  }
  function alleFertigkeiten() {
    const liste = [];
    liste.push({ name: "Muttersprache", spez: S.muttersprache || (S.rasse !== "Mensch" ? S.rasse + "isch" : ""), wert: 12, le: "In", quelle: "alle" });
    liste.push({ name: "Gemeinsprache", spez: S.gemeinsprache, wert: 12, le: "In", quelle: "alle" });
    for (const t of typischeFertigkeiten()) liste.push(t);
    for (const k of S.kaeufe) liste.push(Object.assign({ quelle: k.extra ? "Alltag (Rest-LE)" : k.topf }, k));
    return liste;
  }
  function besitzt(name, spez) {
    return alleFertigkeiten().some((f) => f.name === name && (!K.mitAngabe[name] || (f.spez || "").trim().toLowerCase() === (spez || "").trim().toLowerCase()));
  }
  function elfVerbot(name) { return S.rasse === "Elf" && K.elfenVerboten.includes(name); }

  // Lernkosten
  function epTE(lname) {
    const f = L.fertigkeiten.find((x) => x.name === lname);
    if (f) return f.kosten[S.klasse];
    if (waffenDaten(lname)) return L.waffenKosten[S.klasse];
    return null;
  }
  function gruppeVon(lname) {
    const f = L.fertigkeiten.find((x) => x.name === lname);
    if (f) return f.gruppe;
    const w = waffenDaten(lname);
    return w ? w.gruppe : null;
  }
  // TE für das Steigern auf Stufe "ziel" (null = Stufe gibt es nicht)
  function teFuer(gruppe, ziel) {
    const g = L.te[gruppe];
    const i = ziel - g.start - 1;
    return i >= 0 && i < g.stufen.length ? g.stufen[i] : null;
  }
  const elfZuschlag = () => (S.rasse === "Elf" ? 6 : 0);

  // ---------------------------------------------------------------- Schritte
  const schritte = [
    { id: "start", titel: "Rasse und Name", render: schrittStart, pruefen: () => (S.name.trim() ? [] : [hinweis("Noch kein Name eingetragen (kann auch später folgen).")]) },
    { id: "typ", titel: "Abenteurertyp", render: schrittTyp, pruefen: () => (S.klasse ? [] : [fehler("Bitte einen Abenteurertyp wählen.")]) },
    { id: "eig", titel: "Basiseigenschaften", render: schrittEigenschaften, pruefen: pruefeEigenschaften },
    { id: "abg", titel: "pA, Willenskraft, Aussehen", render: schrittAbgeleitet, pruefen: pruefeAbgeleitet },
    { id: "koerper", titel: "LP, AP, Bewegung, Gestalt", render: schrittKoerper, pruefen: pruefeKoerper },
    { id: "herkunft", titel: "Stand, Herkunft, Begabung", render: schrittHerkunft, pruefen: () => (stand() ? [] : [fehler("Stand auswürfeln oder eintragen.")]) },
    { id: "fert", titel: "Fertigkeiten", render: schrittFertigkeiten, pruefen: pruefeFertigkeiten },
    { id: "waffen", titel: "Waffenfertigkeiten", render: schrittWaffen, pruefen: pruefeWaffen },
    { id: "zauber", titel: "Zauber", render: schrittZauber, pruefen: pruefeZauber, nur: kannZaubern },
    { id: "spez", titel: "Spezialisierung, Ausrüstung", render: schrittSpezial, pruefen: pruefeSpezial },
    { id: "ende", titel: "Bogen und Lerntabelle", render: schrittEnde, pruefen: () => [] },
  ];
  const sichtbar = () => schritte.filter((s) => !s.nur || s.nur());
  const fehler = (t) => ({ art: "fehler", text: t });
  const hinweis = (t) => ({ art: "hinweis", text: t });

  // ---------------------------------------------------------------- Bausteine
  function feld(label, inhalt, hilfe) {
    return h("label", { class: "feld" }, h("span", { class: "feld-label" }, label), inhalt, hilfe ? h("small", { class: "hilfe" }, hilfe) : null);
  }
  function zahlFeld(wertAkt, setzen, opt = {}) {
    return h("input", {
      type: "number", inputmode: "numeric", class: "zahl" + (opt.breit ? " breit" : ""), value: wertAkt ?? "",
      min: opt.min, max: opt.max, placeholder: opt.platzhalter || "",
      onchange: (ev) => { setzen(zahl(ev.target.value)); spaeterZeichnen(); },
    });
  }
  function textFeld(wertAkt, setzen, platzhalter) {
    return h("input", { type: "text", value: wertAkt || "", placeholder: platzhalter || "", oninput: (ev) => { setzen(ev.target.value); speichern(); kopfzeile(); } });
  }
  function auswahl(wertAkt, optionen, setzen) {
    return h("select", { onchange: (ev) => { setzen(ev.target.value); neuZeichnen(); } },
      optionen.map(([w, t]) => h("option", { value: w, selected: w === wertAkt }, t)));
  }
  function wuerfelKnopf(text, aktion) {
    if (!S.toolWuerfel) return null;
    return h("button", { type: "button", class: "wuerfel", onclick: () => {
      wurfPuffer = [];
      try { aktion(); } finally {
        const wuerfe = wurfPuffer; wurfPuffer = null;
        if (wuerfe.length && opts.wurfMelden) {
          try { opts.wurfMelden({ aktion: text, schritt: (schritte[S.schritt] || {}).titel || "", wuerfe }); } catch (e) { console.warn("Midgard-CMT | Wurf nicht gemeldet", e); }
        }
      }
      neuZeichnen();
    } }, text);
  }
  function wurfZeile(label, formel, wertAkt, setzen, wuerfeln, ergebnis, opt = {}) {
    return h("div", { class: "wurfzeile" },
      h("div", { class: "wz-label" }, h("strong", {}, label), h("small", {}, formel)),
      h("div", { class: "wz-eingabe" }, zahlFeld(wertAkt, setzen, opt), wuerfelKnopf("Würfeln", wuerfeln)),
      h("div", { class: "wz-ergebnis" }, ergebnis ?? ""));
  }
  function info(...t) { return h("p", { class: "info" }, ...t); }
  function karte(titel, ...inhalt) { return h("section", { class: "karte" }, titel ? h("h3", {}, titel) : null, ...inhalt); }

  // ---------------------------------------------------------------- 1 Start
  function schrittStart() {
    return [
      WUERFEL_MODUS === "digital"
        ? info("Die Spielleitung hat festgelegt: Es wird digital im Bogen gewürfelt. Nutze die Würfeln-Knöpfe in den folgenden Schritten" + (opts.wurfMelden ? "; jedes Ergebnis erscheint im Chat." : "."))
        : info("Gewürfelt wird am Tisch. Trag die Würfe so ein, wie sie fallen: das Programm rechnet Formeln, Rassengrenzen und Boni aus und sagt, wann nachgewürfelt werden muss."),
      WUERFEL_MODUS === "frei" ? h("label", { class: "schalter" }, h("input", { type: "checkbox", checked: S.toolWuerfel, onchange: (ev) => { S.toolWuerfel = ev.target.checked; neuZeichnen(); } }),
        " Würfeln-Knöpfe anzeigen (falls doch einmal das Programm würfeln soll, z. B. ohne Spieler am Tisch)") : null,
      karte("Abenteurer",
        h("div", { class: "raster2" },
          feld("Name des Abenteurers", textFeld(S.name, (v) => (S.name = v))),
          feld("Spieler/in", textFeld(S.spieler, (v) => (S.spieler = v))),
          feld("Geschlecht", auswahl(S.geschlecht, [["m", "männlich"], ["w", "weiblich"]], (v) => (S.geschlecht = v)), "Wirkt sich nur auf die optionale Körpergröße aus."),
          feld("Rasse", auswahl(S.rasse, Object.keys(K.rassen).map((r) => [r, r]), (v) => { S.rasse = v; if (S.klasse && !K.klassenFuerRasse[v].includes(S.klasse)) S.klasse = null; }),
            "Muss vor dem Auswürfeln feststehen (Kodex S. 21).")),
        rassenInfo()),
    ];
  }
  function rassenInfo() {
    const r = K.rassen[S.rasse];
    if (S.rasse === "Mensch") return info("Menschen haben keine Grenzwerte und können alle 15 Abenteurertypen wählen.");
    const teile = [];
    for (const [e, v] of Object.entries(r.min)) teile.push(`${e} mindestens ${v}`);
    for (const [e, v] of Object.entries(r.max)) teile.push(`${e} höchstens ${v}`);
    return info(`${S.rasse}: ${teile.join(", ")}. Wählbare Typen: ${K.klassenFuerRasse[S.rasse].map((k) => K.klassen[k].name).join(", ")}.`);
  }

  // ---------------------------------------------------------------- 2 Eigenschaften
  // Für den Typ wichtige Eigenschaften (Kodex S. 23): "Gs, Gw/In" -> Gs wichtig, Gw oder In
  function wichtigeEig() {
    const kl = klasse();
    if (!kl) return { haupt: [], alt: [] };
    const haupt = [], alt = [];
    for (const teil of kl.wichtig.split(",").map((x) => x.trim())) {
      if (teil.includes("/")) alt.push(...teil.split("/").map((x) => x.trim())); else haupt.push(teil);
    }
    return { haupt, alt };
  }
  function wichtigArt(e) { const w = wichtigeEig(); return w.haupt.includes(e) ? "haupt" : w.alt.includes(e) ? "alt" : null; }
  function wichtigMarke(e) {
    const a = wichtigArt(e);
    return a ? h("span", { class: "marke " + a }, a === "haupt" ? `wichtig für ${klasse().name}` : `${klasse().name}: alternativ wichtig`) : null;
  }
  function wichtigZeile(e) { const a = wichtigArt(e); return a ? " wichtig-" + a : ""; }
  function wichtigInfo() {
    const kl = klasse();
    if (!kl) return info("Tipp: Wähle zuerst den Abenteurertyp, dann werden die für ihn wichtigen Eigenschaften hier markiert.");
    const w = wichtigeEig();
    const teile = [w.haupt.join(" und ")];
    if (w.alt.length) teile.push(w.alt.join(" oder "));
    const abgeleitet = [...w.haupt, ...w.alt].filter((e) => !K.eigenschaften.includes(e));
    return h("p", { class: "wichtig-info" }, h("strong", {}, `${kl.name}: `), `Hohe Werte gehören auf ${teile.filter(Boolean).join(", dazu ")} (Kodex S. 23).`,
      abgeleitet.length ? ` ${abgeleitet.join(", ")} wird im nächsten Schritt gewürfelt.` : "");
  }
  function grenzen(e) {
    const r = K.rassen[S.rasse];
    return { min: r.min[e] || 1, max: r.max[e] || 100 };
  }
  function gueltig(e, w) { const g = grenzen(e); return w !== null && w >= g.min && w <= g.max; }
  function wuerfleMethode1(e) {
    const g = grenzen(e), protokoll = [];
    const schwach = K.rassen[S.rasse].schwach === e;
    let w;
    if (schwach) {
      do { w = W(100); protokoll.push(w); } while (w > g.max);
    } else {
      const a = W(100), b = W(100);
      protokoll.push(a, b);
      w = Math.max(a, b);
      while (w < g.min) { w = W(100); protokoll.push(w); }
    }
    S.m1[e] = schwach ? { a: protokoll[0], b: null, nach: protokoll.length > 1 ? w : null }
      : { a: protokoll[0], b: protokoll[1], nach: protokoll.length > 2 ? w : null };
    m1Uebernehmen(e);
  }
  // Methode I aus den eingetragenen Würfen: der bessere von zwei Würfen, bei der
  // schwachen Eigenschaft der Nichtmenschen nur ein Wurf; reicht er nicht, zählt der Nachwurf.
  function m1Status(e) {
    const m = S.m1[e] || {}, g = grenzen(e);
    const schwach = K.rassen[S.rasse].schwach === e;
    const basis = schwach ? m.a ?? null : (m.a == null || m.b == null ? null : Math.max(m.a, m.b));
    if (basis === null) return { wert: null, nachNoetig: false };
    const ok = basis >= g.min && basis <= g.max;
    if (ok) return { wert: basis, nachNoetig: false, basis };
    return { wert: m.nach ?? null, nachNoetig: true, basis, grund: basis > g.max ? `höchstens ${g.max}` : `mindestens ${g.min}` };
  }
  function m1Uebernehmen(e) { S.eig[e] = m1Status(e).wert; }
  function m2Werte() {
    const nichtMensch = S.rasse !== "Mensch";
    const n = nichtMensch ? 8 : 9;
    const w = S.m2.wuerfe.slice(0, n);
    if (w.some((x) => x === null)) return null;
    return [...w].sort((a, b) => b - a).slice(0, nichtMensch ? 5 : 6);
  }
  function wuerfleMethode2() {
    const nm = S.rasse !== "Mensch";
    S.m2.wuerfe = Wn(nm ? 8 : 9, 100).concat(nm ? [null] : []);
    S.m2.zuordnung = {};
    if (nm) { const e = K.rassen[S.rasse].schwach; S.eig[e] = null; wuerfleSchwach(); }
    m2Uebernehmen();
  }
  function wuerfleSchwach() {
    const e = K.rassen[S.rasse].schwach, g = grenzen(e), p = [];
    let w; do { w = W(100); p.push(w); } while (w > g.max);
    S.eig[e] = w; S.wuerfe[e] = p;
  }
  function m2Uebernehmen() {
    const werte = m2Werte();
    for (const e of K.eigenschaften) {
      if (S.rasse !== "Mensch" && e === K.rassen[S.rasse].schwach) continue;
      const idx = S.m2.zuordnung[e];
      if (idx === "x") continue;
      S.eig[e] = werte && idx !== undefined && idx !== null && idx !== "" ? werte[+idx] : null;
    }
  }
  function schrittEigenschaften() {
    const teile = [wichtigInfo()];
    teile.push(karte("Methode",
      h("div", { class: "methoden" },
        h("label", {}, h("input", { type: "radio", name: "m", checked: S.methode === "I", disabled: METHODE_FEST === "II", onchange: () => { S.methode = "I"; neuZeichnen(); } }), " Methode I: je Eigenschaft 2×W%, der bessere Wert zählt (für Überraschungen)"),
        h("label", {}, h("input", { type: "radio", name: "m", checked: S.methode === "II", disabled: METHODE_FEST === "I", onchange: () => { S.methode = "II"; neuZeichnen(); } }), " Methode II: 9×W%, die 3 schlechtesten streichen, Rest frei verteilen (mehr Kontrolle)")),
      METHODE_FEST ? info(`Die Spielleitung hat Methode ${METHODE_FEST} festgelegt.`) : null,
      neuanfangZeile()));
    if (S.methode === "I") {
      teile.push(karte("Methode I",
        h("div", { class: "eig-raster" },
          K.eigenschaften.map((e) => {
            const g = grenzen(e);
            const schwach = K.rassen[S.rasse].schwach === e;
            const m = S.m1[e] || (S.m1[e] = {});
            const st = m1Status(e);
            const setze = (k) => (v) => { m[k] = v; m1Uebernehmen(e); };
            return h("div", { class: "eig-zeile m1" + wichtigZeile(e) + (S.eig[e] !== null && !gueltig(e, S.eig[e]) ? " ungueltig" : "") },
              h("div", {}, h("strong", {}, `${K.eigenschaftNamen[e]} (${e})`), h("small", {}, g.min > 1 || g.max < 100 ? ` ${g.min}–${g.max}` : ""), wichtigMarke(e)),
              h("div", { class: "inline" },
                zahlFeld(m.a, setze("a"), { min: 1, max: 100, platzhalter: schwach ? "W%" : "1. W%" }),
                schwach ? h("small", {}, "nur 1 Wurf") : zahlFeld(m.b, setze("b"), { min: 1, max: 100, platzhalter: "2. W%" }),
                wuerfelKnopf("Würfeln", () => wuerfleMethode1(e))),
              st.nachNoetig ? h("div", { class: "inline nachwurf" }, h("small", {}, `${st.basis} reicht nicht (${st.grund}): nachwürfeln, bis es passt, gültigen Wurf eintragen`),
                zahlFeld(m.nach, setze("nach"), { min: g.min, max: g.max, platzhalter: "Nachwurf" })) : h("span"),
              h("strong", { class: "m1-ergebnis" }, S.eig[e] ?? ""));
          })),
        S.toolWuerfel ? h("div", { class: "knopfreihe" }, wuerfelKnopf("Alle würfeln", () => K.eigenschaften.forEach(wuerfleMethode1))) : null,
        S.rasse !== "Mensch" ? info(`Für ${K.rassen[S.rasse].schwach} wird nur einmal gewürfelt und bei zu hohem Ergebnis wiederholt; für Mindestwerte wird so lange nachgewürfelt, bis der Wert reicht (S. 21).`) : null));
    } else {
      const nm = S.rasse !== "Mensch";
      const schwach = nm ? K.rassen[S.rasse].schwach : null;
      const n = nm ? 8 : 9;
      const werte = m2Werte();
      const vergeben = Object.values(S.m2.zuordnung).filter((x) => x !== "" && x !== null && x !== undefined && x !== "x").map(Number);
      teile.push(karte("Methode II",
        nm ? h("div", { class: "eig-zeile" },
          h("div", {}, h("strong", {}, `Zuerst ${K.eigenschaftNamen[schwach]} (${schwach})`), h("small", {}, ` 1×W%, höchstens ${grenzen(schwach).max}`)),
          zahlFeld(S.eig[schwach], (v) => { S.eig[schwach] = v; }, { min: 1, max: 100 }),
          wuerfelKnopf("Würfeln", wuerfleSchwach),
          h("small", { class: "protokoll" }, S.wuerfe[schwach] ? "Würfe: " + S.wuerfe[schwach].join(", ") : "")) : null,
        h("p", {}, `${n} W%-Würfe:`),
        h("div", { class: "wurfreihe" },
          Array.from({ length: n }, (_, i) => zahlFeld(S.m2.wuerfe[i], (v) => { S.m2.wuerfe[i] = v; S.m2.zuordnung = {}; m2Uebernehmen(); }, { min: 1, max: 100 })),
          wuerfelKnopf(`${n}× würfeln`, wuerfleMethode2)),
        werte ? h("div", {},
          h("p", {}, `Die besten ${werte.length}: `, h("strong", {}, werte.join(", ")), ". Verteile sie auf die Eigenschaften:"),
          m2Hinweis(),
          h("div", { class: "eig-raster" },
            K.eigenschaften.filter((e) => e !== schwach).map((e) => {
              const g = grenzen(e);
              const akt = S.m2.zuordnung[e];
              return h("div", { class: "eig-zeile" + wichtigZeile(e) + (S.eig[e] !== null && !gueltig(e, S.eig[e]) ? " ungueltig" : "") },
                h("div", {}, h("strong", {}, `${K.eigenschaftNamen[e]} (${e})`), h("small", {}, g.min > 1 ? ` ab ${g.min}` : g.max < 100 ? ` bis ${g.max}` : ""), wichtigMarke(e)),
                h("select", {
                  onchange: (ev) => { S.m2.zuordnung[e] = ev.target.value; if (ev.target.value === "x") { S.eig[e] = null; delete S.wuerfe[e]; } m2Uebernehmen(); neuZeichnen(); },
                }, h("option", { value: "" }, "–"),
                // nur Würfe anbieten, die die Grenzen der Rasse für diese Eigenschaft erfüllen
                werte.map((w, i) => (w < g.min || w > g.max) ? null :
                  h("option", { value: i, selected: akt !== undefined && akt !== "" && akt !== "x" && +akt === i, disabled: vergeben.includes(i) && +akt !== i }, w)),
                g.min > 1 ? h("option", { value: "x", selected: akt === "x" }, "Nachwurf") : null),
                (akt !== "x" && (gueltig(e, S.eig[e]) || S.eig[e] === null)) ? h("span") : !S.toolWuerfel ? h("div", { class: "inline nachwurf" },
                  h("small", {}, akt === "x" ? `Nachwurf: würfeln, bis mindestens ${g.min} erreicht ist` : `reicht nicht (ab ${g.min}): nachwürfeln, bis es passt, gültigen Wurf eintragen`),
                  zahlFeld(akt === "x" ? S.eig[e] : null, (v) => { S.eig[e] = v; S.m2.zuordnung[e] = "x"; }, { min: g.min, max: 100, platzhalter: "Nachwurf" })) : wuerfelKnopf("Neu würfeln bis ausreichend", () => {
                  let w, p = []; do { w = W(100); p.push(w); } while (w < g.min || w > g.max);
                  S.eig[e] = w; S.wuerfe[e] = p; S.m2.zuordnung[e] = "x";
                }),
                h("small", { class: "protokoll" }, S.m2.zuordnung[e] === "x" && S.wuerfe[e] ? "nachgewürfelt: " + S.wuerfe[e].join(", ") : ""));
            })),
          null)
          : null));
    }
    teile.push(eigenschaftsUebersicht());
    return teile;
  }
  function m2Hinweis() {
    const fehlt = m2Fehlende();
    const erledigt = K.eigenschaften.filter((e) => S.m2.zuordnung[e] === "x" && gueltig(e, S.eig[e])).length;
    if (!fehlt.length || erledigt >= fehlt.length) return null;
    const gruppen = {};
    for (const [e, m] of fehlt) (gruppen[m] = gruppen[m] || []).push(e);
    const alle = Object.entries(K.rassen[S.rasse].min);
    const teile = Object.entries(gruppen).map(([m, es]) => {
      const kandidaten = alle.filter(([, x]) => x === +m).map(([e]) => e);
      return `${es.length}× mindestens ${m} (${kandidaten.join(" oder ")})`;
    });
    return h("p", { class: "nachwurf-hinweis" },
      h("strong", {}, "Nachwürfeln nötig: "),
      `Mit diesen Würfen sind nicht alle Mindestwerte erreichbar. Es fehlt ${teile.join(", ")}. `,
      "Verteile die übrigen Werte; für die Eigenschaft, die leer ausgeht, so lange würfeln, bis der Mindestwert erreicht ist (S. 21).");
  }
  function eigSumme() {
    return K.eigenschaften.some((e) => S.eig[e] === null) ? null : summe(K.eigenschaften.map((e) => S.eig[e]));
  }
  // Werte, deren Summe geprüft wird: bei Methode II direkt nach dem Eintragen der Würfe
  // (die behaltenen Würfe, bei Nichtmenschen plus schwache Eigenschaft), bei Methode I die sechs Endwerte.
  function pruefWerte() {
    if (S.methode === "II") {
      const w = m2Werte();
      if (!w) return null;
      if (S.rasse === "Mensch") return w;
      const sw = S.eig[K.rassen[S.rasse].schwach];
      return sw === null ? null : w.concat([sw]);
    }
    return eigSumme() === null ? null : K.eigenschaften.map((e) => S.eig[e]);
  }
  function summeZuNiedrig() { const w = pruefWerte(); return MINDESTSUMME > 0 && w !== null && summe(w) < MINDESTSUMME; }
  // Methode II: Welche Mindestwerte lassen sich mit den behaltenen Würfen nicht erreichen?
  // Höchste Anforderung zuerst, jeweils mit dem höchsten noch freien Wurf.
  function m2Fehlende() {
    const werte = m2Werte();
    if (!werte) return [];
    const r = K.rassen[S.rasse];
    const mins = Object.entries(r.min).sort((a, b) => b[1] - a[1]);
    const frei = [...werte];
    const fehlt = [];
    for (const [e, m] of mins) {
      if (frei.length && frei[0] >= m) frei.shift();
      else fehlt.push([e, m]);
    }
    return fehlt;
  }
  function eigenschaftsUebersicht() {
    return [
      h("div", { class: "eig-uebersicht" }, K.eigenschaften.map((e) =>
        h("div", { class: "eig-kachel" + wichtigZeile(e) + (S.eig[e] !== null && !gueltig(e, S.eig[e]) ? " ungueltig" : "") }, h("small", {}, e), h("strong", {}, S.eig[e] ?? "–")))),
    ];
  }
  // Hausregel: Sobald alle 6 Werte stehen und ihre Summe unter MINDESTSUMME liegt, wird einmal
  // nachgefragt, ob neu gewürfelt werden soll. "Nein" merkt sich genau diese Werte.
  function summenAbfrage() {
    if (!summeZuNiedrig() || S.spiel.protokoll.length || document.querySelector(".dialog-hintergrund")) return;
    const schluessel = S.methode + ":" + pruefWerte().join(",");
    if (S.summeGefragt === schluessel) return;
    let schliessen = () => {};
    const hg = h("div", { class: "dialog-hintergrund" },
      h("div", { class: "dialog", role: "dialog", "aria-modal": "true", "aria-labelledby": "dialog-titel" },
        h("h3", { id: "dialog-titel" }, "Neu würfeln?"),
        h("p", {}, `Hey, du hast theoretisch weniger als ${MINDESTSUMME} Punkte in Summe. Möchtest du neu würfeln?`),
        h("div", { class: "knopfreihe" },
          h("button", { type: "button", class: "haupt", onclick: () => { schliessen(); S.summeGefragt = null; eigZuruecksetzen(); neuZeichnen(); } }, "Ja, neu würfeln"),
          h("button", { type: "button", onclick: () => { schliessen(); S.summeGefragt = schluessel; speichern(); } }, "Nein, weiter"))));
    schliessen = ueberlagern(hg);
    hg.querySelector("button.haupt").focus();
  }
  // Neuanfang: alle Basiseigenschaften verwerfen (Kodex S. 21: drei- bis viermal); Grenze aus den Einstellungen
  function neuanfangZeile() {
    const genutzt = S.neuanfaenge || 0;
    const rest = NEUANFAENGE === null ? null : NEUANFAENGE - genutzt;
    const gewuerfelt = K.eigenschaften.some((e) => S.eig[e] !== null) || (S.m2.wuerfe || []).some((w) => w !== null);
    return h("div", { class: "neuanfang" },
      info(NEUANFAENGE === null ? "Kodex S. 21: Bei Pech darfst du bis zu drei- oder viermal ganz von vorn anfangen."
        : `Die Spielleitung erlaubt ${NEUANFAENGE} Neuanfänge; ${rest > 0 ? `noch ${rest} übrig` : "keiner mehr übrig"}.`),
      gewuerfelt ? h("button", { type: "button", class: "neuanfang-knopf", disabled: rest !== null && rest <= 0, onclick: () => {
        frage("Ganz von vorn anfangen?", "Alle gewürfelten Basiseigenschaften werden verworfen.", "Von vorn", () => {
          S.neuanfaenge = genutzt + 1; S.summeGefragt = null; eigZuruecksetzen(); neuZeichnen();
        });
      } }, "Von vorn anfangen") : null);
  }
  function eigZuruecksetzen() {
    S.m1 = {}; S.m2 = { wuerfe: Array(9).fill(null), zuordnung: {} }; S.wuerfe = {};
    for (const e of K.eigenschaften) S.eig[e] = null;
  }
  function pruefeEigenschaften() {
    const f = [];
    for (const e of K.eigenschaften) {
      if (S.eig[e] === null) f.push(fehler(`${K.eigenschaftNamen[e]} fehlt noch.`));
      else if (!gueltig(e, S.eig[e])) { const g = grenzen(e); f.push(fehler(`${K.eigenschaftNamen[e]} ${S.eig[e]} liegt außerhalb ${g.min}–${g.max} (${S.rasse}).`)); }
    }
    return f;
  }

  // ---------------------------------------------------------------- 3 abgeleitete Eigenschaften
  function schrittAbgeleitet() {
    const e = S.eig;
    const au = K.rassen[S.rasse].au;
    return [
      info("Persönliche Ausstrahlung und Willenskraft: ein W%-Wurf, verändert durch In bzw. Ko und In (S. 22). Ergebnisse unter 1 oder über 100 werden auf 1 bzw. 100 gesetzt."),
      S.festPA !== null && S.festPA !== undefined ? h("p", { class: "warnung" }, `Seit dem ersten Gradaufstieg festgeschrieben: pA ${S.festPA}, Wk ${S.festWk}. Spätere Änderungen an In oder Ko wirken sich nicht mehr aus (Kodex S. 166); Änderungen der Würfe hier auch nicht. Rückgängig machen lässt sich das nur über das Protokoll.`) : null,
      karte(null,
        wurfZeile("Persönliche Ausstrahlung (pA)", `W% + 4×In/10 – 20 = W% ${vz(4 * fl((e.In || 0) / 10) - 20)}`, S.pAwurf, (v) => (S.pAwurf = v), () => (S.pAwurf = W(100)), pA() !== null ? h("strong", {}, "pA " + pA()) : null, { min: 1, max: 100, platzhalter: "W%" }),
        wurfZeile("Willenskraft (Wk)", `W% + 2×(Ko/10 + In/10) – 20 = W% ${vz(2 * (fl((e.Ko || 0) / 10) + fl((e.In || 0) / 10)) - 20)}`, S.Wkwurf, (v) => (S.Wkwurf = v), () => (S.Wkwurf = W(100)), Wk() !== null ? h("strong", {}, "Wk " + Wk()) : null, { min: 1, max: 100, platzhalter: "W%" }),
        wurfZeile("Aussehen (Au)", au ? `W%, ${au.min ? "mindestens " + au.min : "höchstens " + au.max} (sonst nachwürfeln)` : "W%", S.Au, (v) => (S.Au = v),
          () => { let w; do { w = W(100); } while (au && ((au.min && w < au.min) || (au.max && w > au.max))); S.Au = w; },
          S.Au !== null ? h("strong", {}, "Au " + S.Au) : null, { min: 1, max: 100, platzhalter: "W%" })),
    ];
  }
  function pruefeAbgeleitet() {
    const f = [];
    if (pA() === null) f.push(fehler("pA-Wurf fehlt."));
    if (Wk() === null) f.push(fehler("Wk-Wurf fehlt."));
    if (S.Au === null) f.push(fehler("Aussehen fehlt."));
    const au = K.rassen[S.rasse].au;
    if (au && S.Au !== null && ((au.min && S.Au < au.min) || (au.max && S.Au > au.max))) f.push(fehler(`Aussehen ${S.Au} passt nicht zu ${S.rasse}.`));
    return f;
  }

  // ---------------------------------------------------------------- 4 Typ
  function schrittTyp() {
    const erlaubt = K.klassenFuerRasse[S.rasse];
    const gruppen = [["K", "Kämpfer"], ["ZK", "Zauberkundige Kämpfer"], ["Z", "Zauberer"]];
    return [
      info(`Wählbar für ${S.rasse === "Elf" ? "Elfen" : S.rasse === "Mensch" ? "Menschen" : S.rasse + "e"}. Hinter jedem Typ stehen die Eigenschaften, die nicht zu niedrig sein sollten (S. 23); sie werden beim Würfeln markiert.`),
      gruppen.map(([art, titel]) => {
        const liste = erlaubt.filter((k) => K.klassen[k].art === art);
        if (!liste.length) return null;
        return karte(titel, h("div", { class: "typen" }, liste.map((k) => {
          const kl = K.klassen[k];
          const eigs = kl.wichtig.split(/[,/]\s*/).map((x) => x.trim());
          return h("button", { type: "button", class: "typ" + (S.klasse === k ? " gewaehlt" : ""), onclick: () => { if (S.klasse !== k) { S.klasse = k; S.typischWahl = {}; S.typischSpez = {}; S.kaeufe = []; S.waffen = []; S.zauber = []; S.typischerZauber = null; S.spezialwaffen = []; S.magierSpezial = null; } neuZeichnen(); } },
            h("strong", {}, kl.name),
            eigs.every((e) => wert(e) === null) ? h("span", { class: "typ-eig" }, kl.wichtig) : h("span", { class: "typ-eig" }, eigs.map((e) => {
              const w = wert(e);
              return h("span", { class: w === null ? "" : w >= 61 ? "gut" : w < 41 ? "schlecht" : "" }, w === null ? e : `${e} ${w}`);
            })),
            h("small", {}, `Waffen ${kl.waffenLE} LE` + (kl.zauberLE ? `, Zauber ${kl.zauberLE} LE` : "")));
        })));
      }),
    ];
  }

  // ---------------------------------------------------------------- 5 Körper
  function schrittKoerper() {
    const r = berechne(), e = S.eig, kl = klasse();
    const lpR = { Gnom: " – 3 (Gnom)", Halbling: " – 2 (Halbling)", Zwerg: " + 1 (Zwerg)" }[S.rasse] || "";
    const bf = bFormel();
    const klein = ["Gnom", "Halbling", "Zwerg"].includes(S.rasse);
    return [
      karte("Lebens- und Ausdauerpunkte, Bewegungsweite (S. 24-25)",
        wurfZeile("Lebenspunkte (LP)", `1W3 + 7 + Ko/10 (${fl((e.Ko || 0) / 10)})${lpR}`, S.lpWurf, (v) => (S.lpWurf = v), () => (S.lpWurf = W(3)), r.LP !== null ? h("strong", {}, "LP " + r.LP) : null, { min: 1, max: 3, platzhalter: "1W3" }),
        wurfZeile("Ausdauerpunkte (AP)", `1W3 + 1 + AusB (${vz(r.AusB)})${kl && kl.ap ? " + " + kl.ap + " (" + kl.name + ")" : ""}`, S.apWurf, (v) => (S.apWurf = v), () => (S.apWurf = W(3)), r.AP !== null ? h("strong", {}, "AP " + r.AP) : null, { min: 1, max: 3, platzhalter: "1W3" }),
        wurfZeile("Bewegungsweite (B)", `${bf.n}W3 + ${bf.plus}: hier die Summe der ${bf.n} W3 eintragen`, S.bWurf, (v) => (S.bWurf = v), () => (S.bWurf = summe(Wn(bf.n, 3))), r.B !== null ? h("strong", {}, "B " + r.B) : null, { min: bf.n, max: bf.n * 3, platzhalter: bf.n + "W3" })),
      karte("Gestalt und Händigkeit (S. 28, 33)",
        h("div", { class: "raster2" },
          feld("Größe", klein ? h("strong", {}, "klein (Rasse)") : auswahl(S.gestaltGroesse, [["klein", "klein"], ["mittelgroß", "mittelgroß"], ["groß", "groß"]], (v) => (S.gestaltGroesse = v))),
          feld("Statur", auswahl(S.gestaltFigur, [["schlank", "schlank"], ["normal", "normal"], ["breit", "breit"]], (v) => (S.gestaltFigur = v))),
          S.rasse === "Gnom" ? feld("Händigkeit", h("strong", {}, "beidhändig (Gnom)")) :
            feld("Händigkeit (1W20)", h("div", { class: "inline" }, zahlFeld(S.haendigkeitWurf, (v) => (S.haendigkeitWurf = v), { min: 1, max: 20, platzhalter: "W20" }), wuerfelKnopf("Würfeln", () => (S.haendigkeitWurf = W(20))), h("strong", {}, haendigkeit() || "")),
              "1-15 Rechtshänder, 16-19 Linkshänder, 20 Beidhänder"),
          feld("Alter", h("div", { class: "inline" }, textFeld(S.alter, (v) => (S.alter = v), "frei oder 1W6+17"), wuerfelKnopf("1W6+17", () => (S.alter = String(W(6) + 17)))))),
        h("details", { open: !!S.koerperOffen || S.groesseWurf !== null, ontoggle: (ev) => { S.koerperOffen = ev.target.open; speichern(); } },
          h("summary", {}, "Optional: Körpergröße und Gewicht auswürfeln (Zusatzregel S. 33)"),
          h("div", { class: "raster2" },
            feld(`Körpergröße: Summe der ${formelText("groesse")}`, h("div", { class: "inline" }, zahlFeld(S.groesseWurf, (v) => { S.groesseWurf = v; rechneKoerper(); }), wuerfelKnopf("Würfeln", wuerfleGroesse), h("strong", {}, S.groesse !== null ? S.groesse + " cm" : "")),
              `+ St/10 ${koerperPlus("groesse")}`),
            feld(`Gewicht: Summe der ${formelText("gewicht")}`, h("div", { class: "inline" }, zahlFeld(S.gewichtWurf, (v) => { S.gewichtWurf = v; rechneKoerper(); }), wuerfelKnopf("Würfeln", wuerfleGewicht), h("strong", {}, S.gewicht !== null ? S.gewicht + " kg" : "")),
              `${koerperPlus("gewichtMod")} + St/10 + Körpergröße ${koerperPlus("gewicht")}`)),
          gestaltVorschlag())),
    ];
  }
  function formelTeil(tab) { const t = K[tab][S.rasse]; return t.a || (S.geschlecht === "w" ? t.w : t.m); }
  function formelText(tab) { const f = formelTeil(tab); return tab === "groesse" ? `${f[0]}W${f[1]}` : `${f[0]}W6`; }
  function koerperPlus(art) {
    const z = art === "groesse" ? formelTeil("groesse")[2] : art === "gewichtMod" ? formelTeil("gewicht")[1] : formelTeil("gewicht")[2];
    return art === "gewichtMod" && z === 0 ? "" : (z >= 0 ? "+ " : "– ") + Math.abs(z) + (art === "gewichtMod" ? "" : art === "groesse" ? " cm" : " kg");
  }
  function rechneKoerper() {
    const st = S.eig.St === null ? null : fl(S.eig.St / 10);
    S.groesse = S.groesseWurf === null || st === null ? null : S.groesseWurf + st + formelTeil("groesse")[2];
    const [, mod, minus] = formelTeil("gewicht");
    S.gewicht = S.gewichtWurf === null || S.groesse === null ? null : S.gewichtWurf + mod + st + S.groesse + minus;
  }
  function wuerfleGroesse() { const [n, s] = formelTeil("groesse"); S.groesseWurf = summe(Wn(n, s)); rechneKoerper(); }
  function wuerfleGewicht() { if (S.groesseWurf === null) wuerfleGroesse(); S.gewichtWurf = summe(Wn(formelTeil("gewicht")[0], 6)); rechneKoerper(); }
  function gestaltVorschlag() {
    if (S.groesse === null || S.gewicht === null) return null;
    const mensch = ["Mensch", "Elf"].includes(S.rasse);
    const groesse = !mensch ? "klein" : S.groesse < 166 ? "klein" : S.groesse > 180 ? "groß" : "mittelgroß";
    const normal = S.groesse - (mensch ? 100 : 70);
    const figur = S.gewicht < normal * 0.9 ? "schlank" : S.gewicht > normal * 1.1 ? "breit" : "normal";
    return h("p", { class: "info" }, `Nach Größe und Gewicht: ${groesse}, ${figur} (Normalgewicht ${normal} kg). `,
      h("button", { type: "button", onclick: () => { if (mensch) S.gestaltGroesse = groesse; S.gestaltFigur = figur; neuZeichnen(); } }, "Übernehmen"));
  }
  function pruefeKoerper() {
    const f = [], r = berechne();
    if (r.LP === null) f.push(fehler("LP-Wurf fehlt."));
    if (r.AP === null) f.push(fehler("AP-Wurf fehlt."));
    if (r.B === null) f.push(fehler("Wurf für die Bewegungsweite fehlt."));
    if (S.rasse !== "Gnom" && S.haendigkeitWurf === null) f.push(hinweis("Händigkeit ist noch offen."));
    return f;
  }

  // ---------------------------------------------------------------- 6 Herkunft
  function schrittHerkunft() {
    const kl = klasse(), st = stand();
    const b = besondereAus(S.besondereWurf);
    return [
      karte("Stand (S. 31)",
        wurfZeile("Stand", `W%${kl && kl.standMod ? " " + vz(kl.standMod) + " (" + kl.name + ")" : ""}: bis 10 unfrei, 11-50 Volk, 51-90 Mittelschicht, über 90 Adel`,
          S.standWurf, (v) => (S.standWurf = v), () => (S.standWurf = W(100)), st ? h("strong", {}, st.name) : null, { min: 1, max: 100, platzhalter: "W%" }),
        st ? info(`Der Stand bringt 2 zusätzliche LE für ${st.gruppe}${st.nurLeicht ? " (nur leichte soziale Fertigkeiten)" : ""}.`) : null),
      karte("Herkunft (S. 28-35)",
        info("Heimat, Muttersprache und Glaube können Einsteiger auch erst nach ein, zwei Spielsitzungen festlegen (S. 28)."),
        h("div", { class: "raster2" },
          feld("Heimat", textFeld(S.heimat, (v) => (S.heimat = v), "z. B. Alba")),
          feld("Muttersprache", textFeld(S.muttersprache, (v) => (S.muttersprache = v), S.rasse === "Mensch" ? "z. B. Albisch" : "Sprache der Rasse"), "Nichtmenschen sprechen die Sprache ihrer Rasse (S. 36)."),
          feld("Gemeinsprache", textFeld(S.gemeinsprache, (v) => (S.gemeinsprache = v)), "Standard ist Comentang (S. 36)."),
          feld("Glaube", textFeld(S.glaube, (v) => (S.glaube = v))))),
      karte("Besondere Fähigkeit (S. 26-27)",
        info("Freiwillig: ein W%-Wurf. Wer darauf verzichtet, lässt das Feld leer."),
        wurfZeile("Wurf", "W%, 100 = freie Wahl und zweiter Wurf", S.besondereWurf, (v) => (S.besondereWurf = v), () => (S.besondereWurf = W(100)),
          b ? h("strong", {}, b.name === "freie Wahl" ? "freie Wahl" : `${b.name}${b.wert !== null ? vz(b.wert) : ""}`) : null, { min: 1, max: 100, platzhalter: "W%" }),
        b && b.name === "freie Wahl" ? h("div", { class: "raster2" },
          feld("Frei gewählte Fähigkeit", auswahl(S.besondereFrei, [["", "–"]].concat(K.besondere.filter((x) => x[1] !== "freie Wahl").map((x) => [x[1], x[1] + (x[2] !== null ? vz(x[2]) : "")]))
            .filter((v, i, a) => a.findIndex((y) => y[0] === v[0]) === i), (v) => (S.besondereFrei = v))),
          feld("Zweiter Wurf", h("div", { class: "inline" }, zahlFeld(S.besondereZweit, (v) => (S.besondereZweit = v), { min: 1, max: 99 }), wuerfelKnopf("Würfeln", () => { let w; do { w = W(100); } while (w === 100); S.besondereZweit = w; }),
            h("strong", {}, besondereAus(S.besondereZweit) ? besondereAus(S.besondereZweit).name + (besondereAus(S.besondereZweit).wert !== null ? vz(besondereAus(S.besondereZweit).wert) : "") : "")))) : null,
        S.rasse !== "Mensch" ? info(`${S.rasse} hat von Natur aus: ${K.rassenFaehigkeiten[S.rasse].map(([n, w]) => n + vz(w)).join(", ")}. Gleiche Sinne werden verrechnet (z. B. Halbling mit Riechen–2 riecht nur normal), eine schon vorhandene Fähigkeit bringt keinen neuen Wurf.`) : null),
    ];
  }

  // ---------------------------------------------------------------- 7 Fertigkeiten
  function optionenFuer(gruppe, nurLeicht) {
    const out = [];
    for (const [stufe, le, ...liste] of K.startFertigkeiten[gruppe] || []) {
      if (nurLeicht && stufe !== "leicht") continue;
      for (const [name, w, attr] of liste) out.push({ name, wert: w, le: attr, kosten: le, stufe });
    }
    return out;
  }
  function alltagExtraOptionen() {
    return optionenFuer("Alltag").filter((o) => o.stufe !== "schwer");
  }
  function ueberlebenFest() {
    return { Elf: "Wald", Zwerg: "Gebirge", Halbling: "Gebirge" }[S.rasse] || null;
  }
  function kaufen(opt, topf, extra) {
    if (K.mitAngabe[opt.name] && !(opt.name === "Überleben" && ueberlebenFest())) {
      eingabe(opt.name, `${K.mitAngabe[opt.name]} angeben:`, "", (spez) => { if (spez) { kaufAbschliessen(opt, topf, extra, spez); neuZeichnen(); } });
      return;
    }
    kaufAbschliessen(opt, topf, extra, opt.name === "Überleben" ? ueberlebenFest() || "" : "");
  }
  function kaufAbschliessen(opt, topf, extra, spez) {
    if (besitzt(opt.name, spez)) { meldung("Schon vorhanden", `${opt.name}${spez ? " (" + spez + ")" : ""} ist schon vorhanden.`); return; }
    let w = opt.wert;
    if (opt.name === "Schreiben" && S.muttersprache && spez.toLowerCase() === S.muttersprache.trim().toLowerCase()) w = 12;
    S.kaeufe.push({ name: opt.name, spez, wert: w, le: opt.le, topf, kosten: extra ? 1 : opt.kosten, extra: !!extra });
  }
  function schrittFertigkeiten() {
    const kl = klasse();
    if (!kl) return [info("Zuerst einen Abenteurertyp wählen.")];
    const teile = [];
    // typische Fertigkeiten
    teile.push(karte("Typische Fertigkeiten (S. 38-39)",
      kl.typisch.map((slot, i) => {
        const gewaehlt = S.typischWahl[i] || 0;
        const t = slot[gewaehlt];
        return h("div", { class: "typisch" },
          slot.length > 1 ? h("div", { class: "wahl" }, slot.map((o, j) => {
            const verboten = elfVerbot(o.name);
            return h("label", {}, h("input", { type: "radio", name: "typ" + i, checked: gewaehlt === j, disabled: verboten, onchange: () => { S.typischWahl[i] = j; neuZeichnen(); } }), ` ${o.name}+${o.wert} (${o.le})${verboten ? " (für Elfen verboten)" : ""}`);
          })) : h("strong", {}, `${t.name}+${t.wert} (${t.le})`),
          t.spez ? h("div", { class: "inline" }, h("span", {}, "für: "), textFeld(S.typischSpez[i] ?? (t.spez === "Muttersprache" ? S.muttersprache : ""), (v) => (S.typischSpez[i] = v), t.spez)) : null);
      })));
    // Töpfe
    for (const t of toepfe()) {
      const rest = t.le - verbraucht(t.id);
      const opts = optionenFuer(t.gruppe, t.nurLeicht);
      const extraGekauft = S.kaeufe.some((k) => k.topf === t.id && k.extra);
      teile.push(karte(null,
        h("div", { class: "topf-kopf" }, h("h3", {}, t.titel), h("span", { class: "topf-rest" + (rest < 0 ? " ueber" : rest === 0 ? " leer" : "") }, `${rest} von ${t.le} LE frei`)),
        (() => {
          // nur, was jetzt mit den freien LE gelernt werden kann
          const waehlbar = opts.filter((o) => !(!K.mitAngabe[o.name] && besitzt(o.name)) && !elfVerbot(o.name) && o.kosten <= rest);
          return [
            waehlbar.length ? h("div", { class: "optionen" }, waehlbar.map((o) => h("button", {
              type: "button", class: "option",
              onclick: () => lernenBestaetigen(o.name, `+${o.wert}`, `${o.kosten} LE`, () => { kaufen(o, t.id, false); neuZeichnen(); }),
            }, h("span", {}, `${o.name}+${o.wert}`), h("small", {}, `${o.le} · ${o.stufe} · ${o.kosten} LE`))))
              : info(rest > 0 ? "Mit den freien LE ist hier nichts mehr lernbar." : "Alle LE dieser Gruppe sind verteilt."),
            ausgeblendet(opts.length - waehlbar.length, "zu teuer, schon vorhanden oder nicht erlaubt"),
          ];
        })(),
        t.gruppe !== "Alltag" ? h("div", { class: "extra" },
          h("small", {}, "1 LE dieser Gruppe darf für eine leichte oder normale Alltagsfertigkeit verwendet werden (S. 37): "),
          extraGekauft ? h("small", {}, "bereits genutzt.") :
            alltagAuswahl(t.id, rest)) : null,
        gekaufteListe(t.id)));
    }
    return teile;
  }
  function alltagAuswahl(topf, rest) {
    if (rest < 1) return h("small", {}, "kein LE frei.");
    const waehlbar = alltagExtraOptionen().filter((o) => !(!K.mitAngabe[o.name] && besitzt(o.name)) && !elfVerbot(o.name));
    return h("select", { onchange: (ev) => {
      const o = waehlbar.find((x) => x.name === ev.target.value);
      ev.target.value = "";
      if (o) lernenBestaetigen(o.name, `+${o.wert}`, "1 LE", () => { kaufen(o, topf, true); neuZeichnen(); });
    } }, h("option", { value: "" }, "Alltagsfertigkeit wählen …"), waehlbar.map((o) => h("option", { value: o.name }, `${o.name}+${o.wert} (${o.le})`)));
  }
  function gekaufteListe(topf) {
    const liste = S.kaeufe.map((k, i) => [k, i]).filter(([k]) => k.topf === topf);
    if (!liste.length) return null;
    return h("ul", { class: "gekauft" }, liste.map(([k, i]) => h("li", {},
      h("span", {}, `${k.name}${k.spez ? " (" + k.spez + ")" : ""}+${k.wert} (${k.le})`, k.extra ? h("small", {}, " Alltag mit Rest-LE") : null),
      h("small", {}, `${k.kosten} LE`),
      h("button", { type: "button", class: "entfernen", onclick: () => { S.kaeufe.splice(i, 1); neuZeichnen(); } }, "entfernen"))));
  }
  function pruefeFertigkeiten() {
    const f = [];
    for (const t of toepfe()) {
      const rest = t.le - verbraucht(t.id);
      if (rest < 0) f.push(fehler(`${t.titel}: ${-rest} LE zu viel ausgegeben.`));
      else if (rest > 0) f.push(hinweis(`${t.titel}: ${rest} LE noch nicht verwendet.`));
    }
    typischeFertigkeiten().forEach((t) => { if (elfVerbot(t.name)) f.push(fehler(`${t.name} dürfen Elfen nicht wählen.`)); });
    return f;
  }

  // ---------------------------------------------------------------- 8 Waffen
  function waffenErlaubt(name) {
    if (K.nurZauberer.includes(name) && !istZauberer()) return "nur für Zauberer";
    if (istKlein() && K.kleineVerboten.fertigkeiten.includes(name)) return `für ${S.rasse === "Gnom" ? "Gnome" : "Halblinge"} nicht nutzbar`;
    return null;
  }
  function schrittWaffen() {
    const kl = klasse();
    if (!kl) return [info("Zuerst einen Abenteurertyp wählen.")];
    const rest = kl.waffenLE - verbraucht("Waffen");
    const extraGekauft = S.kaeufe.some((k) => k.topf === "Waffen" && k.extra);
    return [
      info("Waffenfertigkeiten beginnen mit +5, Schilde und Parierwaffen mit +1 (S. 40-41). Die Liste der Waffen mit Mindestwerten für St und Gs steht im nächsten Schritt bei der Spezialisierung."),
      karte(null,
        h("div", { class: "topf-kopf" }, h("h3", {}, "Waffen"), h("span", { class: "topf-rest" + (rest < 0 ? " ueber" : rest === 0 ? " leer" : "") }, `${rest} von ${kl.waffenLE} LE frei`)),
        (() => {
          let versteckt = 0;
          const stufen = K.startWaffen.map(([stufe, le, ...namen]) => {
            const waehlbar = namen.filter((n) => { const ok = !waffenErlaubt(n) && !S.waffen.some((w) => w.name === n) && le <= rest; if (!ok) versteckt++; return ok; });
            return waehlbar.length ? h("div", { class: "waffenstufe" }, h("h4", {}, `${stufe}: ${le} LE`),
              h("div", { class: "optionen" }, waehlbar.map((n) => {
                const start = K.verteidigungsWaffen.includes(n) ? 1 : 5;
                return h("button", { type: "button", class: "option",
                  onclick: () => lernenBestaetigen(n, `+${start}`, `${le} LE`, () => { S.waffen.push({ name: n, wert: start, kosten: le, topf: "Waffen" }); neuZeichnen(); }),
                }, h("span", {}, `${n}+${start}`), h("small", {}, `${le} LE`));
              }))) : null;
          });
          return [stufen.some(Boolean) ? stufen : info(rest > 0 ? "Mit den freien LE ist keine weitere Waffenfertigkeit lernbar." : "Alle Waffen-LE sind verteilt."),
            ausgeblendet(versteckt, "zu teuer, schon gewählt oder nicht nutzbar")];
        })(),
        h("div", { class: "extra" },
          h("small", {}, "Übrige LE: 1 LE darf für eine leichte oder normale Alltagsfertigkeit verwendet werden (S. 37): "),
          extraGekauft ? h("small", {}, "bereits genutzt.") :
            alltagAuswahl("Waffen", rest)),
        S.waffen.length ? h("ul", { class: "gekauft" }, S.waffen.map((w, i) => h("li", {},
          h("span", {}, `${w.name}+${w.wert}`), h("small", {}, `${w.kosten} LE`),
          h("button", { type: "button", class: "entfernen", onclick: () => { S.waffen.splice(i, 1); S.spezialwaffen = S.spezialwaffen.filter((s) => waffenZuSpez(s) !== w.name); neuZeichnen(); } }, "entfernen")))) : null,
        gekaufteListe("Waffen") ),
    ];
  }
  function pruefeWaffen() {
    const kl = klasse(); if (!kl) return [];
    const rest = kl.waffenLE - verbraucht("Waffen");
    if (rest < 0) return [fehler(`${-rest} LE zu viel für Waffen ausgegeben.`)];
    if (rest > 0) return [hinweis(`${rest} Waffen-LE noch nicht verwendet.`)];
    return [];
  }

  // ---------------------------------------------------------------- 9 Zauber
  function zauberTopf() { const kl = klasse(); return kl && kl.zauberLE ? kl.zauberLE : 0; }
  function zauberVerbraucht() { return summe(S.zauber.map((z) => z.le)); }
  function schrittZauber() {
    const kl = klasse();
    const rest = zauberTopf() - zauberVerbraucht();
    return [
      kl.typischerZauber ? karte("Typischer Zauber (kostenlos)",
        kl.typischerZauber.length > 1 ? h("div", { class: "wahl" }, kl.typischerZauber.map((z) => h("label", {}, h("input", { type: "radio", name: "tz", checked: (S.typischerZauber || kl.typischerZauber[0]) === z, onchange: () => { S.typischerZauber = z; neuZeichnen(); } }), " " + z)))
          : h("strong", {}, kl.typischerZauber[0])) : null,
      S.klasse === "Ma" ? karte("Spezialgebiet des Magiers (S. 37)",
        info("+2 auf EW:Zaubern für Sprüche dieser Gruppe. Später kostet das Lernen dort nur 30 EP je LE (S. 154)."),
        auswahl(S.magierSpezial || "", [["", "– wählen –"]].concat(K.magierSpezialgebiete.map((g) => [g, g])), (v) => (S.magierSpezial = v || null))) : null,
      karte(null,
        h("div", { class: "topf-kopf" }, h("h3", {}, `Zauber: ${kl.zauberGruppen.join(", ")}`), h("span", { class: "topf-rest" + (rest < 0 ? " ueber" : rest === 0 ? " leer" : "") }, `${rest} von ${zauberTopf()} LE frei`)),
        S.rasse === "Elf" ? info("Mit * markierte Zauber gehören zur Schwarzen Magie; Elfen dürfen sie nicht lernen.") : null,
        (() => {
          let versteckt = 0;
          const gruppen = kl.zauberGruppen.map((g) => {
            const daten = K.startZauber[g];
            const reihen = [1, 2].map((le) => (daten[le] || []).filter((z) => {
              const name = z.replace("*", "");
              const ok = !S.zauber.some((x) => x.name === name) && !(z.endsWith("*") && S.rasse === "Elf") && le <= rest;
              if (!ok) versteckt++;
              return ok;
            }).map((z) => [z, le])).filter((r) => r.length);
            return reihen.length ? h("div", { class: "waffenstufe" }, h("h4", {}, g), reihen.map((r) => h("div", { class: "optionen" }, r.map(([z, le]) => {
              const name = z.replace("*", ""), zi = zauberInfo(name, g);
              return h("button", { type: "button", class: "option",
                onclick: () => lernenBestaetigen(`den Zauber ${name}`, zi ? String(zi.stufe) : "", `${le} LE`, () => { S.zauber.push({ name, gruppe: g, le }); neuZeichnen(); }) },
                h("span", {}, z), h("small", {}, `${le} LE` + (zi ? ` · Stufe ${zi.stufe}` : "")));
            })))) : null;
          });
          return [gruppen.some(Boolean) ? gruppen : info(rest > 0 ? "Mit den freien LE ist kein weiterer Zauber lernbar." : "Alle Zauber-LE sind verteilt."),
            ausgeblendet(versteckt, "zu teuer, schon gewählt oder Schwarze Magie")];
        })(),
        S.zauber.length ? h("ul", { class: "gekauft" }, S.zauber.map((z, i) => h("li", {},
          h("span", {}, z.name), h("small", {}, `${z.gruppe} · ${z.le} LE`),
          h("button", { type: "button", class: "entfernen", onclick: () => { S.zauber.splice(i, 1); neuZeichnen(); } }, "entfernen")))) : null),
    ];
  }
  function pruefeZauber() {
    const f = [], rest = zauberTopf() - zauberVerbraucht();
    if (rest < 0) f.push(fehler(`${-rest} Zauber-LE zu viel ausgegeben.`));
    else if (rest > 0) f.push(hinweis(`${rest} Zauber-LE noch nicht verwendet.`));
    if (S.klasse === "Ma" && !S.magierSpezial) f.push(hinweis("Magier: Spezialgebiet noch nicht gewählt."));
    return f;
  }

  // ---------------------------------------------------------------- 10 Spezialisierung, Ausrüstung
  function waffenZuSpez(s) { return s.split("|")[0]; }
  function anforderungErfuellt(anf) {
    if (!anf) return true;
    return anf.split(",").every((t) => {
      const m = t.trim().match(/^(St|Gs|Gw)(\d+)$/);
      return !m || (S.eig[m[1]] || 0) >= +m[2];
    });
  }
  function schrittSpezial() {
    const kl = klasse();
    const teile = [];
    if (istKaempfer()) {
      const anzahl = S.klasse === "Kr" ? 3 : 1;
      const kandidaten = [];
      for (const w of S.waffen) {
        if (K.keineSpezialwaffe.includes(w.name)) continue;
        for (const [name, anf, schaden] of K.waffenListe[w.name] || []) {
          let grund = null;
          if (!anforderungErfuellt(anf)) grund = `${anf} nicht erreicht`;
          if (istKlein() && K.kleineVerboten.waffen.includes(name)) grund = "zu groß";
          kandidaten.push({ id: w.name + "|" + name, name, fert: w.name, anf, schaden, grund });
        }
      }
      teile.push(karte(`Spezialwaffe${anzahl > 1 ? "n (Krieger: 3)" : ""} (S. 37 mit Errata)`,
        info("+2 auf EW:Angriff mit dieser Waffe. Erlaubt sind Angriffswaffen aus gelernten Waffenfertigkeiten außer Ketten-, Stockwaffen, waffenlosem Kampf und Zauberstäben; St und Gs müssen reichen."),
        kandidaten.length ? h("div", { class: "optionen" }, kandidaten.map((k) => {
          const an = S.spezialwaffen.includes(k.id);
          return h("button", { type: "button", class: "option" + (an ? " gewaehlt" : ""), disabled: !an && (!!k.grund || S.spezialwaffen.length >= anzahl),
            onclick: () => { if (an) S.spezialwaffen = S.spezialwaffen.filter((x) => x !== k.id); else S.spezialwaffen.push(k.id); neuZeichnen(); } },
            h("span", {}, k.name), h("small", {}, `${k.fert} · ${k.anf || "keine Mindestwerte"} · ${k.schaden}${k.grund ? " · " + k.grund : ""}`));
        })) : info("Noch keine passende Waffenfertigkeit gelernt."),
        istKlein() ? info(`${S.rasse === "Gnom" ? "Gnome" : "Halblinge"} müssen ${K.kleineVerboten.zweihaendig.join(", ")} zweihändig führen (S. 37/44).`) : null));
    }
    const frei = [];
    frei.push("Kleidung, Rucksack, Decke, Lederbeutel");
    frei.push(`${kl.freiWaffen} Waffe${kl.freiWaffen > 1 ? "n" : ""} nach Wahl (aus gelernten Waffenfertigkeiten, S. 42f), mit Behältnissen; bei Schusswaffen 30 Geschosse und Munitionsbehälter`);
    if (S.klasse === "Kr" || S.klasse === "Or") frei.push("Kettenrüstung");
    if (istZauberer()) frei.push("Zaubermaterial: für jeden gelernten Spruch 1×");
    if (S.klasse === "Ba") frei.push("magisches Instrument");
    const werkzeug = { "Erste Hilfe": "Salben, Heilkräuter, Verbände", "Fälschen": "Hilfsmittel und Werkzeuge zum Fälschen", Gaukeln: "Bälle, Reifen und Keulen zum Jonglieren",
      "Glücksspiel": "geladene Würfel oder gezinkte Karten", Musizieren: "ein Instrument nach Wahl", "Schlösser öffnen": "ein Satz Dietriche und Nachschlüssel" };
    for (const f of alleFertigkeiten()) if (werkzeug[f.name]) frei.push(`${f.name}: ${werkzeug[f.name]}`);
    // In Foundry: Ausrüstungskompendium öffnen; die Karte nimmt Gegenstände, Waffen und Rüstungen per Ziehen an
    const kompendium = typeof opts.kompendium === "function";
    const vorhanden = typeof opts.gegenstaende === "function" ? opts.gegenstaende() : [];
    const ausruestungKarte = karte("Ausrüstung (S. 46)",
      h("ul", {}, [...new Set(frei)].map((x) => h("li", {}, x))),
      info("Dazu 80 GS Startgeld für weitere Einkäufe (Preislisten S. 197ff)."),
      kompendium ? h("div", { class: "knopfreihe" },
        h("button", { type: "button", class: "kompendium-knopf", onclick: () => opts.kompendium("gegenstaende") }, "Kompendium: Ausrüstung"),
        h("button", { type: "button", onclick: () => opts.kompendium("waffen") }, "Kompendium: Waffen"),
        h("button", { type: "button", onclick: () => opts.kompendium("ruestungen") }, "Kompendium: Rüstungen")) : null,
      kompendium ? info("Einträge aus dem Kompendium auf diesen Kasten ziehen; sie kommen direkt auf den Bogen. Gegenstände, die schon da sind, erhöhen die Anzahl.") : null,
      vorhanden.length ? h("div", { class: "auf-dem-bogen" }, h("strong", {}, "Schon auf dem Bogen: "), vorhanden.join(", ")) : null,
      feld("Gewählte Waffen und weitere Einkäufe (für den Bogen)", h("textarea", { rows: 5, oninput: (ev) => { S.ausruestung = ev.target.value; speichern(); } }, S.ausruestung)));
    if (kompendium) {
      ausruestungKarte.classList.add("cmt-ablage");
      ausruestungKarte.addEventListener("dragover", (ev) => { ev.preventDefault(); ausruestungKarte.classList.add("cmt-ablage-aktiv"); });
      ausruestungKarte.addEventListener("dragleave", (ev) => { if (!ausruestungKarte.contains(ev.relatedTarget)) ausruestungKarte.classList.remove("cmt-ablage-aktiv"); });
      ausruestungKarte.addEventListener("drop", () => ausruestungKarte.classList.remove("cmt-ablage-aktiv"));
    }
    teile.push(ausruestungKarte);
    return teile;
  }
  function pruefeSpezial() {
    if (!istKaempfer()) return [];
    const n = S.klasse === "Kr" ? 3 : 1;
    return S.spezialwaffen.length < n ? [hinweis(`Noch ${n - S.spezialwaffen.length} Spezialwaffe(n) offen.`)] : [];
  }

  // ---------------------------------------------------------------- 11 Ende: Bogen + Lerntabelle
  function aktuellerWert(schluessel, start) {
    const v = S.spiel.werte[schluessel];
    return v === undefined || v === null ? start : v;
  }
  function schrittEnde() {
    const r = berechne(), kl = klasse();
    if (!kl) return [info("Zuerst einen Abenteurertyp wählen.")];
    const offene = sichtbar().slice(0, -1).flatMap((s) => s.pruefen().filter((x) => x.art === "fehler").map((x) => `${s.titel}: ${x.text}`));
    return [
      h("div", { class: "knopfreihe nicht-drucken" },
        h("button", { type: "button", class: "haupt", onclick: drucken }, "Drucken / als PDF speichern"),
        FOUNDRY ? null : h("button", { type: "button", onclick: () => exportieren(false) }, "Charakter exportieren"),
        h("button", { type: "button", onclick: () => { S.ansicht = "konto"; neuZeichnen(); nachOben(); } }, "Zum Lernen und Steigern")),
      offene.length ? h("div", { class: "warnung nicht-drucken" }, h("strong", {}, "Noch offen:"), h("ul", {}, offene.map((t) => h("li", {}, t)))) : null,
      bogen(r, kl),
      lerntabelle(kl),
    ];
  }

  function bogen(r, kl) {
    const st = stand();
    const zeile = (a, b) => h("tr", {}, h("th", {}, a), h("td", {}, b ?? "–"));
    const eigTab = h("table", { class: "werte" },
      h("thead", {}, h("tr", {}, h("th", {}, "Eigenschaft"), h("th", {}, "Wert"), h("th", {}, "Bonus"))),
      h("tbody", {}, ["St", "Gs", "Gw", "Ko", "In", "Zt", "pA", "Wk", "Au"].map((e) =>
        h("tr", {}, h("th", {}, `${K.eigenschaftNamen[e]} (${e})`), h("td", {}, wert(e) ?? "–"), h("td", {}, e === "Au" ? "" : vz(bonus(wert(e))))))));
    const grad = aktGrad();
    const abw = abTabelle(K.abwehrResistenz, grad), zau = abTabelle(K.zaubernGrad, grad);
    const zaubernWert = kannZaubern() ? `+${zau}` : "+(3) ungelernt";
    const ap = r.AP === null ? null : r.AP + S.spiel.apPlus;
    const sg = r.SG + fl(grad / 2);
    const kampf = h("table", { class: "werte" }, h("tbody", {},
      zeile("Lebenspunkte (LP)", r.LP), zeile("Ausdauerpunkte (AP)", ap), zeile("Bewegungsweite (B)", r.B),
      zeile("Grad / Erfahrungsschatz", `${grad} / ${fmt(S.spiel.es)} ES`), zeile("Schicksalsgunst (SG)", sg + (S.rasse === "Gnom" ? " (Gnome: +1 GP je Sitzung)" : "")),
      zeile("Ausdauerbonus (AusB)", vz(r.AusB)), zeile("Schadensbonus (SchB)", vz(r.SchB)),
      zeile("Angriffsbonus (AnB)", vz(r.AnB)), zeile("Abwehrbonus (AbB)", vz(r.AbB)), zeile("Zauberbonus (ZauB)", vz(r.ZauB)),
      zeile("Resistenzbonus Geist / Körper", `${vz(r.ResG)} / ${vz(r.ResK)}`),
      zeile("Abwehr", `+${abw} (mit AbB: ${vz(abw + (r.AbB || 0))})`),
      zeile("Resistenz Geist / Körper", `+${abw} / +${abw} (mit ResB: ${vz(abw + (r.ResG || 0))} / ${vz(abw + (r.ResK || 0))})`),
      zeile("Zaubern", kannZaubern() ? `+${zau} (mit ZauB: ${vz(zau + (r.ZauB || 0))})` : zaubernWert),
      zeile("Raufen", vz(r.Raufen)), zeile("Trinken", vz(r.Trinken)), zeile("Wahrnehmung", vz(r.Wahrnehmung)),
      r.faehigkeiten.length ? zeile("Besondere Fähigkeiten", r.faehigkeiten.map((f) => f.name + vz(f.wert)).join(", ")) : null));
    const fert = alleFertigkeiten().map((f) => ({ ...f, schluessel: "F:" + f.name + "|" + (f.spez || "") }))
      .concat(S.spiel.neu.filter((n) => !n.waffe && !n.zauber).map((n) => ({ ...n, schluessel: "F:" + n.name + "|" + (n.spez || ""), quelle: "später gelernt" })));
    const fertTab = h("table", { class: "werte" },
      h("thead", {}, h("tr", {}, h("th", {}, "Fertigkeit"), h("th", {}, "Wert"), h("th", {}, "Bonus (Leiteig.)"), h("th", { class: "nicht-drucken" }, "Herkunft"))),
      h("tbody", {}, fert.map((f) => {
        const b = bonus(wert(f.le));
        return h("tr", {},
          h("th", {}, f.name + (f.spez ? ` (${f.spez})` : "")),
          h("td", {}, wertEingabe(f.schluessel, f.wert)),
          h("td", {}, `${vz(b)} (${f.le})`),
          h("td", { class: "nicht-drucken klein" }, f.quelle === "alle" ? "alle Abenteurer" : f.quelle === "typisch" ? "typisch" : f.quelle));
      })));
    const waffen = S.waffen.map((w) => ({ ...w, schluessel: "W:" + w.name })).concat(S.spiel.neu.filter((n) => n.waffe).map((n) => ({ ...n, schluessel: "W:" + n.name })));
    const waffTab = h("table", { class: "werte" },
      h("thead", {}, h("tr", {}, h("th", {}, "Waffenfertigkeit"), h("th", {}, "Wert"), h("th", {}, "mit AnB"))),
      h("tbody", {}, waffen.map((w) => {
        const vert = K.verteidigungsWaffen.includes(w.name);
        const akt = aktuellerWert(w.schluessel, w.wert);
        return h("tr", {}, h("th", {}, w.name), h("td", {}, wertEingabe(w.schluessel, w.wert)), h("td", {}, vert ? "(zur Abwehr)" : vz(akt + (r.AnB || 0))));
      })));
    const spezTab = S.spezialwaffen.length ? h("p", {}, h("strong", {}, "Spezialwaffe(n): "), S.spezialwaffen.map((s) => {
      const [fertName, name] = s.split("|");
      const daten = (K.waffenListe[fertName] || []).find((x) => x[0] === name);
      return `${name} (${fertName}, Schaden ${daten ? daten[2] : "?"}, +2 auf EW:Angriff)`;
    }).join("; ")) : null;
    const zauberListe = kannZaubern() ? h("div", {},
      h("h3", {}, "Zauber"),
      h("ul", { class: "spalten" }, bekannteZauber().map((z) => h("li", {}, z.name + (z.gruppe ? ` (${z.gruppe}${z.stufe ? ", Stufe " + z.stufe : ""})` : z.quelle === "typisch" ? " (typisch)" : "")))),
      S.magierSpezial ? h("p", {}, `Spezialgebiet: ${S.magierSpezial} (+2 auf EW:Zaubern)`) : null) : null;
    const ungelernt = K.ungelernt.map(([n, w]) => [n, (K.ungelerntRasse[S.rasse] || {})[n] ?? w])
      .filter(([n]) => !fert.some((f) => f.name === n));
    return h("section", { class: "bogen" },
      h("h2", {}, "Charakterbogen"),
      h("div", { class: "kopfdaten" },
        [["Name", S.name], ["Spieler/in", S.spieler], ["Typ", kl.name], ["Rasse", S.rasse], ["Grad", String(grad)],
          ["Stand", st ? st.name : ""], ["Heimat", S.heimat], ["Glaube", S.glaube], ["Alter", S.alter],
          ["Gestalt", `${["Gnom", "Halbling", "Zwerg"].includes(S.rasse) ? "klein" : S.gestaltGroesse}, ${S.gestaltFigur}`],
          ["Größe / Gewicht", S.groesse ? `${S.groesse} cm / ${S.gewicht ?? "?"} kg` : ""], ["Händigkeit", haendigkeit() || ""],
          ["EP verfügbar", fmt(S.spiel.ep)], ["Gold", fmt(S.spiel.gold) + " GS"]]
          .map(([a, b]) => h("div", {}, h("small", {}, a), h("strong", {}, b || "–")))),
      h("div", { class: "bogen-raster" },
        h("div", {}, h("h3", {}, "Eigenschaften"), eigTab, h("h3", {}, "Kampf- und Grundwerte"), kampf),
        h("div", {}, h("h3", {}, "Fertigkeiten"), fertTab, h("h3", {}, "Waffenfertigkeiten"), waffTab, spezTab, zauberListe)),
      h("h3", {}, "Ungelernte Fertigkeiten (Kodex S. 44, ohne Leiteigenschaftsbonus)"),
      h("p", { class: "klein" }, ungelernt.map(([n, w]) => `${n}+(${w})`).join(", ") + ". Alle anderen Fertigkeiten ungelernt +(0); Musizieren, Schreiben, Sprache und Lesen von Zauberschrift gar nicht."),
      S.ausruestung ? h("div", {}, h("h3", {}, "Ausrüstung"), h("p", { class: "vorformatiert" }, S.ausruestung)) : null,
      h("div", { class: "nicht-drucken spaeter" },
        info("Steigern und Lernen mit EP, Praxispunkten und Gold läuft über den Bereich „Lernen“ in der Seitenleiste und wird dort protokolliert. Die Wertfelder oben sind nur für Korrekturen gedacht.")));
  }
  function wertEingabe(schluessel, start) {
    const akt = aktuellerWert(schluessel, start);
    return h("span", { class: "wert-eingabe" },
      h("span", { class: "nur-drucken" }, vz(akt)),
      h("input", { type: "number", class: "zahl klein nicht-drucken", value: akt, onchange: (ev) => { const v = zahl(ev.target.value); if (v === start || v === null) delete S.spiel.werte[schluessel]; else S.spiel.werte[schluessel] = v; neuZeichnen(); } }));
  }
  function lerntabelle(kl) {
    const r = [];
    const elf = S.rasse === "Elf";
    r.push(h("h2", { class: "seitenumbruch" }, `Lerntabelle: ${kl.name}${elf ? " (Elf)" : ""}`));
    r.push(h("p", { class: "klein" },
      "Steigern kostet TE: EP = TE × EP je TE, dazu 20 GS je TE. Bis zur Hälfte der EP darf durch Gold ersetzt werden (10 GS = 1 EP). 1 Praxispunkt (PP) ersetzt 1 TE der Fertigkeit, für die er vergeben wurde. ",
      "Neu lernen kostet LE: 1 LE = 3 TE an EP, dazu 200 GS je LE; hier kein Ersatz durch Gold (Kodex S. 153-154). ",
      elf ? "Elfen zahlen je LE 6 EP mehr, für TE nichts (Kodex S. 167). " : "",
      "Grundlage: Lernlisten von Mogadil (material/lernen), nachgerechnet."));
    // gelernte Fertigkeiten
    const gelernt = [];
    for (const f of alleFertigkeiten().concat(S.spiel.neu.filter((n) => !n.waffe))) {
      const fd = fertigkeitDaten(f.name);
      if (!fd) continue;
      gelernt.push({ titel: f.name + (f.spez ? ` (${f.spez})` : ""), lname: fd.name, gruppe: fd.gruppe, le: fd.le, ep: fd.kosten[S.klasse], wert: aktuellerWert("F:" + f.name + "|" + (f.spez || ""), f.wert) });
    }
    for (const w of S.waffen.concat(S.spiel.neu.filter((n) => n.waffe))) {
      const wd = waffenDaten(w.name);
      gelernt.push({ titel: w.name, lname: w.name, gruppe: wd.gruppe, le: "Gs", ep: L.waffenKosten[S.klasse], wert: aktuellerWert("W:" + w.name, w.wert), waffe: true });
    }
    r.push(h("h3", {}, "Gelernte Fertigkeiten: Kosten der nächsten Stufen"));
    r.push(h("p", { class: "klein" }, "Je Zelle: der Zielwert, die TE für genau diese Stufe und die EP dafür. Gold: 20 GS je TE."));
    const maxSpalten = 6;
    r.push(h("div", { class: "tabelle-scroll" }, h("table", { class: "lern" },
      h("thead", {}, h("tr", {}, h("th", {}, "Fertigkeit"), h("th", {}, "Gr."), h("th", {}, "EP/TE"), h("th", {}, "jetzt"),
        Array.from({ length: maxSpalten }, (_, i) => h("th", {}, `${i + 1}. Stufe`)))),
      h("tbody", {}, gelernt.map((g) => {
        const zellen = [];
        for (let i = 1; i <= maxSpalten; i++) {
          const ziel = g.wert + i;
          const te = teFuer(g.gruppe, ziel);
          zellen.push(te === null ? h("td", { class: "leer" }, i === 1 ? "Maximum" : "") :
            h("td", {}, h("strong", {}, `+${ziel}`), h("br"), `${te} TE`, h("br"), h("small", {}, `${fmt(te * g.ep)} EP`)));
        }
        return h("tr", {}, h("th", {}, g.titel), h("td", {}, g.gruppe), h("td", {}, g.ep), h("td", {}, vz(g.wert)), zellen);
      })))));
    // nicht gelernte Fertigkeiten
    const hat = new Set(gelernt.filter((g) => !g.waffe).map((g) => g.lname));
    const offen = L.fertigkeiten.filter((f) => !hat.has(f.name) || ["Sprechen:Sprache", "Schreiben:Sprache", "Landeskunde", "Überleben"].includes(f.name));
    r.push(h("h3", {}, "Neue Fertigkeiten lernen"));
    r.push(h("div", { class: "tabelle-scroll" }, h("table", { class: "lern kompakt" },
      h("thead", {}, h("tr", {}, ["Fertigkeit", "Leiteig.", "Gr.", "Startwert", "LE", "EP", "GS", "dann je Stufe (TE)"].map((t) => h("th", {}, t)))),
      h("tbody", {}, offen.map((f) => {
        const t = L.te[f.gruppe];
        const le = t.lernTE / 3;
        const ep = t.lernTE * f.kosten[S.klasse] + (elf ? 6 * le : 0);
        const nie = elf && K.elfenNie.includes(f.name);
        return h("tr", { class: nie ? "gesperrt" : "" }, h("th", {}, f.name + (nie ? " (Elfen nie)" : "")), h("td", {}, f.le), h("td", {}, f.gruppe), h("td", {}, "+" + t.start),
          h("td", {}, le), h("td", {}, fmt(ep)), h("td", {}, fmt(le * 200)), h("td", { class: "klein" }, t.stufen.map((x, i) => `+${t.start + i + 1}: ${x}`).join(" · ")));
      })))));
    // Waffen
    const hatW = new Set(gelernt.filter((g) => g.waffe).map((g) => g.lname));
    const ep = L.waffenKosten[S.klasse];
    r.push(h("h3", {}, `Neue Waffenfertigkeiten lernen (${ep} EP je TE)`));
    r.push(h("div", { class: "tabelle-scroll" }, h("table", { class: "lern kompakt" },
      h("thead", {}, h("tr", {}, ["Waffenfertigkeit", "Gr.", "Startwert", "LE", "EP", "GS", "dann je Stufe (TE)"].map((t) => h("th", {}, t)))),
      h("tbody", {}, L.waffen.filter((w) => !hatW.has(w.name)).map((w) => {
        const t = L.te[w.gruppe];
        const le = t.lernTE / 3;
        const grund = waffenErlaubt(w.name);
        return h("tr", { class: grund && grund.includes("nicht nutzbar") ? "gesperrt" : "" }, h("th", {}, w.name + (grund ? ` (${grund})` : "")), h("td", {}, w.gruppe), h("td", {}, "+" + t.start), h("td", {}, le),
          h("td", {}, fmt(t.lernTE * ep + (elf ? 6 * le : 0))), h("td", {}, fmt(le * 200)), h("td", { class: "klein" }, t.stufen.map((x, i) => `+${t.start + i + 1}: ${x}`).join(" · ")));
      })))));
    // Zauber
    const zk = L.zauberKosten[S.klasse];
    if (zk && Object.keys(zk).length) {
      const stufenLE = [1, 1, 2, 3, 5, 10, 15, 20, 30, 40, 60, 90];
      r.push(h("h3", {}, "Zauber lernen: EP je Spruchstufe"));
      r.push(h("p", { class: "klein" }, `Dazu 100 GS je LE. Bis zur Hälfte der EP darf durch Gold ersetzt werden (10 GS = 1 EP); 1 PP für Zaubern = 1 LE in derselben Gruppe. Von Spruchrollen: ein Drittel der EP, pauschal 20 GS${elf ? ", Elfen +2 EP je LE" : ""}.` + (S.klasse === "Ma" && S.magierSpezial ? ` Spezialgebiet ${S.magierSpezial}: 30 EP je LE.` : "")));
      r.push(h("div", { class: "tabelle-scroll" }, h("table", { class: "lern kompakt" },
        h("thead", {}, h("tr", {}, h("th", {}, "Gruppe"), h("th", {}, "EP/LE"), stufenLE.map((le, i) => h("th", {}, `Stufe ${i + 1}`, h("br"), h("small", {}, `${le} LE`))))),
        h("tbody", {}, Object.entries(zk).map(([g, epLE]) => {
          let e = S.klasse === "Ma" && S.magierSpezial === g ? 30 : epLE;
          e += elf ? 6 : 0;
          return h("tr", {}, h("th", {}, g), h("td", {}, e), stufenLE.map((le) => h("td", {}, fmt(le * e))));
        })))));
    }
    // Grad
    r.push(h("h3", {}, "Grad und automatische Steigerungen (Kodex S. 165-167)"));
    const ab = (tab, g) => { let w = null; for (const [gr, v] of tab) if (g >= gr) w = v; return w; };
    const apText = (g) => g <= 5 ? (["Bb", "Kr", "Wa"].includes(S.klasse) ? "1W3+3" : kl.ap ? "1W3+2" : "1W3+1") : "1W3";
    r.push(h("div", { class: "tabelle-scroll" }, h("table", { class: "lern kompakt grad" },
      h("thead", {}, h("tr", {}, ["Grad", "ab ES", "Abwehr/Resistenz", "Zaubern", "AP-Zuwachs", "SG"].map((t) => h("th", {}, t)))),
      h("tbody", {}, K.gradES.map((es, i) => {
        const g = i + 1;
        return h("tr", {}, h("td", {}, g), h("td", {}, fmt(es) + (S.rasse === "Zwerg" && g > 1 ? ` (Hort ${fmt(es / 2)} GS)` : "")), h("td", {}, "+" + ab(K.abwehrResistenz, g)),
          h("td", {}, kannZaubern() ? "+" + ab(K.zaubernGrad, g) : "–"), h("td", {}, g === 1 ? "–" : apText(g)), h("td", {}, g % 2 === 0 ? "+1" : ""));
      })))));
    r.push(h("p", { class: "klein" }, "Bei jedem neuen Grad: W% auf Eigenschaftssteigerung um 1W3+1 (51-55 Wk, 56-60 pA, 61-65 Au, 66-70 St, 71-75 Gs, 76-80 Gw, 81-85 Ko, 86-90 In, 91-95 Zt, 96-100 frei)."));
    return h("section", { class: "lerntabelle" }, r);
  }

  // ================================================================ Fenster (statt confirm/prompt)
  // Browser-Dialoge werden in eingebetteten Vorschauen oft unterdrückt, daher eigene Fenster.
  function fenster(titel, baue, opt = {}) {
    const hg = h("div", { class: "dialog-hintergrund" });
    const box = h("div", { class: "dialog" + (opt.breit ? " breit" : ""), role: "dialog", "aria-modal": "true" });
    hg.append(box);
    const esc = (ev) => { if (ev.key === "Escape") schliessen(); };
    let entfernen = () => {};
    const schliessen = () => { entfernen(); document.removeEventListener("keydown", esc); };
    const zeichne = () => box.replaceChildren(...[h("h3", {}, titel), baue(schliessen, zeichne)].flat(Infinity).filter((x) => x !== null && x !== undefined && x !== false));
    zeichne();
    entfernen = ueberlagern(hg);
    document.addEventListener("keydown", esc);
    hg.addEventListener("click", (ev) => { if (ev.target === hg) schliessen(); });
    const erstes = box.querySelector("input, textarea, select, button.haupt");
    if (erstes) erstes.focus();
  }
  // Fenster liegen außerhalb der Wurzel (über allem); die Hülle trägt die Stilklasse.
  function ueberlagern(el) {
    const huelle = h("div", { class: "midgard-cmt cmt-overlay" }, el);
    document.body.append(huelle);
    return () => huelle.remove();
  }
  function nachOben() {
    if (FOUNDRY) { const c = wurzel.closest(".window-content"); if (c) c.scrollTop = 0; }
    else window.scrollTo(0, 0);
  }
  function drucken() {
    if (!FOUNDRY) { window.print(); return; }
    const teile = [...wurzel.querySelectorAll(".bogen, .lerntabelle")].map((e) => e.outerHTML).join("");
    const w = window.open("", "_blank");
    if (!w) { meldung("Drucken nicht möglich", "Der Browser hat das Druckfenster blockiert. Bitte Pop-ups für Foundry erlauben."); return; }
    w.document.write(`<!doctype html><html lang="de"><head><meta charset="utf-8"><title>${(S.name || "Charakter").replace(/</g, "")}</title>` +
      `<link rel="stylesheet" href="${opts.cssUrl || ""}"></head><body class="midgard-cmt drucken">${teile}</body></html>`);
    w.document.close();
    w.addEventListener("load", () => w.print());
  }
  function frage(titel, text, jaText, aktion, neinText = "Abbrechen") {
    fenster(titel, (zu) => [h("p", {}, text), h("div", { class: "knopfreihe" },
      h("button", { type: "button", class: "haupt", onclick: () => { zu(); aktion(); } }, jaText),
      h("button", { type: "button", onclick: zu }, neinText))]);
  }
  function eingabe(titel, text, platzhalter, aktion) {
    fenster(titel, (zu) => {
      const inp = h("input", { type: "text", placeholder: platzhalter || "", onkeydown: (ev) => { if (ev.key === "Enter") { zu(); aktion(inp.value.trim()); } } });
      return [h("p", {}, text), inp, h("div", { class: "knopfreihe" },
        h("button", { type: "button", class: "haupt", onclick: () => { zu(); aktion(inp.value.trim()); } }, "Übernehmen"),
        h("button", { type: "button", onclick: zu }, "Abbrechen"))];
    });
  }
  // Bestätigung vor dem Lernen: „Willst du wirklich … lernen?“ (Nein schließt nur das Fenster)
  function lernenBestaetigen(was, stufe, kosten, aktion) {
    frage("Lernen bestätigen", `Willst du wirklich ${was}${stufe ? ` auf Stufe ${stufe}` : ""} für ${kosten} lernen?`, "Ja, lernen", aktion, "Nein");
  }
  // nur wählbare Optionen zeigen; der Rest wird gezählt und als Hinweis genannt
  function ausgeblendet(n, grund) { return n ? h("small", { class: "ausgeblendet" }, `${n} ${n === 1 ? "Option" : "Optionen"} ausgeblendet (${grund}).`) : null; }
  function meldung(titel, text) {
    fenster(titel, (zu) => [h("p", {}, text), h("div", { class: "knopfreihe" }, h("button", { type: "button", class: "haupt", onclick: zu }, "OK"))]);
  }

  // ================================================================ Charakterverwaltung, Import/Export
  function charakterTitel(c) {
    const kl = c.klasse ? K.klassen[c.klasse].name : "ohne Typ";
    return `${c.name || "Neuer Abenteurer"} · ${kl}${c.rasse !== "Mensch" ? " · " + c.rasse : ""}`;
  }
  function wechseln(id) { S = BIBL.charaktere[id]; neuZeichnen(); nachOben(); }
  function neuerCharakter() { S = leererZustand(); BIBL.charaktere[S.id] = S; neuZeichnen(); nachOben(); }
  function charakterLoeschen() {
    frage("Charakter löschen?", `„${charakterTitel(S)}“ wird aus diesem Browser gelöscht. Exportiere ihn vorher, wenn du ihn behalten willst.`, "Löschen", () => {
      delete BIBL.charaktere[S.id];
      const rest = Object.values(BIBL.charaktere);
      if (rest.length) S = rest[0]; else { S = leererZustand(); BIBL.charaktere[S.id] = S; }
      neuZeichnen();
    });
  }
  function exportDaten(liste) {
    return { format: "midgard5-charaktergenerator", version: 1, exportiert: new Date().toISOString(), charaktere: liste };
  }
  function dateiName(liste) {
    const datum = new Date().toISOString().slice(0, 10);
    const basis = liste.length === 1 ? [liste[0].name || "charakter", liste[0].klasse ? K.klassen[liste[0].klasse].name : ""].filter(Boolean).join("_") : "midgard-gruppe";
    return basis.replace(/[^\wäöüÄÖÜß-]+/g, "_") + "_" + datum + ".json";
  }
  function exportieren(alle) {
    const liste = alle ? Object.values(BIBL.charaktere) : [S];
    try {
      const blob = new Blob([JSON.stringify(exportDaten(liste), null, 1)], { type: "application/json" });
      const a = h("a", { href: URL.createObjectURL(blob), download: dateiName(liste) });
      document.body.append(a); a.click(); a.remove();
    } catch (e) { textExport(alle); }
  }
  function textExport(alle) {
    const text = JSON.stringify(exportDaten(alle ? Object.values(BIBL.charaktere) : [S]));
    fenster(alle ? "Alle Charaktere als Text" : "Charakter als Text", (zu) => {
      const ta = h("textarea", { rows: 8, readonly: true }, text);
      return [h("p", {}, "Diesen Text kopieren und z. B. in einer Notiz oder Mail aufbewahren. Mit „Text importieren“ lässt er sich wieder einlesen."), ta,
        h("div", { class: "knopfreihe" },
          h("button", { type: "button", class: "haupt", onclick: (ev) => {
            ta.select();
            const fertig = () => { ev.target.textContent = "Kopiert"; };
            if (navigator.clipboard) navigator.clipboard.writeText(text).then(fertig, () => { document.execCommand("copy"); fertig(); });
            else { document.execCommand("copy"); fertig(); }
          } }, "Kopieren"),
          h("button", { type: "button", onclick: zu }, "Schließen"))];
    }, { breit: true });
  }
  function textImport() {
    fenster("Text importieren", (zu) => {
      const ta = h("textarea", { rows: 8, placeholder: "Exportierten Text hier einfügen" });
      return [ta, h("div", { class: "knopfreihe" },
        h("button", { type: "button", class: "haupt", onclick: () => { zu(); importText(ta.value); } }, "Importieren"),
        h("button", { type: "button", onclick: zu }, "Abbrechen"))];
    }, { breit: true });
  }
  function dateiImport(ev) {
    const datei = ev.target.files[0];
    ev.target.value = "";
    if (datei) datei.text().then(importText, () => meldung("Import fehlgeschlagen", "Die Datei konnte nicht gelesen werden."));
  }
  function importText(text) {
    let daten;
    try { daten = JSON.parse(text); } catch (e) { meldung("Import fehlgeschlagen", "Das ist keine gültige Charakterdatei (kein lesbares JSON)."); return; }
    const liste = Array.isArray(daten) ? daten : daten && Array.isArray(daten.charaktere) ? daten.charaktere : [daten];
    const gueltige = liste.filter((c) => c && typeof c === "object" && c.eig && typeof c.eig === "object" && c.rasse);
    if (!gueltige.length) { meldung("Import fehlgeschlagen", "In der Datei steht kein Charakter dieses Generators."); return; }
    const neue = gueltige.map(normalisieren);
    const doppelt = neue.filter((c) => BIBL.charaktere[c.id]);
    const uebernehmen = (ueberschreiben) => {
      for (const c of neue) {
        if (BIBL.charaktere[c.id] && !ueberschreiben) c.id = neueId();
        BIBL.charaktere[c.id] = c;
      }
      S = neue[0];
      neuZeichnen();
      meldung("Import abgeschlossen", neue.length === 1 ? `„${charakterTitel(neue[0])}“ wurde geladen.` : `${neue.length} Charaktere wurden geladen.`);
    };
    if (doppelt.length) {
      fenster("Charakter schon vorhanden", (zu) => [
        h("p", {}, `${doppelt.map(charakterTitel).join(", ")} ${doppelt.length === 1 ? "ist" : "sind"} in diesem Browser schon gespeichert.`),
        h("div", { class: "knopfreihe" },
          h("button", { type: "button", class: "haupt", onclick: () => { zu(); uebernehmen(true); } }, "Überschreiben"),
          h("button", { type: "button", onclick: () => { zu(); uebernehmen(false); } }, "Als Kopie anlegen"),
          h("button", { type: "button", onclick: zu }, "Abbrechen"))]);
    } else uebernehmen(false);
  }
  function charakterBereich() {
    const liste = Object.values(BIBL.charaktere);
    return h("div", { class: "charwahl" },
      h("label", { class: "feld" }, h("span", { class: "feld-label" }, "Charakter"),
        h("select", { onchange: (ev) => { if (ev.target.value === "__neu") neuerCharakter(); else wechseln(ev.target.value); } },
          liste.map((c) => h("option", { value: c.id, selected: c.id === S.id }, charakterTitel(c))),
          h("option", { value: "__neu" }, "+ Neuer Charakter"))),
      h("div", { class: "charwahl-knoepfe" },
        h("button", { type: "button", onclick: () => exportieren(false), title: "Diesen Charakter als Datei speichern" }, "Export"),
        h("label", { class: "knopf", title: "Charakterdatei laden" }, "Import", h("input", { type: "file", accept: ".json,application/json", class: "versteckt", onchange: dateiImport })),
        h("button", { type: "button", onclick: datenFenster, title: "Weitere Möglichkeiten" }, "Mehr …")));
  }
  function datenFenster() {
    const anzahl = Object.keys(BIBL.charaktere).length;
    fenster("Daten", (zu) => [
      h("p", { class: "info" }, "Charaktere liegen nur in diesem Browser. Ein Export ist die Sicherung, z. B. vor dem Löschen der Browserdaten oder für ein anderes Gerät."),
      h("div", { class: "daten-knoepfe" },
        h("button", { type: "button", onclick: () => { zu(); exportieren(true); } }, `Alle ${anzahl} Charaktere exportieren (Datei)`),
        h("button", { type: "button", onclick: () => { zu(); textExport(false); } }, "Diesen Charakter als Text"),
        h("button", { type: "button", onclick: () => { zu(); textExport(true); } }, "Alle Charaktere als Text"),
        h("button", { type: "button", onclick: () => { zu(); textImport(); } }, "Text importieren"),
        h("button", { type: "button", class: "gefahr", onclick: () => { zu(); charakterLoeschen(); } }, "Diesen Charakter löschen")),
      h("div", { class: "knopfreihe" }, h("button", { type: "button", onclick: zu }, "Schließen"))]);
  }

  // ================================================================ Spielverlauf: Konto, Lernen, Grad
  const STUFEN_LE = [1, 1, 2, 3, 5, 10, 15, 20, 30, 40, 60, 90];
  const MEHRFACH = ["Sprechen:Sprache", "Schreiben:Sprache", "Landeskunde", "Überleben"];
  const lernAnsichten = [
    { id: "konto", titel: "Konto und Grad" },
    { id: "fert", titel: "Fertigkeiten" },
    { id: "waffen", titel: "Waffen" },
    { id: "zauber", titel: "Zauber", nur: () => !!(L.zauberKosten[S.klasse] && Object.keys(L.zauberKosten[S.klasse]).length) },
    { id: "tabellen", titel: "Lernliste" },
    { id: "protokoll", titel: "Protokoll" },
  ];
  function gradAus(es) {
    if (es >= 40000) return 30 + fl((es - 40000) / 5000);
    let g = 1;
    K.gradES.forEach((x, i) => { if (es >= x) g = i + 1; });
    return g;
  }
  function esFuerGrad(g) { return g <= 30 ? K.gradES[g - 1] : 40000 + (g - 30) * 5000; }
  function abTabelle(tab, g) { let w = null; for (const [gr, v] of tab) if (g >= gr) w = v; return w; }
  function aktGrad() { return Math.min(gradAus(S.spiel.es), S.spiel.gradBestaetigt); }
  function apZuwachsBonus(g) { return g > 5 ? 0 : ["Bb", "Kr", "Wa"].includes(S.klasse) ? 3 : klasse() && klasse().ap ? 2 : 1; }

  // alle gelernten Fertigkeiten und Waffen mit Lerndaten
  function gelernteListe() {
    const liste = [];
    for (const f of alleFertigkeiten().concat(S.spiel.neu.filter((n) => !n.waffe && !n.zauber))) {
      const fd = fertigkeitDaten(f.name);
      if (!fd) continue;
      const key = "F:" + f.name + "|" + (f.spez || "");
      liste.push({ key, titel: f.name + (f.spez ? ` (${f.spez})` : ""), lname: fd.name, gruppe: fd.gruppe, le: f.le || fd.le, ep: fd.kosten[S.klasse], wert: aktuellerWert(key, f.wert) });
    }
    for (const w of S.waffen.concat(S.spiel.neu.filter((n) => n.waffe))) {
      const wd = waffenDaten(w.name);
      const key = "W:" + w.name;
      liste.push({ key, titel: w.name, lname: w.name, gruppe: wd.gruppe, le: "Gs", ep: L.waffenKosten[S.klasse], wert: aktuellerWert(key, w.wert), waffe: true });
    }
    return liste;
  }
  function zauberInfo(name, gruppe) {
    return ZAUBER.find((z) => z.name === name && (!gruppe || z.gruppe === gruppe)) || null;
  }
  function bekannteZauber() {
    const kl = klasse();
    const out = [];
    if (kl && kl.typischerZauber) {
      const n = S.typischerZauber || kl.typischerZauber[0], zi = zauberInfo(n);
      out.push({ name: n, gruppe: zi ? zi.gruppe : "", stufe: zi ? zi.stufe : null, quelle: "typisch" });
    }
    for (const z of S.zauber) { const zi = zauberInfo(z.name, z.gruppe); out.push({ name: z.name, gruppe: z.gruppe, stufe: zi ? zi.stufe : null, quelle: "Spielbeginn" }); }
    for (const z of S.spiel.neu.filter((n) => n.zauber)) out.push({ name: z.name, gruppe: z.gruppe, stufe: z.stufe, quelle: "gelernt" });
    return out;
  }
  function kenntZauber(name, gruppe) { return bekannteZauber().some((z) => z.name === name && (!z.gruppe || !gruppe || z.gruppe === gruppe)); }
  function zauberEP(gruppe) {
    const basis = S.klasse === "Ma" && S.magierSpezial === gruppe ? 30 : (L.zauberKosten[S.klasse] || {})[gruppe];
    return basis === undefined ? null : basis;
  }

  // Buchung mit Rückgängig: vorher wird der Spielstand (ohne Protokoll) gesichert
  function buchen(text, aenderung) {
    const vorher = JSON.parse(JSON.stringify({ spiel: Object.assign({}, S.spiel, { protokoll: undefined }), eig: S.eig, pAwurf: S.pAwurf, Wkwurf: S.Wkwurf, Au: S.Au, festPA: S.festPA ?? null, festWk: S.festWk ?? null }));
    aenderung(S.spiel);
    S.spiel.protokoll.unshift({ zeit: new Date().toISOString(), text, vorher });
    neuZeichnen();
  }
  function rueckgaengig() {
    const e = S.spiel.protokoll[0];
    if (!e) return;
    frage("Letzte Buchung rückgängig machen?", e.text, "Rückgängig", () => {
      const prot = S.spiel.protokoll.slice(1);
      S.spiel = Object.assign(leeresSpiel(), e.vorher.spiel, { protokoll: prot });
      S.eig = e.vorher.eig; S.pAwurf = e.vorher.pAwurf; S.Wkwurf = e.vorher.Wkwurf; S.Au = e.vorher.Au;
      S.festPA = e.vorher.festPA ?? null; S.festWk = e.vorher.festWk ?? null;
      neuZeichnen();
    });
  }

  function kontoKacheln() {
    const sp = S.spiel, g = aktGrad();
    const naechster = esFuerGrad(g + 1);
    const ppSumme = summe(Object.values(sp.pp));
    return h("div", { class: "konto" },
      h("div", { class: "konto-kachel" }, h("small", {}, "EP verfügbar"), h("strong", {}, fmt(sp.ep))),
      h("div", { class: "konto-kachel" }, h("small", {}, "Gold"), h("strong", {}, fmt(sp.gold) + " GS")),
      h("div", { class: "konto-kachel" }, h("small", {}, "Praxispunkte"), h("strong", {}, fmt(ppSumme))),
      h("div", { class: "konto-kachel" }, h("small", {}, "Grad · Erfahrungsschatz"), h("strong", {}, `${g} · ${fmt(sp.es)} ES`),
        gradAus(sp.es) > g ? h("small", { class: "offen-hinweis" }, `Grad ${gradAus(sp.es)} erreicht: Aufstieg unter „Konto und Grad“ übernehmen`)
          : h("small", {}, `Grad ${g + 1} ab ${fmt(naechster)} ES`)));
  }
  function ansichtKonto() {
    const sp = S.spiel;
    const teile = [kontoKacheln()];
    // Gradaufstieg
    if (gradAus(sp.es) > sp.gradBestaetigt) teile.push(gradAufstieg(sp.gradBestaetigt + 1));
    // Gutschriften
    let ep = null, gold = null, grund = "";
    teile.push(karte("Erhalten und ausgeben",
      info("EP aus dem Abenteuer erhöhen verfügbare EP und Erfahrungsschatz. Gold kann positiv (Belohnung) oder negativ (Einkauf) gebucht werden."),
      h("div", { class: "raster3" },
        feld("Erfahrungspunkte", h("input", { type: "number", class: "zahl breit", min: 0, oninput: (ev) => (ep = zahl(ev.target.value)) })),
        feld("Gold (GS, minus = ausgeben)", h("input", { type: "number", class: "zahl breit", oninput: (ev) => (gold = zahl(ev.target.value)) })),
        feld("Anlass", h("input", { type: "text", placeholder: "z. B. Abenteuer „Die Mühle“", oninput: (ev) => (grund = ev.target.value) }))),
      h("div", { class: "knopfreihe" }, h("button", { type: "button", class: "haupt", onclick: () => {
        if (!ep && !gold) return;
        const teileText = [ep ? `${fmt(ep)} EP` : null, gold ? `${gold > 0 ? "+" : ""}${fmt(gold)} GS` : null].filter(Boolean).join(", ");
        buchen(`${teileText}${grund ? " – " + grund : ""}`, (s) => { s.ep += ep || 0; s.es += ep || 0; s.gold += gold || 0; });
      } }, "Buchen"))));
    // PP
    const ziele = gelernteListe().map((g) => [g.key, g.titel]);
    const zk = L.zauberKosten[S.klasse] || {};
    for (const gruppe of Object.keys(zk)) ziele.push(["Z:" + gruppe, "Zaubern: " + gruppe]);
    let ppZiel = "", ppAnz = 1;
    teile.push(karte("Praxispunkte gutschreiben",
      info("1 PP gibt es, wenn ein Erfolgswurf gelingt und der Würfel 16-20 zeigt (Waffen, Abwehr, Zaubern: 20). 1 PP ersetzt beim Steigern 1 TE derselben Fertigkeit, bei Zaubern 1 LE derselben Gruppe (Kodex S. 152-154)."),
      h("div", { class: "inline" },
        h("select", { onchange: (ev) => (ppZiel = ev.target.value) }, h("option", { value: "" }, "Fertigkeit, Waffe oder Zaubergruppe …"), ziele.map(([k, t]) => h("option", { value: k }, t))),
        h("input", { type: "number", class: "zahl", value: 1, min: 1, oninput: (ev) => (ppAnz = zahl(ev.target.value) || 1) }),
        h("button", { type: "button", class: "haupt", onclick: () => {
          if (!ppZiel) return;
          const titel = ziele.find(([k]) => k === ppZiel)[1];
          buchen(`${ppAnz} PP für ${titel}`, (s) => { s.pp[ppZiel] = (s.pp[ppZiel] || 0) + ppAnz; });
        } }, "Gutschreiben")),
      ppListe()));
    teile.push(karte("Letzte Buchungen", protokollListe(3),
      sp.protokoll.length > 3 ? h("button", { type: "button", onclick: () => { S.ansicht = "protokoll"; neuZeichnen(); } }, "Ganzes Protokoll") : null));
    return teile;
  }
  function ppListe() {
    const eintraege = Object.entries(S.spiel.pp).filter(([, n]) => n > 0);
    if (!eintraege.length) return null;
    const namen = Object.fromEntries(gelernteListe().map((g) => [g.key, g.titel]));
    return h("ul", { class: "gekauft" }, eintraege.map(([k, n]) => h("li", {}, h("span", {}, k.startsWith("Z:") ? "Zaubern: " + k.slice(2) : namen[k] || k), h("small", {}, `${n} PP`))));
  }
  function gradAufstieg(g) {
    const sp = S.spiel;
    let apWurf = null, eigWurf = null, eigFrei = "", steigWurf = null;
    const ziel = (w) => w === null ? null : w <= 50 ? null : w <= 55 ? "Wk" : w <= 60 ? "pA" : w <= 65 ? "Au" : w <= 70 ? "St" : w <= 75 ? "Gs" : w <= 80 ? "Gw" : w <= 85 ? "Ko" : w <= 90 ? "In" : w <= 95 ? "Zt" : "frei";
    const box = h("section", { class: "karte grad-karte" });
    const zeichne = () => {
      const z = ziel(eigWurf);
      const eig = z === "frei" ? eigFrei : z;
      const bonusAP = apZuwachsBonus(g);
      box.replaceChildren(
        h("h3", {}, `Grad ${g} erreicht`),
        h("ul", {},
          h("li", {}, `Abwehr und Resistenz: +${abTabelle(K.abwehrResistenz, g)}` + (kannZaubern() ? `, Zaubern: +${abTabelle(K.zaubernGrad, g)}` : "") + " (wird automatisch übernommen)"),
          g % 2 === 0 ? h("li", {}, "+1 Schicksalsgunst (SG)") : null,
          S.rasse === "Zwerg" ? h("li", {}, `Zwerge brauchen zusätzlich einen Hort im Wert von ${fmt(esFuerGrad(g) / 2)} GS (Kodex S. 167).`) : null),
        h("div", { class: "raster3" },
          feld(`AP-Zuwachs: 1W3${bonusAP ? " + " + bonusAP : ""}`, h("div", { class: "inline" },
            h("input", { type: "number", class: "zahl", min: 1, max: 3, placeholder: "1W3", value: apWurf ?? "", onchange: (ev) => { apWurf = zahl(ev.target.value); zeichne(); } }),
            apWurf ? h("strong", {}, `+${apWurf + bonusAP} AP`) : null)),
          feld("Eigenschaft steigern? W%", h("div", { class: "inline" },
            h("input", { type: "number", class: "zahl", min: 1, max: 100, placeholder: "W%", value: eigWurf ?? "", onchange: (ev) => { eigWurf = zahl(ev.target.value); zeichne(); } }),
            eigWurf ? h("strong", {}, z === null ? "keine Steigerung" : z === "frei" ? "freie Wahl" : K.eigenschaftNamen[z]) : null),
            "1-50 keine, 51-55 Wk, 56-60 pA, 61-65 Au, 66-70 St, 71-75 Gs, 76-80 Gw, 81-85 Ko, 86-90 In, 91-95 Zt, 96-100 frei"),
          z ? feld("Steigerung: 1W3 + 1", h("div", { class: "inline" },
            z === "frei" ? h("select", { onchange: (ev) => { eigFrei = ev.target.value; zeichne(); } }, h("option", { value: "" }, "Eigenschaft …"),
              ["St", "Gs", "Gw", "Ko", "In", "Zt", "pA", "Wk", "Au"].map((e) => h("option", { value: e, selected: eigFrei === e }, K.eigenschaftNamen[e]))) : null,
            h("input", { type: "number", class: "zahl", min: 1, max: 3, placeholder: "1W3", value: steigWurf ?? "", onchange: (ev) => { steigWurf = zahl(ev.target.value); zeichne(); } }),
            steigWurf && eig ? h("strong", {}, `${eig} +${steigWurf + 1}`) : null)) : null),
        info("Persönliche Ausstrahlung und Willenskraft ändern sich nicht mit, wenn In oder Ko steigen (Kodex S. 166). Nichtmenschen erreichen höchstens die Grenzwerte ihrer Rasse."),
        h("div", { class: "knopfreihe" }, h("button", { type: "button", class: "haupt", disabled: !apWurf || (z && (!eig || !steigWurf)), onclick: () => {
          const plusAP = apWurf + bonusAP;
          const plusEig = z && eig ? steigWurf + 1 : 0;
          buchen(`Grad ${g}: +${plusAP} AP` + (plusEig ? `, ${eig} +${plusEig}` : ""), (s) => {
            festschreiben();
            s.gradBestaetigt = g; s.apPlus += plusAP;
            if (plusEig) eigenschaftErhoehen(eig, plusEig);
          });
        } }, `Grad ${g} übernehmen`)));
    };
    zeichne();
    return box;
  }
  function eigenschaftErhoehen(e, n) {
    if (K.eigenschaften.includes(e)) {
      const max = (K.rassen[S.rasse].max || {})[e] || 100;
      S.eig[e] = Math.min(max, S.eig[e] + n);
    } else if (e === "pA") S.festPA = Math.min(100, S.festPA + n);
    else if (e === "Wk") S.festWk = Math.min(100, S.festWk + n);
    else if (e === "Au") S.Au = Math.min(100, S.Au + n);
  }

  // ---------------------------------------------------------------- Steigern und Lernen
  function kostenZeile(label, wert, klasse_) { return h("tr", { class: klasse_ || "" }, h("th", {}, label), h("td", {}, wert)); }
  function steigernDialog(g) {
    const sp = S.spiel, ziel = g.wert + 1, te = teFuer(g.gruppe, ziel);
    if (te === null) return;
    const ppVerf = sp.pp[g.key] || 0;
    let pp = Math.min(ppVerf, te), goldEP = 0, belohnung = false;
    fenster(`${g.titel}: +${g.wert} auf +${ziel}`, (zu, neu) => {
      const rest = te - pp;
      const epVoll = belohnung ? Math.ceil(rest * g.ep / 2) : rest * g.ep;
      const maxGold = belohnung ? 0 : fl(epVoll / 2);
      goldEP = Math.min(goldEP, maxGold);
      const ep = epVoll - goldEP, gold = belohnung ? 0 : rest * 20 + goldEP * 10;
      const fehlt = [ep > sp.ep ? `${fmt(ep - sp.ep)} EP` : null, gold > sp.gold ? `${fmt(gold - sp.gold)} GS` : null].filter(Boolean);
      return [
        h("table", { class: "kosten" }, h("tbody", {},
          kostenZeile("Trainingseinheiten", `${te} TE (${g.ep} EP je TE, 20 GS je TE)`),
          pp ? kostenZeile("davon mit Praxispunkten", `${pp} TE`) : null,
          kostenZeile("Kosten", h("strong", {}, `${fmt(ep)} EP, ${fmt(gold)} GS`)),
          kostenZeile("Konto danach", `${fmt(sp.ep - ep)} EP, ${fmt(sp.gold - gold)} GS`, fehlt.length ? "fehlt" : ""))),
        h("div", { class: "raster2" },
          feld(`Praxispunkte einsetzen (vorhanden: ${ppVerf})`, h("input", { type: "number", class: "zahl", min: 0, max: Math.min(ppVerf, te), value: pp, disabled: !ppVerf,
            onchange: (ev) => { pp = Math.max(0, Math.min(ppVerf, te, zahl(ev.target.value) || 0)); neu(); } })),
          feld(`EP durch Gold ersetzen (höchstens ${fmt(maxGold)} EP, 10 GS je EP)`, h("input", { type: "number", class: "zahl breit", min: 0, max: maxGold, value: goldEP, disabled: !maxGold,
            onchange: (ev) => { goldEP = Math.max(0, Math.min(maxGold, zahl(ev.target.value) || 0)); neu(); } }))),
        h("label", { class: "schalter" }, h("input", { type: "checkbox", checked: belohnung, onchange: (ev) => { belohnung = ev.target.checked; neu(); } }),
          " Kostenlose Ausbildung als Belohnung: halbe EP, kein Gold (Kodex S. 154)"),
        fehlt.length ? h("p", { class: "fehlt" }, `Es fehlen ${fehlt.join(" und ")}.`) : null,
        h("div", { class: "knopfreihe" },
          h("button", { type: "button", class: "haupt", disabled: fehlt.length > 0, onclick: () => {
            zu();
            buchen(`${g.titel} auf +${ziel}: ${te} TE` + (pp ? ` (${pp} PP)` : "") + ` – ${fmt(ep)} EP, ${fmt(gold)} GS` + (belohnung ? " (Belohnung)" : ""), (s) => {
              s.werte[g.key] = ziel; if (pp) s.pp[g.key] = ppVerf - pp; s.ep -= ep; s.gold -= gold;
            });
          } }, "Steigern"),
          h("button", { type: "button", onclick: zu }, "Abbrechen"))];
    });
  }
  function lernDialog(e) {
    // e: { lname, gruppe, le (Leiteigenschaft), ep (EP je TE), waffe }
    const sp = S.spiel, t = L.te[e.gruppe], le = t.lernTE / 3;
    let spez = "", belohnung = false;
    fenster(`${e.lname} neu lernen`, (zu, neu) => {
      const ep = t.lernTE * e.ep + elfZuschlag() * le;
      const gold = belohnung ? 0 : le * 200;
      const fehlt = [ep > sp.ep ? `${fmt(ep - sp.ep)} EP` : null, gold > sp.gold ? `${fmt(gold - sp.gold)} GS` : null].filter(Boolean);
      const mehrfach = MEHRFACH.includes(e.lname);
      const schonDa = gelernteListe().some((g) => g.lname === e.lname && (!mehrfach || g.titel.toLowerCase().includes(`(${spez.trim().toLowerCase()})`)));
      return [
        h("table", { class: "kosten" }, h("tbody", {},
          kostenZeile("Startwert", `+${t.start}` + (e.waffe ? "" : ` (${e.le})`)),
          kostenZeile("Lerneinheiten", `${le} LE (= ${t.lernTE} TE an EP${elfZuschlag() ? ", Elf +6 EP je LE" : ""}, 200 GS je LE)`),
          kostenZeile("Kosten", h("strong", {}, `${fmt(ep)} EP, ${fmt(gold)} GS`)),
          kostenZeile("Konto danach", `${fmt(sp.ep - ep)} EP, ${fmt(sp.gold - gold)} GS`, fehlt.length ? "fehlt" : ""))),
        mehrfach ? feld(e.lname === "Landeskunde" ? "Land" : e.lname === "Überleben" ? "Gelände" : "Sprache bzw. Schrift",
          h("input", { type: "text", value: spez, onchange: (ev) => { spez = ev.target.value; neu(); } })) : null,
        info("Beim Lernen neuer Fertigkeiten kann kein Gold EP ersetzen, und Praxispunkte zählen nicht (Kodex S. 154)."),
        h("label", { class: "schalter" }, h("input", { type: "checkbox", checked: belohnung, onchange: (ev) => { belohnung = ev.target.checked; neu(); } }),
          " Kostenlose Ausbildung als Belohnung: kein Gold (Kodex S. 154)"),
        fehlt.length ? h("p", { class: "fehlt" }, `Es fehlen ${fehlt.join(" und ")}.`) : null,
        schonDa ? h("p", { class: "fehlt" }, mehrfach ? "Diese Angabe ist schon gelernt." : "Schon gelernt.") : null,
        h("div", { class: "knopfreihe" },
          h("button", { type: "button", class: "haupt", disabled: fehlt.length > 0 || schonDa || (mehrfach && !spez.trim()), onclick: () => {
            zu();
            buchen(`${e.lname}${spez ? " (" + spez.trim() + ")" : ""} gelernt (+${t.start}): ${le} LE – ${fmt(ep)} EP, ${fmt(gold)} GS` + (belohnung ? " (Belohnung)" : ""), (s) => {
              s.neu.push(e.waffe ? { name: e.lname, waffe: true, wert: t.start } : { name: e.lname, spez: spez.trim(), le: e.le, wert: t.start });
              s.ep -= ep; s.gold -= gold;
            });
          } }, "Lernen"),
          h("button", { type: "button", onclick: zu }, "Abbrechen"))];
    });
  }
  function zauberDialog(startGruppe, startName) {
    const sp = S.spiel, gruppen = Object.keys(L.zauberKosten[S.klasse] || {});
    let name = startName || "", gruppe = startGruppe || gruppen[0], stufe = 1, art = "lehrer", pp = 0, goldEP = 0, gescheitert = false, belohnung = false;
    let frei = false; // Zauber, der nicht in der Arkanum-Liste steht
    fenster("Zauber lernen", (zu, neu) => {
      const liste = ZAUBER.filter((z) => z.gruppe === gruppe).sort((a, b) => a.stufe - b.stufe || a.name.localeCompare(b.name, "de"));
      const ohneListe = !liste.length;
      const ausListe = !frei && !ohneListe;
      const zi = ausListe ? liste.find((z) => z.name === name) : null;
      if (ausListe && !zi) name = "";
      if (zi) stufe = zi.stufe;
      const schwarz = zi && zi.urspr === "schwarzmagisch";
      const sperre = zi && schwarz && S.rasse === "Elf" ? "Schwarze Magie: Elfen dürfen diesen Zauber nicht lernen." : zi && kenntZauber(zi.name, gruppe) ? "Diesen Zauber kennt der Charakter schon." : null;
      const le = STUFEN_LE[stufe - 1];
      const basis = zauberEP(gruppe);
      const ppVerf = sp.pp["Z:" + gruppe] || 0;
      const rolleMoeglich = !["Wundertaten", "Chaoswunder", "Zauberlieder"].includes(gruppe);
      if (!rolleMoeglich && art === "rolle") art = "lehrer";
      let ep, gold, maxGold = 0;
      if (art === "rolle") {
        ep = gescheitert ? 0 : Math.ceil(le * basis / 3) + (S.rasse === "Elf" ? 2 * le : 0);
        gold = 20; pp = 0; goldEP = 0;
      } else {
        pp = Math.min(pp, ppVerf, le);
        const rest = le - pp;
        const epVoll = rest * (basis + elfZuschlag());
        ep = belohnung ? Math.ceil(epVoll / 2) : epVoll;
        maxGold = belohnung ? 0 : fl(ep / 2);
        goldEP = Math.min(goldEP, maxGold);
        ep -= goldEP;
        gold = belohnung ? 0 : rest * 100 + goldEP * 10;
      }
      const fehlt = [ep > sp.ep ? `${fmt(ep - sp.ep)} EP` : null, gold > sp.gold ? `${fmt(gold - sp.gold)} GS` : null].filter(Boolean);
      return [
        h("div", { class: "raster2" },
          feld("Gruppe", h("select", { onchange: (ev) => { gruppe = ev.target.value; name = ""; pp = 0; neu(); } }, gruppen.map((g) => h("option", { value: g, selected: g === gruppe }, `${g} (${zauberEP(g) + elfZuschlag()} EP je LE)`)))),
          ausListe ? feld("Zauber (Arkanum)", h("select", { onchange: (ev) => { if (ev.target.value === "__frei") { frei = true; name = ""; } else name = ev.target.value; neu(); } },
            h("option", { value: "" }, "– Zauber wählen –"),
            liste.map((z) => h("option", { value: z.name, selected: z.name === name, disabled: kenntZauber(z.name, gruppe) || (z.urspr === "schwarzmagisch" && S.rasse === "Elf") },
              `${z.name} (Stufe ${z.stufe}${z.urspr === "schwarzmagisch" ? ", schwarzmagisch" : ""}${kenntZauber(z.name, gruppe) ? ", bekannt" : ""})`)),
            h("option", { value: "__frei" }, "Anderer Zauber (nicht in der Liste) …")))
            : feld("Name des Zaubers", h("div", { class: "inline" }, h("input", { type: "text", value: name, onchange: (ev) => { name = ev.target.value; neu(); } }),
              !ohneListe ? h("button", { type: "button", class: "mini", onclick: () => { frei = false; name = ""; neu(); } }, "aus Liste") : null),
              ohneListe ? `Für ${gruppe} enthält das Arkanum keine Zauber; Name und Stufe aus der Quelle eintragen.` : null),
          zi ? feld("Spruchstufe", h("strong", {}, `Stufe ${zi.stufe} (${le} LE)`), `${zi.art || ""}${zi.art ? "zauber, " : ""}Ursprung ${zi.urspr || "?"}`)
            : feld("Spruchstufe", h("select", { onchange: (ev) => { stufe = +ev.target.value; neu(); } }, STUFEN_LE.map((x, i) => h("option", { value: i + 1, selected: stufe === i + 1 }, `Stufe ${i + 1} (${x} LE)`)))),
          feld("Lernweg", h("select", { onchange: (ev) => { art = ev.target.value; neu(); } },
            h("option", { value: "lehrer", selected: art === "lehrer" }, "Lehrmeister / Selbststudium"),
            rolleMoeglich ? h("option", { value: "rolle", selected: art === "rolle" }, gruppe === "Dweomer" ? "Ogamstab" : "Spruchrolle") : null))),
        art === "lehrer" ? h("div", { class: "raster2" },
          feld(`Praxispunkte ${gruppe} (vorhanden: ${ppVerf}, 1 PP = 1 LE)`, h("input", { type: "number", class: "zahl", min: 0, max: Math.min(ppVerf, le), value: pp, disabled: !ppVerf,
            onchange: (ev) => { pp = Math.max(0, zahl(ev.target.value) || 0); neu(); } })),
          feld(`EP durch Gold ersetzen (höchstens ${fmt(maxGold)} EP, 10 GS je EP)`, h("input", { type: "number", class: "zahl breit", min: 0, max: maxGold, value: goldEP, disabled: !maxGold,
            onchange: (ev) => { goldEP = Math.max(0, zahl(ev.target.value) || 0); neu(); } }))) :
          h("label", { class: "schalter" }, h("input", { type: "checkbox", checked: gescheitert, onchange: (ev) => { gescheitert = ev.target.checked; neu(); } }),
            " Lernversuch gescheitert: keine EP, nur die 20 GS (Kodex S. 156)"),
        art === "lehrer" ? h("label", { class: "schalter" }, h("input", { type: "checkbox", checked: belohnung, onchange: (ev) => { belohnung = ev.target.checked; neu(); } }),
          " Kostenlose Ausbildung als Belohnung: halbe EP, kein Gold (Kodex S. 154)") : null,
        h("table", { class: "kosten" }, h("tbody", {},
          kostenZeile("Lerneinheiten", art === "rolle" ? `${le} LE, ein Drittel der EP, pauschal 20 GS` : `${le} LE${pp ? `, davon ${pp} mit PP` : ""}, 100 GS je LE`),
          kostenZeile("Kosten", h("strong", {}, `${fmt(ep)} EP, ${fmt(gold)} GS`)),
          kostenZeile("Konto danach", `${fmt(sp.ep - ep)} EP, ${fmt(sp.gold - gold)} GS`, fehlt.length ? "fehlt" : ""))),
        fehlt.length ? h("p", { class: "fehlt" }, `Es fehlen ${fehlt.join(" und ")}.`) : null,
        sperre ? h("p", { class: "fehlt" }, sperre) : null,
        h("div", { class: "knopfreihe" },
          h("button", { type: "button", class: "haupt", disabled: fehlt.length > 0 || !!sperre || (!name.trim() && !gescheitert), onclick: () => {
            zu();
            const wie = art === "rolle" ? (gruppe === "Dweomer" ? " vom Ogamstab" : " von Spruchrolle") : "";
            buchen(`${gescheitert ? "Lernversuch gescheitert: " : "Zauber gelernt: "}${name.trim() || "unbenannt"} (${gruppe}, Stufe ${stufe})${wie}` + (pp ? ` (${pp} PP)` : "") + ` – ${fmt(ep)} EP, ${fmt(gold)} GS`, (s) => {
              if (!gescheitert) s.neu.push({ name: name.trim(), zauber: true, gruppe, stufe });
              if (pp) s.pp["Z:" + gruppe] = ppVerf - pp;
              s.ep -= ep; s.gold -= gold;
            });
          } }, gescheitert ? "Versuch buchen" : "Lernen"),
          h("button", { type: "button", onclick: zu }, "Abbrechen"))];
    }, { breit: true });
  }

  // ---------------------------------------------------------------- Ansichten Fertigkeiten, Waffen, Zauber
  function steigerZelle(g) {
    const te = teFuer(g.gruppe, g.wert + 1);
    if (te === null) return h("td", { class: "leer" }, "Maximum");
    return h("td", { class: "naechste" }, h("strong", {}, `+${g.wert + 1}`), h("small", {}, `${te} TE · ${fmt(te * g.ep)} EP · ${fmt(te * 20)} GS`));
  }
  function gelernteTabelle(waffen) {
    const r = berechne();
    const liste = gelernteListe().filter((g) => !!g.waffe === waffen);
    return h("div", { class: "tabelle-scroll" }, h("table", { class: "lern steigern" },
      h("thead", {}, h("tr", {}, ["", "Wert", waffen ? "mit AnB" : "Bonus", "Gr.", "EP/TE", "PP", "nächste Stufe", ""].map((t) => h("th", {}, t)))),
      h("tbody", {}, liste.map((g) => {
        const pp = S.spiel.pp[g.key] || 0;
        const vert = K.verteidigungsWaffen.includes(g.lname);
        return h("tr", {},
          h("th", {}, g.titel),
          h("td", { class: "wert" }, vz(g.wert)),
          h("td", {}, waffen ? (vert ? "Abwehr" : vz(g.wert + (r.AnB || 0))) : `${vz(bonus(wert(g.le)))} ${g.le}`),
          h("td", {}, g.gruppe), h("td", {}, g.ep),
          h("td", { class: "pp" }, h("span", {}, pp || "–"),
            h("button", { type: "button", class: "mini", title: "1 Praxispunkt gutschreiben", onclick: () => buchen(`1 PP für ${g.titel}`, (s) => { s.pp[g.key] = pp + 1; }) }, "+1")),
          steigerZelle(g),
          h("td", {}, teFuer(g.gruppe, g.wert + 1) === null ? null : h("button", { type: "button", class: "haupt klein-knopf", onclick: () => steigernDialog(g) }, "Steigern")));
      }))));
  }
  function lernbareTabelle(waffen) {
    const elf = S.rasse === "Elf";
    const hat = new Set(gelernteListe().filter((g) => !!g.waffe === waffen).map((g) => g.lname));
    const quelle = waffen ? L.waffen.map((w) => ({ lname: w.name, gruppe: w.gruppe, le: "Gs", ep: L.waffenKosten[S.klasse], waffe: true }))
      : L.fertigkeiten.map((f) => ({ lname: f.name, gruppe: f.gruppe, le: f.le, ep: f.kosten[S.klasse] }));
    const liste = quelle.filter((e) => !hat.has(e.lname) || MEHRFACH.includes(e.lname));
    return h("div", { class: "tabelle-scroll" }, h("table", { class: "lern kompakt" },
      h("thead", {}, h("tr", {}, [waffen ? "Waffenfertigkeit" : "Fertigkeit", waffen ? "" : "Leiteig.", "Gr.", "Start", "LE", "EP", "GS", ""].map((t) => h("th", {}, t)))),
      h("tbody", {}, liste.map((e) => {
        const t = L.te[e.gruppe], le = t.lernTE / 3;
        const ep = t.lernTE * e.ep + (elf ? 6 * le : 0);
        const sperre = waffen ? (waffenErlaubt(e.lname) && waffenErlaubt(e.lname).includes("nicht nutzbar") ? waffenErlaubt(e.lname) : null)
          : (elf && K.elfenNie.includes(e.lname) ? "Elfen nie" : null);
        const hinweisText = waffen && !sperre ? waffenErlaubt(e.lname) : null;
        return h("tr", { class: sperre ? "gesperrt" : "" },
          h("th", {}, e.lname, sperre || hinweisText ? h("small", {}, ` (${sperre || hinweisText})`) : null),
          h("td", {}, waffen ? "" : e.le), h("td", {}, e.gruppe), h("td", {}, "+" + t.start), h("td", {}, le), h("td", {}, fmt(ep)), h("td", {}, fmt(le * 200)),
          h("td", {}, sperre ? null : h("button", { type: "button", class: "klein-knopf", onclick: () => lernDialog(e) }, "Lernen")));
      }))));
  }
  function ansichtFert(waffen) {
    return [
      kontoKacheln(),
      karte(waffen ? "Gelernte Waffenfertigkeiten" : "Gelernte Fertigkeiten",
        info("„Steigern“ bucht die nächste Stufe. Praxispunkte und Gold statt EP werden im Fenster verrechnet. „+1“ schreibt einen Praxispunkt gut."),
        gelernteTabelle(waffen)),
      karte(waffen ? "Neue Waffenfertigkeit lernen" : "Neue Fertigkeit lernen", lernbareTabelle(waffen)),
    ];
  }
  function ansichtZauber() {
    const zk = L.zauberKosten[S.klasse] || {};
    const elf = elfZuschlag();
    return [
      kontoKacheln(),
      karte("Bekannte Zauber",
        h("ul", { class: "spalten" }, bekannteZauber().map((z) => h("li", {}, z.name, h("small", {}, ` ${[z.gruppe, z.stufe ? "Stufe " + z.stufe : "", z.quelle].filter(Boolean).join(", ")}`)))),
        h("div", { class: "knopfreihe" }, h("button", { type: "button", class: "haupt", onclick: () => zauberDialog() }, "Zauber lernen"))),
      zauberListeKarte(),
      karte("Zaubergruppen: Kosten und Praxispunkte",
        info(`EP je LE nach Gruppe, dazu 100 GS je LE.${S.klasse === "Ma" && S.magierSpezial ? ` Spezialgebiet ${S.magierSpezial}: 30 EP je LE.` : ""}${elf ? " Elfen zahlen 6 EP mehr je LE." : ""}`),
        h("div", { class: "tabelle-scroll" }, h("table", { class: "lern kompakt" },
          h("thead", {}, h("tr", {}, h("th", {}, "Gruppe"), h("th", {}, "EP/LE"), h("th", {}, "PP"), STUFEN_LE.map((le, i) => h("th", {}, `St. ${i + 1}`, h("br"), h("small", {}, `${le} LE`))), h("th", {}, ""))),
          h("tbody", {}, Object.keys(zk).map((g) => {
            const e = zauberEP(g) + elf;
            const pp = S.spiel.pp["Z:" + g] || 0;
            return h("tr", {}, h("th", {}, g), h("td", {}, e),
              h("td", { class: "pp" }, h("span", {}, pp || "–"), h("button", { type: "button", class: "mini", title: "1 Praxispunkt gutschreiben", onclick: () => buchen(`1 PP für Zaubern: ${g}`, (s) => { s.pp["Z:" + g] = pp + 1; }) }, "+1")),
              STUFEN_LE.map((le) => h("td", {}, fmt(le * e))),
              h("td", {}, h("button", { type: "button", class: "klein-knopf", onclick: () => zauberDialog(g) }, "Lernen")));
          }))))),
    ];
  }
  function zauberListeKarte() {
    const gruppen = Object.keys(L.zauberKosten[S.klasse] || {}).filter((g) => ZAUBER.some((z) => z.gruppe === g));
    if (!gruppen.length) return null;
    if (!gruppen.includes(S.zauberFilter)) S.zauberFilter = gruppen[0];
    const elf = S.rasse === "Elf";
    const liste = ZAUBER.filter((z) => z.gruppe === S.zauberFilter && (!S.zauberSuche || z.name.toLowerCase().includes(S.zauberSuche.toLowerCase())))
      .sort((a, b) => a.stufe - b.stufe || a.name.localeCompare(b.name, "de"));
    const e = zauberEP(S.zauberFilter) + elfZuschlag();
    return karte("Zauberliste (Arkanum, Spruchliste S. 206-207)",
      h("div", { class: "inline filter" },
        h("select", { onchange: (ev) => { S.zauberFilter = ev.target.value; neuZeichnen(); } }, gruppen.map((g) => h("option", { value: g, selected: g === S.zauberFilter }, `${g} (${ZAUBER.filter((z) => z.gruppe === g).length})`))),
        h("input", { type: "search", placeholder: "Zauber suchen", value: S.zauberSuche || "", oninput: (ev) => { S.zauberSuche = ev.target.value; const pos = ev.target.selectionStart; neuZeichnen(); const f = document.querySelector(".filter input"); if (f) { f.focus(); f.setSelectionRange(pos, pos); } } })),
      h("div", { class: "tabelle-scroll" }, h("table", { class: "lern kompakt zauberliste" },
        h("thead", {}, h("tr", {}, ["Zauber", "Stufe", "LE", "EP", "GS", "Art", "Ursprung", ""].map((t) => h("th", {}, t)))),
        h("tbody", {}, liste.map((z) => {
          const le = STUFEN_LE[z.stufe - 1];
          const bekannt = kenntZauber(z.name, z.gruppe);
          const verboten = elf && z.urspr === "schwarzmagisch";
          return h("tr", { class: bekannt ? "bekannt" : verboten ? "gesperrt" : "" },
            h("th", {}, z.name, bekannt ? h("small", {}, " (bekannt)") : null),
            h("td", {}, z.stufe), h("td", {}, le), h("td", {}, fmt(le * e)), h("td", {}, fmt(le * 100)),
            h("td", {}, z.art || ""), h("td", { class: z.urspr === "schwarzmagisch" ? "schwarz" : "" }, z.urspr || ""),
            h("td", {}, bekannt || verboten ? null : h("button", { type: "button", class: "klein-knopf", onclick: () => zauberDialog(z.gruppe, z.name) }, "Lernen")));
        })))),
      liste.length ? null : info("Kein Zauber gefunden."));
  }
  function protokollListe(max) {
    const eintraege = S.spiel.protokoll.slice(0, max || Infinity);
    if (!eintraege.length) return info("Noch keine Buchungen.");
    return h("ol", { class: "protokoll-liste" }, eintraege.map((e, i) => h("li", {},
      h("span", {}, e.text),
      h("small", {}, new Date(e.zeit).toLocaleString("de-DE", { dateStyle: "short", timeStyle: "short" })),
      i === 0 ? h("button", { type: "button", class: "mini", onclick: rueckgaengig }, "Rückgängig") : null)));
  }
  function ansichtProtokoll() {
    return [kontoKacheln(), karte("Alle Buchungen", info("Die jeweils letzte Buchung lässt sich rückgängig machen, auch mehrmals hintereinander."), protokollListe())];
  }
  // Lernliste: nur, was mit den vorhandenen EP und dem Gold jetzt lernbar ist. Ein Klick fragt nach
  // („Willst du wirklich …?“) und bucht. Praxispunkte werden zuerst verrechnet; Gold statt EP,
  // Belohnungen und Spruchrollen gehen über die ausführlichen Fenster in den anderen Reitern.
  function lernlisteDaten() {
    const sp = S.spiel, elf = S.rasse === "Elf";
    const leistbar = (k) => k.ep <= sp.ep && k.gold <= sp.gold;
    const steigern = gelernteListe().map((g) => {
      const ppVerf = sp.pp[g.key] || 0, stufen = [];
      let te = 0;
      for (let i = 1; i <= 6; i++) {
        const t = teFuer(g.gruppe, g.wert + i);
        if (t === null) break;
        te += t;
        const pp = Math.min(ppVerf, te), rest = te - pp;
        const k = { ziel: g.wert + i, te, pp, ep: rest * g.ep, gold: rest * 20 };
        if (!leistbar(k)) break;   // jede weitere Stufe kostet mehr
        stufen.push(k);
      }
      return { g, stufen };
    }).filter((x) => x.stufen.length);
    const neu = (waffen) => {
      const hat = new Set(gelernteListe().filter((g) => !!g.waffe === waffen).map((g) => g.lname));
      const quelle = waffen ? L.waffen.map((w) => ({ lname: w.name, gruppe: w.gruppe, le: "Gs", ep: L.waffenKosten[S.klasse], waffe: true }))
        : L.fertigkeiten.map((f) => ({ lname: f.name, gruppe: f.gruppe, le: f.le, ep: f.kosten[S.klasse] }));
      return quelle.filter((e) => (!hat.has(e.lname) || MEHRFACH.includes(e.lname))
        && !(waffen ? (waffenErlaubt(e.lname) || "").includes("nicht nutzbar") || (waffenErlaubt(e.lname) || "").includes("nur für Zauberer") : elf && K.elfenNie.includes(e.lname)))
        .map((e) => { const t = L.te[e.gruppe], le = t.lernTE / 3; return { e, start: t.start, le, ep: t.lernTE * e.ep + elfZuschlag() * le, gold: le * 200 }; })
        .filter(leistbar);
    };
    const zauber = [];
    for (const gruppe of Object.keys(L.zauberKosten[S.klasse] || {})) {
      const basis = zauberEP(gruppe);
      if (basis === null) continue;
      const ppVerf = sp.pp["Z:" + gruppe] || 0;
      for (const z of ZAUBER.filter((x) => x.gruppe === gruppe)) {
        if (kenntZauber(z.name, gruppe) || (elf && z.urspr === "schwarzmagisch")) continue;
        const le = STUFEN_LE[z.stufe - 1], pp = Math.min(ppVerf, le), rest = le - pp;
        const k = { z, gruppe, le, pp, ep: rest * (basis + elfZuschlag()), gold: rest * 100 };
        if (leistbar(k)) zauber.push(k);
      }
    }
    zauber.sort((a, b) => a.gruppe.localeCompare(b.gruppe, "de") || a.z.stufe - b.z.stufe || a.z.name.localeCompare(b.z.name, "de"));
    return { steigern, fert: neu(false), waffen: neu(true), zauber };
  }
  const lernAnzeige = (n) => String(n).replace(/:Sprache$/, " (Sprache)");
  const kostenText = (k) => [k.le ? `${k.le} LE` : null, k.te ? `${k.te} TE` : null, `${fmt(k.ep)} EP`, `${fmt(k.gold)} GS`].filter(Boolean).join(", ");
  function lernlisteSteigern(g, k) {
    const ppText = k.pp ? ` (davon ${k.pp} TE mit Praxispunkten)` : "";
    lernenBestaetigen(g.titel, `+${k.ziel}`, kostenText(k) + ppText, () => {
      buchen(`${g.titel} auf +${k.ziel}: ${k.te} TE` + (k.pp ? ` (${k.pp} PP)` : "") + ` – ${fmt(k.ep)} EP, ${fmt(k.gold)} GS`, (s) => {
        s.werte[g.key] = k.ziel; if (k.pp) s.pp[g.key] = (s.pp[g.key] || 0) - k.pp; s.ep -= k.ep; s.gold -= k.gold;
      });
    });
  }
  function lernlisteNeu(x) {
    const { e } = x;
    const buche = (spez) => buchen(`${e.lname}${spez ? " (" + spez + ")" : ""} gelernt (+${x.start}): ${x.le} LE – ${fmt(x.ep)} EP, ${fmt(x.gold)} GS`, (s) => {
      s.neu.push(e.waffe ? { name: e.lname, waffe: true, wert: x.start } : { name: e.lname, spez, le: e.le, wert: x.start });
      s.ep -= x.ep; s.gold -= x.gold;
    });
    if (!MEHRFACH.includes(e.lname)) return lernenBestaetigen(lernAnzeige(e.lname), `+${x.start}`, kostenText(x), () => buche(""));
    // Sprachen, Landeskunde, Überleben: Angabe im selben Fenster
    let spez = "";
    const art = e.lname === "Landeskunde" ? "Land" : e.lname === "Überleben" ? "Gelände" : "Sprache bzw. Schrift";
    fenster("Lernen bestätigen", (zu, neuZ) => {
      const schonDa = spez.trim() && gelernteListe().some((g) => g.lname === e.lname && g.titel.toLowerCase().includes(`(${spez.trim().toLowerCase()})`));
      return [h("p", {}, `Willst du wirklich ${lernAnzeige(e.lname)} auf Stufe +${x.start} für ${kostenText(x)} lernen?`),
        feld(art, h("input", { type: "text", value: spez, oninput: (ev) => { spez = ev.target.value; }, onchange: () => neuZ() })),
        schonDa ? h("p", { class: "fehlt" }, "Diese Angabe ist schon gelernt.") : null,
        h("div", { class: "knopfreihe" },
          h("button", { type: "button", class: "haupt", onclick: () => { if (!spez.trim() || schonDa) return neuZ(); zu(); buche(spez.trim()); } }, "Ja, lernen"),
          h("button", { type: "button", onclick: zu }, "Nein"))];
    });
  }
  function lernlisteZauber(k) {
    lernenBestaetigen(`den Zauber ${k.z.name} (${k.gruppe})`, String(k.z.stufe), kostenText(k) + (k.pp ? ` (davon ${k.pp} LE mit Praxispunkten)` : ""), () => {
      buchen(`Zauber gelernt: ${k.z.name} (${k.gruppe}, Stufe ${k.z.stufe})` + (k.pp ? ` (${k.pp} PP)` : "") + ` – ${fmt(k.ep)} EP, ${fmt(k.gold)} GS`, (s) => {
        s.neu.push({ name: k.z.name, zauber: true, gruppe: k.gruppe, stufe: k.z.stufe });
        if (k.pp) s.pp["Z:" + k.gruppe] = (s.pp["Z:" + k.gruppe] || 0) - k.pp;
        s.ep -= k.ep; s.gold -= k.gold;
      });
    });
  }
  function ansichtTabellen() {
    const d = lernlisteDaten(), sp = S.spiel;
    const knopf = (titel, unter, onclick) => h("button", { type: "button", class: "option lernbar", onclick }, h("span", {}, titel), h("small", {}, unter));
    const leer = (text) => info(text);
    const teile = [kontoKacheln(),
      info(`Angezeigt wird nur, was mit ${fmt(sp.ep)} EP und ${fmt(sp.gold)} GS jetzt lernbar ist. Ein Klick fragt nach und bucht. Praxispunkte werden zuerst verrechnet. Gold statt EP, Belohnungen und Spruchrollen: über die Reiter Fertigkeiten, Waffen und Zauber.`),
      karte("Gelernte Fertigkeiten steigern", d.steigern.length
        ? h("div", { class: "lernliste" }, d.steigern.map(({ g, stufen }) => h("div", { class: "lernzeile" },
          h("strong", {}, `${g.titel} ${vz(g.wert)}`),
          h("div", { class: "optionen" }, stufen.map((k) => knopf(`+${k.ziel}`, kostenText(k) + (k.pp ? `, ${k.pp} PP` : ""), () => lernlisteSteigern(g, k)))))))
        : leer("Für keine gelernte Fertigkeit reichen EP und Gold für die nächste Stufe.")),
      karte("Neue Fertigkeit lernen", d.fert.length ? h("div", { class: "optionen" }, d.fert.map((x) => knopf(`${lernAnzeige(x.e.lname)} +${x.start}`, `${x.e.le} · ${kostenText(x)}`, () => lernlisteNeu(x))))
        : leer("Für keine neue Fertigkeit reichen EP und Gold.")),
      karte("Neue Waffenfertigkeit lernen", d.waffen.length ? h("div", { class: "optionen" }, d.waffen.map((x) => knopf(`${x.e.lname} +${x.start}`, kostenText(x), () => lernlisteNeu(x))))
        : leer("Für keine neue Waffenfertigkeit reichen EP und Gold.")),
    ];
    if (Object.keys(L.zauberKosten[S.klasse] || {}).length) {
      const gruppen = [...new Set(d.zauber.map((k) => k.gruppe))];
      teile.push(karte("Zauber lernen", gruppen.length ? gruppen.map((g) => h("div", { class: "waffenstufe" }, h("h4", {}, g),
        h("div", { class: "optionen" }, d.zauber.filter((k) => k.gruppe === g).map((k) => knopf(k.z.name, `Stufe ${k.z.stufe} · ${kostenText(k)}${k.pp ? `, ${k.pp} PP` : ""}`, () => lernlisteZauber(k))))))
        : leer("Für keinen weiteren Zauber reichen EP und Gold.")));
    }
    teile.push(h("details", { class: "volle-lerntabelle" }, h("summary", {}, "Vollständige Lerntabelle (alle Kosten, zum Nachschlagen und Drucken)"), lerntabelle(klasse())));
    return teile;
  }
  function renderLernen(id) {
    if (!klasse()) return [info("Zuerst in der Erschaffung einen Abenteurertyp wählen.")];
    return id === "konto" ? ansichtKonto() : id === "fert" ? ansichtFert(false) : id === "waffen" ? ansichtFert(true)
      : id === "zauber" ? ansichtZauber() : id === "tabellen" ? ansichtTabellen() : ansichtProtokoll();
  }

  // ---------------------------------------------------------------- Rahmen
  // Das Neuzeichnen ersetzt alle Felder. Damit Tab-Navigation nicht nach oben springt, wird das
  // fokussierte Feld über seine Position unter allen Feldern (bzw. Knöpfen) wiedergefunden.
  function fokusMerken() {
    const a = document.activeElement;
    if (!a || !wurzel.contains(a)) return null;
    const gruppe = a.matches("input, select, textarea") ? "input, select, textarea" : a.matches("button") ? "button" : null;
    if (!gruppe) return null;
    let start = null, ende = null;
    try { start = a.selectionStart; ende = a.selectionEnd; } catch (e) { /* Zahlenfelder kennen keine Auswahl */ }
    return { gruppe, index: [...wurzel.querySelectorAll(gruppe)].indexOf(a), start, ende };
  }
  function fokusWiederherstellen(f) {
    if (!f || f.index < 0) return;
    const el = [...wurzel.querySelectorAll(f.gruppe)][f.index];
    if (!el) return;
    el.focus({ preventScroll: true });
    if (f.start !== null) try { el.setSelectionRange(f.start, f.ende); } catch (e) { /* nicht bei allen Feldtypen möglich */ }
  }
  function neuZeichnen() {
    const fokus = fokusMerken();
    zeichnen();
    fokusWiederherstellen(fokus);
  }
  function zeichnen() {
    speichern();
    if (!FOUNDRY) $(".cmt-charakter").replaceChildren(charakterBereich());
    const liste = sichtbar();
    if (S.schritt >= liste.length) S.schritt = liste.length - 1;
    const akt = liste[S.schritt];
    const lernListe = lernAnsichten.filter((a) => !a.nur || a.nur());
    if (S.ansicht && !lernListe.some((a) => a.id === S.ansicht)) S.ansicht = "konto";
    S.besucht = S.besucht || {};
    if (!S.ansicht) S.besucht[akt.id] = true;
    $(".cmt-schritte").replaceChildren(...liste.map((s, i) => {
      const p = s.pruefen();
      const status = !S.besucht[s.id] ? "" : p.some((x) => x.art === "fehler") ? "offen" : "fertig";
      return h("li", {}, h("button", { type: "button", class: (!S.ansicht && i === S.schritt ? "aktiv " : "") + status, onclick: () => { S.schritt = i; S.ansicht = null; neuZeichnen(); nachOben(); } },
        h("span", { class: "nr" }, i + 1), h("span", {}, s.titel)));
    }));
    $(".cmt-lernen-nav").replaceChildren(...lernListe.map((a) => h("li", {}, h("button", { type: "button", class: S.ansicht === a.id ? "aktiv" : "", onclick: () => { S.ansicht = a.id; neuZeichnen(); nachOben(); } },
      h("span", { class: "nr punkt" }), h("span", {}, a.titel)))));
    const haupt = $(".cmt-inhalt");
    kopfzeile();
    const sp = sperren();
    if (S.ansicht) {
      const a = lernListe.find((x) => x.id === S.ansicht);
      haupt.replaceChildren(...[h("h2", { class: "schritt-titel" }, `Lernen: ${a.titel}`),
        sp.lernen ? h("div", { class: "sperre-hinweis warnung" }, sp.lernen) : renderLernen(a.id)].flat(Infinity).filter((x) => x !== null && x !== undefined && x !== false));
      return;
    }
    const meldungen = akt.pruefen();
    // gesperrte Erschaffung: Inhalt sichtbar, aber nicht bedienbar
    const inhalt = sp.erschaffung ? h("div", { class: "gesperrt", inert: true, "aria-disabled": "true" }, akt.render()) : akt.render();
    haupt.replaceChildren(...[
      h("h2", { class: "schritt-titel" }, `${S.schritt + 1}. ${akt.titel}`),
      sp.erschaffung ? h("div", { class: "sperre-hinweis warnung" }, sp.erschaffung) : null,
      inhalt,
      meldungen.length ? h("div", { class: "meldungen nicht-drucken" }, meldungen.map((m) => h("p", { class: m.art }, m.text))) : null,
      h("div", { class: "weiter nicht-drucken" },
        S.schritt > 0 ? h("button", { type: "button", onclick: () => { S.schritt--; neuZeichnen(); nachOben(); } }, "Zurück") : h("span"),
        S.schritt < liste.length - 1 ? h("button", { type: "button", class: "haupt", onclick: () => { S.schritt++; neuZeichnen(); nachOben(); } }, "Weiter") : null),
    ].flat(Infinity).filter((x) => x !== null && x !== undefined && x !== false));
    kopfzeile();
    if (akt.id === "eig" && !sp.erschaffung) summenAbfrage();
  }
  // Zusammenfassung für den Foundry-Bogen: alle Werte so, wie sie im Charakterbogen erscheinen
  function auswertung() {
    const kl = klasse(), r = berechne(), grad = aktGrad(), st = stand();
    const eig = {};
    for (const e of ["St", "Gs", "Gw", "Ko", "In", "Zt", "pA", "Wk", "Au"]) eig[e] = wert(e) ?? null;
    const fertigkeiten = alleFertigkeiten().concat(S.spiel.neu.filter((n) => !n.waffe && !n.zauber)).map((f) => {
      const key = "F:" + f.name + "|" + (f.spez || "");
      const fd = fertigkeitDaten(f.name);
      return { name: f.name, lernname: fd ? fd.name : f.name, spez: f.spez || "", wert: aktuellerWert(key, f.wert), le: f.le || (fd ? fd.le : ""), pp: S.spiel.pp[key] || 0, herkunft: f.quelle || "gelernt" };
    });
    const waffen = S.waffen.concat(S.spiel.neu.filter((n) => n.waffe)).map((w) => {
      const key = "W:" + w.name;
      return { name: w.name, wert: aktuellerWert(key, w.wert), pp: S.spiel.pp[key] || 0 };
    });
    const zauberPP = {};
    for (const [k, v] of Object.entries(S.spiel.pp)) if (k.startsWith("Z:") && v) zauberPP[k.slice(2)] = v;
    return {
      fertig: !!(kl && K.eigenschaften.every((e) => S.eig[e] !== null) && r.LP !== null && r.AP !== null),
      name: S.name, spieler: S.spieler, geschlecht: S.geschlecht, rasse: S.rasse,
      typ: S.klasse, typName: kl ? kl.name : "", typArt: kl ? kl.art : "", grad, es: S.spiel.es, ep: S.spiel.ep, gold: S.spiel.gold,
      eigenschaften: eig, lp: r.LP, ap: r.AP === null ? null : r.AP + S.spiel.apPlus, b: r.B, sg: r.SG + fl(grad / 2),
      faehigkeiten: r.faehigkeiten, trinken: r.Trinken, wahrnehmung: r.Wahrnehmung,
      stand: st ? st.name : "", heimat: S.heimat, glaube: S.glaube, alter: S.alter, groesse: S.groesse, gewicht: S.gewicht,
      gestalt: `${istKlein() || S.rasse === "Zwerg" ? "klein" : S.gestaltGroesse}, ${S.gestaltFigur}`, hand: haendigkeit() || "",
      spezialisierung: S.magierSpezial || "", fertigkeiten, waffen,
      spezialwaffen: S.spezialwaffen.map((x) => { const [fertigkeit, name] = x.split("|"); return { fertigkeit, name }; }),
      zauber: kannZaubern() ? bekannteZauber() : [], zauberPP, ausruestung: S.ausruestung || "",
      protokoll: S.spiel.protokoll.map((e) => ({ zeit: e.zeit, text: e.text })),
    };
  }
  function kopfzeile() {
    const kopf = $(".cmt-kopf-name");
    if (kopf) kopf.textContent = [S.name || "Neuer Abenteurer", klasse() ? klasse().name : null, S.rasse !== "Mensch" ? S.rasse : null].filter(Boolean).join(" · ");
  }
  function spaeterZeichnen() { if (zeigerUnten) wartend.add(neuZeichnen); else setTimeout(neuZeichnen, 0); }

  // Gerüst: Seitenleiste mit Erschaffung und Lernen, daneben der Inhalt
  wurzel.classList.add("midgard-cmt");
  if (FOUNDRY) wurzel.classList.add("im-foundry");
  wurzel.replaceChildren(...[
    FOUNDRY ? null : h("header", { class: "kopf nicht-drucken" },
      h("div", {}, h("h1", {}, "Midgard-Charaktere"), h("p", {}, "Erschaffung und Lernen nach dem Kodex (Midgard 5)")),
      h("div", { class: "kopf-name cmt-kopf-name" })),
    h("div", { class: "rahmen" },
      h("nav", { class: "seitenleiste nicht-drucken", "aria-label": "Navigation" },
        FOUNDRY ? null : h("div", { class: "cmt-charakter" }),
        h("h2", { class: "nav-titel" }, "Erschaffung"), h("ol", { class: "cmt-schritte" }),
        h("h2", { class: "nav-titel" }, "Lernen"), h("ol", { class: "cmt-lernen-nav" }),
        FOUNDRY ? null : h("p", { class: "speicherhinweis" }, "Charaktere bleiben in diesem Browser gespeichert. Zum Sichern oder für ein anderes Gerät: „Export“ oben."),
        opts.version ? h("p", { class: "versionshinweis" }, `Midgard-CMT ${opts.version}`) : null),
      h("main", { class: "cmt-inhalt" })),
  ].filter(Boolean));
  neuZeichnen();
  return { neuZeichnen, zustand: () => S, auswertung };
  }

  window.MidgardCMT = { starte };
})();
