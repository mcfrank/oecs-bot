// Renders a branded typographic card (PNG) for articles with no figure.
// Title + author + opening-paragraph excerpt, OECS colors. SVG -> PNG via resvg.

const path = require('path');
const { Resvg } = require('@resvg/resvg-js');

const FONTS = [
  path.join(__dirname, 'assets/fonts/Lora-Regular.ttf'),
  path.join(__dirname, 'assets/fonts/Inter-Regular.ttf'),
];

// Palette — tweak here.
const BG = '#11243f';      // deep navy
const INK = '#f4efe3';     // cream
const MUTED = '#b9c2d0';   // muted slate
const ACCENT = '#c9a24b';  // gold

const W = 1200;
const H = 675;
const MARGIN = 80;
const MAXW = W - MARGIN * 2;

const esc = (s) =>
  String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

// Greedy word-wrap by estimated glyph width (factor ~ avg char width / font size).
function wrap(text, fontSize, maxWidth, factor) {
  const maxChars = Math.max(8, Math.floor(maxWidth / (fontSize * factor)));
  const words = String(text).split(/\s+/);
  const lines = [];
  let line = '';
  for (const w of words) {
    if (line && (line + ' ' + w).length > maxChars) {
      lines.push(line);
      line = w;
    } else {
      line = line ? line + ' ' + w : w;
    }
  }
  if (line) lines.push(line);
  return lines;
}

function tspans(lines, x, fontSize, lineHeight) {
  return lines
    .map((l, i) => `<tspan x="${x}" dy="${i === 0 ? 0 : lineHeight}">${esc(l)}</tspan>`)
    .join('');
}

function makeCard({ title, byline, abstract }) {
  let y = 175;

  const wordmark = `<text x="${MARGIN}" y="92" font-family="Inter" font-size="24" letter-spacing="3" fill="${ACCENT}">OPEN ENCYCLOPEDIA OF COGNITIVE SCIENCE</text>`;
  const rule = `<rect x="${MARGIN}" y="112" width="90" height="4" fill="${ACCENT}"/>`;

  const titleLines = wrap(title, 58, MAXW, 0.5).slice(0, 3);
  const titleSvg = `<text x="${MARGIN}" y="${y}" font-family="Lora" font-size="58" fill="${INK}">${tspans(titleLines, MARGIN, 58, 70)}</text>`;
  y += 70 * titleLines.length + 14;

  let bylineSvg = '';
  if (byline) {
    bylineSvg = `<text x="${MARGIN}" y="${y}" font-family="Inter" font-size="30" fill="${MUTED}">${esc('by ' + byline)}</text>`;
    y += 56;
  }

  let abstractSvg = '';
  if (abstract) {
    const excerpt = abstract.length > 240 ? abstract.slice(0, 239).replace(/\s+\S*$/, '') + '…' : abstract;
    const lines = wrap(excerpt, 28, MAXW, 0.46).slice(0, 4);
    abstractSvg = `<text x="${MARGIN}" y="${y + 20}" font-family="Lora" font-size="28" fill="${INK}" opacity="0.92">${tspans(lines, MARGIN, 28, 42)}</text>`;
  }

  const footer = `<text x="${MARGIN}" y="${H - 50}" font-family="Inter" font-size="22" fill="${MUTED}">oecs.mit.edu</text>`;

  const svg = `<svg width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" xmlns="http://www.w3.org/2000/svg">
    <rect width="${W}" height="${H}" fill="${BG}"/>
    <rect x="0" y="0" width="12" height="${H}" fill="${ACCENT}"/>
    ${wordmark}${rule}${titleSvg}${bylineSvg}${abstractSvg}${footer}
  </svg>`;

  const resvg = new Resvg(svg, {
    font: { fontFiles: FONTS, loadSystemFonts: false, defaultFontFamily: 'Lora' },
    fitTo: { mode: 'width', value: W },
  });
  return resvg.render().asPng();
}

module.exports = { makeCard };
