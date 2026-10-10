// Lecture et écriture de fichiers CSV (tableurs : Excel, LibreOffice, Google Sheets)

// Une cellule qui commence par l'un de ces caractères serait exécutée comme une
// formule par le tableur (« injection de formule ») : on la neutralise à l'export
// avec une apostrophe, que les tableurs n'affichent pas.
const FORMULA_START = /^[=+\-@\t\r]/;

function escapeCell(value: string, delimiter: string): string {
  const safe = FORMULA_START.test(value) ? `'${value}` : value;
  return /["\r\n]/.test(safe) || safe.includes(delimiter) ? `"${safe.replaceAll('"', '""')}"` : safe;
}

// « ; » par défaut : c'est le séparateur qu'Excel attend en français
export function toCsv(rows: string[][], delimiter = ';'): string {
  return rows.map((row) => row.map((cell) => escapeCell(cell, delimiter)).join(delimiter)).join('\r\n');
}

// Propose le fichier au téléchargement. La marque BOM au début permet à Excel
// de reconnaître l'UTF-8 (sinon les accents s'affichent mal).
export function downloadCsv(filename: string, csv: string) {
  const url = URL.createObjectURL(new Blob(['﻿', csv], { type: 'text/csv;charset=utf-8' }));
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.append(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

// Séparateur le plus fréquent sur la première ligne (hors guillemets) : ; , ou tabulation
function detectDelimiter(text: string): string {
  const counts: Record<string, number> = { ';': 0, ',': 0, '\t': 0 };
  let quoted = false;
  for (const char of text) {
    if (char === '"') quoted = !quoted;
    else if (!quoted && (char === '\n' || char === '\r')) break;
    else if (!quoted && char in counts) counts[char]++;
  }
  const [best, count] = Object.entries(counts).sort((a, b) => b[1] - a[1])[0];
  return count > 0 ? best : ';';
}

// Découpe un texte CSV en lignes et cellules (guillemets, retours à la ligne dans
// une cellule, guillemets doublés). Les lignes entièrement vides sont ignorées.
export function parseCsv(input: string): string[][] {
  const text = input.replace(/^﻿/, '');
  const delimiter = detectDelimiter(text);
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = '';
  let quoted = false;
  for (let i = 0; i < text.length; i++) {
    const char = text[i];
    if (quoted) {
      if (char === '"' && text[i + 1] === '"') { cell += '"'; i++; }
      else if (char === '"') quoted = false;
      else cell += char;
    } else if (char === '"' && cell === '') {
      quoted = true;
    } else if (char === delimiter) {
      row.push(cell);
      cell = '';
    } else if (char === '\n' || char === '\r') {
      if (char === '\r' && text[i + 1] === '\n') i++;
      row.push(cell);
      rows.push(row);
      row = [];
      cell = '';
    } else {
      cell += char;
    }
  }
  if (cell !== '' || row.length > 0) {
    row.push(cell);
    rows.push(row);
  }
  // Apostrophe ajoutée par notre export devant une formule : on la retire
  return rows
    .map((r) => r.map((c) => (/^'[=+\-@]/.test(c) ? c.slice(1) : c)))
    .filter((r) => r.some((c) => c.trim() !== ''));
}

// Lit un fichier texte en UTF-8, ou en Windows-1252 (vieux fichiers Excel) si ce n'en est pas
export async function readTextFile(file: File): Promise<string> {
  const buffer = await file.arrayBuffer();
  try {
    return new TextDecoder('utf-8', { fatal: true }).decode(buffer);
  } catch {
    return new TextDecoder('windows-1252').decode(buffer);
  }
}
