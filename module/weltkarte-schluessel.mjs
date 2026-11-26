// Schlüssel für die Ortsbeschreibungen der Weltkarte.
// Die Beschreibungen sind Zusammenfassungen aus „Die Welt“ und liegen deshalb nur verschlüsselt im System
// (weltkarte-texte.mjs). Den Schlüssel liefert das eigene PDF: SHA-256 über den Text fester Seiten (Steckbriefe der
// Länderkapitel), auf Buchstaben und Ziffern reduziert. Ohne das Buch lassen sich die Texte nicht lesen; eine andere
// Ausgabe ergibt einen anderen Schlüssel, die Entschlüsselung scheitert dann erkennbar an der Echtheitsprüfung.
//
// Verfahren in reinem JavaScript, weil crypto.subtle nur in sicheren Kontexten (HTTPS, localhost) existiert und viele
// Foundry-Runden über http://<IP>:30000 laufen: SHA-256 im Zählermodus als Stromchiffre (Block i = SHA-256(Schlüssel |
// Nonce | i)), Echtheit mit HMAC-SHA-256 über Nonce und Geheimtext (eigener, abgeleiteter Schlüssel).
//
// Der Seitentext kommt direkt aus pdf.js (getTextContent), nicht aus der Zeilenaufbereitung des Imports, damit
// Verbesserungen am Import den Schlüssel nicht verändern.

/** PDF-Seiten (1-basiert) von „Die Welt“, deren Text den Schlüssel bildet: Steckbriefe von Alba, Aran, Clanngadarn, Erainn, Waeland. */
export const SCHLUESSEL_SEITEN = [32, 46, 71, 81, 233];
const KENNUNG = "midgard5-cmt|weltkarte|1|";

const norm = (s) => String(s).toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^a-z0-9]/g, "");
const utf8 = (s) => new TextEncoder().encode(s);

// ---------------------------------------------------------------- SHA-256 und HMAC (FIPS 180-4, RFC 2104)
const K = new Uint32Array([
  0x428a2f98, 0x71374491, 0xb5c0fbcf, 0xe9b5dba5, 0x3956c25b, 0x59f111f1, 0x923f82a4, 0xab1c5ed5, 0xd807aa98, 0x12835b01, 0x243185be, 0x550c7dc3,
  0x72be5d74, 0x80deb1fe, 0x9bdc06a7, 0xc19bf174, 0xe49b69c1, 0xefbe4786, 0x0fc19dc6, 0x240ca1cc, 0x2de92c6f, 0x4a7484aa, 0x5cb0a9dc, 0x76f988da,
  0x983e5152, 0xa831c66d, 0xb00327c8, 0xbf597fc7, 0xc6e00bf3, 0xd5a79147, 0x06ca6351, 0x14292967, 0x27b70a85, 0x2e1b2138, 0x4d2c6dfc, 0x53380d13,
  0x650a7354, 0x766a0abb, 0x81c2c92e, 0x92722c85, 0xa2bfe8a1, 0xa81a664b, 0xc24b8b70, 0xc76c51a3, 0xd192e819, 0xd6990624, 0xf40e3585, 0x106aa070,
  0x19a4c116, 0x1e376c08, 0x2748774c, 0x34b0bcb5, 0x391c0cb3, 0x4ed8aa4a, 0x5b9cca4f, 0x682e6ff3, 0x748f82ee, 0x78a5636f, 0x84c87814, 0x8cc70208,
  0x90befffa, 0xa4506ceb, 0xbef9a3f7, 0xc67178f2]);

export function sha256(daten) {
  const l = daten.length, bits = l * 8;
  const n = ((l + 9 + 63) >> 6) << 6;
  const m = new Uint8Array(n);
  m.set(daten); m[l] = 0x80;
  const dv = new DataView(m.buffer);
  dv.setUint32(n - 8, Math.floor(bits / 2 ** 32)); dv.setUint32(n - 4, bits >>> 0);
  const h = new Uint32Array([0x6a09e667, 0xbb67ae85, 0x3c6ef372, 0xa54ff53a, 0x510e527f, 0x9b05688c, 0x1f83d9ab, 0x5be0cd19]);
  const w = new Uint32Array(64);
  const ror = (x, r) => (x >>> r) | (x << (32 - r));
  for (let o = 0; o < n; o += 64) {
    for (let i = 0; i < 16; i++) w[i] = dv.getUint32(o + i * 4);
    for (let i = 16; i < 64; i++) {
      const s0 = ror(w[i - 15], 7) ^ ror(w[i - 15], 18) ^ (w[i - 15] >>> 3), s1 = ror(w[i - 2], 17) ^ ror(w[i - 2], 19) ^ (w[i - 2] >>> 10);
      w[i] = (w[i - 16] + s0 + w[i - 7] + s1) >>> 0;
    }
    let [a, b, c, d, e, f, g, hh] = h;
    for (let i = 0; i < 64; i++) {
      const t1 = (hh + (ror(e, 6) ^ ror(e, 11) ^ ror(e, 25)) + ((e & f) ^ (~e & g)) + K[i] + w[i]) >>> 0;
      const t2 = ((ror(a, 2) ^ ror(a, 13) ^ ror(a, 22)) + ((a & b) ^ (a & c) ^ (b & c))) >>> 0;
      hh = g; g = f; f = e; e = (d + t1) >>> 0; d = c; c = b; b = a; a = (t1 + t2) >>> 0;
    }
    h[0] += a; h[1] += b; h[2] += c; h[3] += d; h[4] += e; h[5] += f; h[6] += g; h[7] += hh;
  }
  const aus = new Uint8Array(32), ad = new DataView(aus.buffer);
  for (let i = 0; i < 8; i++) ad.setUint32(i * 4, h[i]);
  return aus;
}

const verbinden = (...teile) => { const a = new Uint8Array(teile.reduce((s, t) => s + t.length, 0)); let o = 0; for (const t of teile) { a.set(t, o); o += t.length; } return a; };

function hmac(schluessel, nachricht) {
  const k = new Uint8Array(64); k.set(schluessel.length > 64 ? sha256(schluessel) : schluessel);
  const innen = k.map((b) => b ^ 0x36), aussen = k.map((b) => b ^ 0x5c);
  return sha256(verbinden(aussen, sha256(verbinden(innen, nachricht))));
}

function strom(schluessel, nonce, daten) {
  const aus = new Uint8Array(daten.length);
  const zaehler = new Uint8Array(4), zv = new DataView(zaehler.buffer);
  for (let i = 0, block = 0; i < daten.length; i += 32, block++) {
    zv.setUint32(0, block);
    const ks = sha256(verbinden(schluessel, nonce, zaehler));
    for (let j = 0; j < 32 && i + j < daten.length; j++) aus[i + j] = daten[i + j] ^ ks[j];
  }
  return aus;
}

const zuBase64 = (bytes) => { let s = ""; for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode(...bytes.subarray(i, i + 0x8000)); return btoa(s); };
const ausBase64 = (b64) => Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));
const teilschluessel = (schluessel, zweck) => sha256(verbinden(utf8(zweck), schluessel));

// ---------------------------------------------------------------- Schlüssel aus dem PDF, Ver- und Entschlüsseln
/** Seitentext für den Schlüssel; wirft, wenn die PDF zu wenige Seiten hat. */
export async function schluesselText(doc) {
  if (doc.numPages < Math.max(...SCHLUESSEL_SEITEN)) throw new Error("PDF hat zu wenige Seiten für „Die Welt“");
  const teile = [];
  for (const n of SCHLUESSEL_SEITEN) {
    const inhalt = await (await doc.getPage(n)).getTextContent();
    teile.push(norm(inhalt.items.map((i) => i.str ?? "").join("")));
  }
  return KENNUNG + teile.join("|");
}

/** Schlüssel (32 Byte) aus dem Seitentext eines PDF-Dokuments (pdf.js). */
export async function schluesselAusPdf(doc) { return sha256(utf8(await schluesselText(doc))); }

/** Objekt verschlüsseln (für das Erzeuger-Skript). */
export function verschluesseln(schluessel, objekt) {
  const nonce = crypto.getRandomValues(new Uint8Array(16));
  const daten = strom(teilschluessel(schluessel, "strom"), nonce, utf8(JSON.stringify(objekt)));
  const pruef = hmac(teilschluessel(schluessel, "echtheit"), verbinden(nonce, daten));
  return { nonce: zuBase64(nonce), daten: zuBase64(daten), pruef: zuBase64(pruef) };
}

/** Entschlüsseln; wirft bei falschem Schlüssel (andere Ausgabe, anderes Buch). */
export function entschluesseln(schluessel, paket) {
  const nonce = ausBase64(paket.nonce), daten = ausBase64(paket.daten);
  const soll = zuBase64(hmac(teilschluessel(schluessel, "echtheit"), verbinden(nonce, daten)));
  if (soll !== paket.pruef) throw new Error("Schlüssel passt nicht");
  return JSON.parse(new TextDecoder().decode(strom(teilschluessel(schluessel, "strom"), nonce, daten)));
}
