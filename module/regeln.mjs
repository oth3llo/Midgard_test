// Abgeleitete Werte nach dem Kodex. Die Tabellen kommen aus daten/kodex.js (window.KODEX),
// dieselbe Quelle wie in der Browser-Fassung.
const K = () => window.KODEX;
const fl = Math.floor;

export const EIGENSCHAFTEN = ["St", "Gs", "Gw", "Ko", "In", "Zt", "Au", "pA", "Wk"];
export const EIGENSCHAFT_NAMEN = { St: "Stärke", Gs: "Geschicklichkeit", Gw: "Gewandtheit", Ko: "Konstitution", In: "Intelligenz", Zt: "Zaubertalent", Au: "Aussehen", pA: "persönliche Ausstrahlung", Wk: "Willenskraft" };
export const ZAUBERGRUPPEN = ["Beherrschen", "Bewegen", "Erkennen", "Erschaffen", "Formen", "Verändern", "Zerstören", "Wundertaten", "Dweomer", "Zauberlieder"];
export const SINNE = ["Sehen", "Nachtsicht", "Hören", "Riechen", "Sechster Sinn"];

/** Bonus einer Eigenschaft (Kodex S. 30). */
export const bonus = (w) => (w === null || w === undefined ? null : w <= 5 ? -2 : w <= 20 ? -1 : w <= 80 ? 0 : w <= 95 ? 1 : 2);
/** Wert aus einer Gradtabelle [[ab Grad, Wert], …]. */
export function abTabelle(tab, g) { let w = null; for (const [gr, v] of tab) if (g >= gr) w = v; return w; }
/** Grad zum Erfahrungsschatz. */
export function gradAus(es) {
  if (es >= 40000) return 30 + fl((es - 40000) / 5000);
  let g = 1;
  K().gradES.forEach((x, i) => { if (es >= x) g = i + 1; });
  return g;
}
export const vz = (w) => (w === null || w === undefined || Number.isNaN(w) ? "–" : w >= 0 ? `+${w}` : `${w}`);

/**
 * Alle abgeleiteten Werte eines Abenteurers.
 * @param {object} s       system-Daten des Akteurs
 * @param {Item[]} items   eingebettete Gegenstände
 */
export function ableiten(s, items) {
  const e = s.eigenschaften;
  const art = s.typArt;                                   // K, ZK, Z oder leer
  const kannZaubern = art === "Z" || art === "ZK";
  const r = {};
  r.boni = { AnB: bonus(e.Gs), AbB: bonus(e.Gw), ZauB: bonus(e.Zt) };
  const zus = art === "Z" ? [2, 2] : art ? [0, 1] : [0, 0];
  if (s.rasse === "Mensch" || !s.rasse) {
    r.boni.ResG = e.In === null ? null : bonus(e.In) + zus[0];
    r.boni.ResK = e.Ko === null ? null : bonus(e.Ko) + zus[1];
  } else {
    const fest = { Elf: 2, Gnom: 4, Halbling: 4, Zwerg: 3 }[s.rasse] ?? 0;
    r.boni.ResG = fest + zus[0];
    r.boni.ResK = fest + zus[1];
  }
  r.boni.AusB = e.Ko === null || e.St === null ? null : fl(e.Ko / 10) + fl(e.St / 20);
  r.boni.SchB = e.St === null || e.Gs === null ? null : fl(e.St / 20) + fl(e.Gs / 30) - 3;

  const grad = Math.max(1, s.grad || 1);
  r.gradAbwehr = abTabelle(K().abwehrResistenz, grad);
  r.gradZaubern = abTabelle(K().zaubernGrad, grad);

  // Rüstung: die getragene mit dem höchsten Rüstungsschutz zählt
  const ruestung = items.filter((i) => i.type === "ruestung" && i.system.getragen).sort((a, b) => b.system.rs - a.system.rs)[0] ?? null;
  const verlust = ruestung ? ruestung.system.abwehrbonusVerlust : "0";
  let abB = r.boni.AbB ?? 0;
  if (verlust === "alle") abB = Math.min(abB, 0);
  else if (Number(verlust) > 0) abB = Math.max(Math.min(abB, 0), abB - Number(verlust));
  r.ruestung = ruestung ? { name: ruestung.name, kuerzel: ruestung.system.kuerzel, rs: ruestung.system.rs, verlust } : { name: "keine", kuerzel: "–", rs: 0, verlust: "0" };
  r.abwehrBonusMitRuestung = abB;
  r.abwehr = r.gradAbwehr + abB;

  // Verteidigungswaffe: höchster Wert unter den Verteidigungs-Waffenfertigkeiten, wenn eine passende Waffe bereitliegt
  const vertFert = items.filter((i) => i.type === "waffenfertigkeit" && i.system.verteidigung);
  const vertWaffen = items.filter((i) => i.type === "waffe" && i.system.art === "verteidigung" && i.system.ausgeruestet);
  const passend = vertFert.filter((f) => vertWaffen.some((w) => w.system.fertigkeit === f.name));
  r.verteidigungswaffe = passend.length ? Math.max(...passend.map((f) => f.system.wert)) : null;

  r.resistenzGeist = r.gradAbwehr + (r.boni.ResG ?? 0);
  r.resistenzKoerper = r.gradAbwehr + (r.boni.ResK ?? 0);
  r.kannZaubern = kannZaubern;
  r.zaubern = kannZaubern ? r.gradZaubern + (r.boni.ZauB ?? 0) : null;
  r.raufen = e.St === null || e.Gw === null ? null : fl((e.St + e.Gw) / 20) + (r.boni.AnB ?? 0) + (s.rasse === "Zwerg" ? 1 : 0);

  // Waffen: Erfolgswert aus der passenden Waffenfertigkeit + AnB (+2 Spezialwaffe), Schaden + SchB
  const fertNachName = new Map(items.filter((i) => i.type === "waffenfertigkeit").map((i) => [i.name, i]));
  r.waffen = items.filter((i) => i.type === "waffe").map((w) => {
    const fert = fertNachName.get(w.system.fertigkeit);
    const vert = w.system.art === "verteidigung";
    const spezial = (s.spezialwaffen ?? []).some((x) => x.fertigkeit === w.system.fertigkeit && x.name === (w.system.grundname || w.name));
    const ew = fert ? fert.system.wert + (vert ? 0 : (r.boni.AnB ?? 0) + (spezial ? 2 : 0)) : null;
    const mangel = Object.entries(w.system.mindest ?? {}).filter(([k, v]) => v && (e[k] ?? 0) < v).map(([k, v]) => `${k} ${v}`);
    const schB = r.boni.SchB ?? 0;
    const schaden = w.system.schaden ? (vert ? w.system.schaden : `${w.system.schaden}${schB ? vz(schB) : ""}`) : "";
    return { id: w.id, name: w.name, img: w.img, ew, vert, schaden, art: w.system.art, ausgeruestet: w.system.ausgeruestet, ohneFertigkeit: !fert, mangel, spezialwaffe: spezial };
  });

  // Fertigkeiten: Erfolgswert = Fertigkeitswert + Bonus der Leiteigenschaft
  r.fertigkeiten = items.filter((i) => i.type === "fertigkeit").map((f) => {
    const b = bonus(e[f.system.leiteigenschaft]) ?? 0;
    return { id: f.id, name: f.name + (f.system.angabe ? ` (${f.system.angabe})` : ""), img: f.img, wert: f.system.wert, bonus: b, ew: f.system.wert + b, le: f.system.leiteigenschaft, pp: f.system.pp ?? 0, verwaltet: !!f.getFlag?.("midgard5-cmt", "cmt") };
  }).sort((a, b) => a.name.localeCompare(b.name, "de"));

  // ungelernte Fertigkeiten (Kodex S. 44), ohne bereits gelernte
  const gelernt = new Set(items.filter((i) => i.type === "fertigkeit").map((i) => i.name));
  const lernName = (n) => K().lernName[n] || n;
  r.ungelernt = K().ungelernt.map(([n, w]) => [n, (K().ungelerntRasse[s.rasse] || {})[n] ?? w]).filter(([n]) => !gelernt.has(n) && !gelernt.has(lernName(n)));

  // Sinne und angeborene Fähigkeiten
  const f = Object.fromEntries((s.faehigkeiten ?? []).map((x) => [x.name, x.wert]));
  r.sinne = SINNE.map((n) => ({ name: n === "Riechen" ? "Riechen/Schmecken" : n, wert: f[n] ?? null }));
  r.weitereFaehigkeiten = (s.faehigkeiten ?? []).filter((x) => !SINNE.includes(x.name));

  // Last
  r.gewicht = items.reduce((summe, i) => summe + (Number(i.system.gewicht) || 0) * (i.type === "gegenstand" ? i.system.anzahl ?? 1 : 1), 0);
  return r;
}
