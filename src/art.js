'use strict';
/* SA Garage için özgün vektör çizimler: gün batımı şehri, palmiyeler, araç siluetleri. */
const Art = (() => {
  function rng(seed) {
    let s = (seed >>> 0) || 1;
    return () => { s ^= s << 13; s ^= s >>> 17; s ^= s << 5; return ((s >>> 0) % 100000) / 100000; };
  }
  let uid = 0;
  const id = p => `${p}${++uid}`;

  function palm(x, y, h, lean, color, scale = 1) {
    const topX = x + lean, topY = y - h;
    const trunk = `<path d="M${x} ${y} Q${x + lean * 0.15} ${y - h * 0.55} ${topX} ${topY}" stroke="${color}" stroke-width="${5 * scale}" fill="none" stroke-linecap="round"/>`;
    const fronds = [];
    const angles = [-160, -128, -95, -62, -30, -8, 200];
    angles.forEach((a, i) => {
      const r = (36 + (i % 3) * 8) * scale;
      const rad = a * Math.PI / 180;
      const ex = topX + Math.cos(rad) * r, ey = topY + Math.sin(rad) * r * 0.55 + r * 0.38;
      const cx = topX + Math.cos(rad) * r * 0.55, cy = topY + Math.sin(rad) * r * 0.65 - 6 * scale;
      fronds.push(`<path d="M${topX} ${topY} Q${cx} ${cy} ${ex} ${ey} Q${cx + 2} ${cy + 7 * scale} ${topX} ${topY + 2}" fill="${color}"/>`);
    });
    return trunk + fronds.join('');
  }

  function skyline(r, x0, x1, base, color, windows) {
    let out = '', x = x0;
    while (x < x1) {
      const w = 18 + r() * 34, h = 30 + r() * 95;
      out += `<rect x="${x.toFixed(1)}" y="${(base - h).toFixed(1)}" width="${w.toFixed(1)}" height="${h.toFixed(1)}" fill="${color}"/>`;
      if (windows) {
        for (let wy = base - h + 6; wy < base - 6; wy += 7) for (let wx = x + 4; wx < x + w - 4; wx += 6)
          if (r() < 0.16) out += `<rect x="${wx.toFixed(1)}" y="${wy.toFixed(1)}" width="2.4" height="3" fill="#ffc46b" opacity="${(0.35 + r() * 0.5).toFixed(2)}"/>`;
      }
      x += w + 2 + r() * 6;
    }
    return out;
  }

  // Yan profilden genel bir lowrider/sedan silueti (marka yok)
  function car(x, y, s, body, rim, opts = {}) {
    const g = id('cg');
    const shade = opts.shade || '#00000055';
    return `<g transform="translate(${x} ${y}) scale(${s})">
      <defs><linearGradient id="${g}" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${body}"/><stop offset="1" stop-color="${shade}"/></linearGradient></defs>
      <ellipse cx="150" cy="78" rx="150" ry="9" fill="#000" opacity=".45"/>
      <path d="M8 58 Q6 44 22 40 L70 34 Q92 10 128 8 L188 8 Q214 10 236 32 L282 38 Q298 41 298 54 L298 62 Q298 68 290 68 L10 68 Q6 66 8 58 Z" fill="url(#${g})"/>
      <path d="M80 34 Q98 15 128 13 L156 13 L156 34 Z" fill="#0b0b10" opacity=".85"/>
      <path d="M162 13 L188 13 Q208 15 226 34 L162 34 Z" fill="#0b0b10" opacity=".85"/>
      <path d="M10 46 L294 46" stroke="${rim}" stroke-width="1.6" opacity=".55"/>
      <path d="M22 40 L70 34 Q92 10 128 8 L188 8 Q214 10 236 32 L282 38" stroke="${rim}" stroke-width="2" fill="none" opacity=".8"/>
      <rect x="284" y="44" width="12" height="5" rx="2" fill="#ffd27a"/>
      <rect x="6" y="46" width="8" height="5" rx="2" fill="#ff4d3d"/>
      ${[66, 232].map(cx => `<circle cx="${cx}" cy="64" r="20" fill="#0a0a0d"/><circle cx="${cx}" cy="64" r="12" fill="#c9cdd6"/><circle cx="${cx}" cy="64" r="12" fill="none" stroke="#7d828d" stroke-width="2" stroke-dasharray="2 2.6"/><circle cx="${cx}" cy="64" r="3.5" fill="#5d626d"/>`).join('')}
    </g>`;
  }

  function sun(cx, cy, r, stripes) {
    const g = id('sg'), m = id('sm');
    let cuts = '';
    if (stripes) for (let i = 0; i < 6; i++) cuts += `<rect x="${cx - r}" y="${cy + r * 0.12 + i * r * 0.16}" width="${r * 2}" height="${2 + i * 1.6}" fill="#000"/>`;
    return `<defs><linearGradient id="${g}" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#fff0b3"/><stop offset=".55" stop-color="#ffb04a"/><stop offset="1" stop-color="#ff6a2a"/></linearGradient>
      <mask id="${m}"><rect x="${cx - r}" y="${cy - r}" width="${r * 2}" height="${r * 2}" fill="#fff"/>${cuts}</mask></defs>
      <circle cx="${cx}" cy="${cy}" r="${r * 1.6}" fill="#ffb04a" opacity=".16"/>
      <circle cx="${cx}" cy="${cy}" r="${r}" fill="url(#${g})" mask="url(#${m})"/>`;
  }

  // Ana sayfa büyük görsel
  function hero(seed = 7) {
    const r = rng(seed);
    const sky = id('sky'), fade = id('fade'), road = id('road');
    return `<svg viewBox="0 0 880 330" preserveAspectRatio="xMidYMid slice" xmlns="http://www.w3.org/2000/svg">
      <defs>
        <linearGradient id="${sky}" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stop-color="#2a1430"/><stop offset=".35" stop-color="#7a2f35"/><stop offset=".62" stop-color="#d9672f"/><stop offset=".78" stop-color="#f8a64a"/><stop offset="1" stop-color="#ffcf87"/>
        </linearGradient>
        <linearGradient id="${fade}" x1="0" y1="0" x2="1" y2="0">
          <stop offset="0" stop-color="#0d0f12" stop-opacity=".92"/><stop offset=".42" stop-color="#0d0f12" stop-opacity=".45"/><stop offset=".7" stop-color="#0d0f12" stop-opacity="0"/>
        </linearGradient>
        <linearGradient id="${road}" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#2b1820"/><stop offset="1" stop-color="#0d0a0d"/></linearGradient>
      </defs>
      <rect width="880" height="330" fill="url(#${sky})"/>
      <g transform="translate(0 -52)">
      ${sun(520, 195, 84, true)}
      <path d="M0 230 Q120 168 250 205 Q360 150 470 196 Q600 140 720 190 Q800 160 880 182 L880 260 L0 260 Z" fill="#6b2c3c" opacity=".55"/>
      <path d="M0 240 Q140 205 290 228 Q420 196 560 226 Q700 200 880 220 L880 270 L0 270 Z" fill="#4a1f33" opacity=".7"/>
      ${skyline(r, 360, 900, 262, '#341827', true)}
      <rect x="640" y="92" width="34" height="170" fill="#2c1422"/><rect x="652" y="70" width="10" height="24" fill="#2c1422"/><rect x="656" y="42" width="2" height="30" fill="#2c1422"/>
      ${skyline(r, 330, 900, 252, '#24101b', false)}
      <rect y="246" width="880" height="140" fill="url(#${road})"/>
      <path d="M0 266 L880 266" stroke="#ffb04a" stroke-width="1.5" stroke-dasharray="26 22" opacity=".35"/>
      ${palm(330, 250, 150, 26, '#160b12', 1.25)}
      ${palm(250, 250, 112, -14, '#1b0d15', 1)}
      ${palm(745, 250, 190, -30, '#140a10', 1.4)}
      ${palm(395, 250, 96, 10, '#1a0c13', 0.9)}
      ${car(452, 178, 0.98, '#1d3b2f', '#ffb86b', { shade: '#08140f' })}
      </g>
      <rect width="880" height="330" fill="url(#${fade})"/>
    </svg>`;
  }

  // Kart / haber küçük görseli
  function thumb(seed = 1, color = '#e5e7eb', withCar = true) {
    const r = rng(seed * 97 + 13);
    const sky = id('ts');
    const tones = [['#33182e', '#c7552f', '#ffbd6b'], ['#1b2440', '#5a3d6e', '#f28a5c'], ['#2a1a12', '#a8642d', '#ffd08a'], ['#14202b', '#2f5f73', '#f2b46b']][seed % 4];
    return `<svg viewBox="0 0 260 150" preserveAspectRatio="xMidYMid slice" xmlns="http://www.w3.org/2000/svg">
      <defs><linearGradient id="${sky}" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${tones[0]}"/><stop offset=".65" stop-color="${tones[1]}"/><stop offset="1" stop-color="${tones[2]}"/></linearGradient></defs>
      <rect width="260" height="150" fill="url(#${sky})"/>
      ${sun(70 + r() * 120, 92, 30, true)}
      ${skyline(r, -10, 270, 112, '#1c0f17', true)}
      <rect y="108" width="260" height="42" fill="#121015"/>
      ${palm(22, 112, 70, 10, '#0c070a', 0.6)}${palm(238, 112, 82, -12, '#0c070a', 0.7)}
      ${withCar ? car(48, 70, 0.56, color, '#ffcf8a', { shade: shadeOf(color) }) : ''}
    </svg>`;
  }

  function shadeOf(hex) {
    const n = parseInt(hex.slice(1), 16);
    const f = v => Math.max(0, Math.round(v * 0.32)).toString(16).padStart(2, '0');
    return `#${f(n >> 16)}${f((n >> 8) & 255)}${f(n & 255)}`;
  }

  // Kenar çubuğundaki dikey görsel
  function side() {
    const r = rng(42);
    const sky = id('ss');
    return `<svg viewBox="0 0 220 300" preserveAspectRatio="xMidYMax slice" xmlns="http://www.w3.org/2000/svg">
      <defs><linearGradient id="${sky}" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#0d0f12"/><stop offset=".35" stop-color="#3b1a26"/><stop offset=".75" stop-color="#b8532c"/><stop offset="1" stop-color="#f29a49"/></linearGradient></defs>
      <rect width="220" height="300" fill="url(#${sky})"/>
      ${sun(140, 236, 46, true)}
      ${skyline(r, -5, 230, 268, '#2a1220', true)}
      <rect y="262" width="220" height="40" fill="#120b0f"/>
      ${palm(40, 270, 170, 18, '#0d070a', 1.1)}${palm(190, 270, 120, -10, '#100809', 0.85)}
    </svg>`;
  }

  // Logo: turuncu "SA" amblemi
  function logo(size = 44) {
    const g = id('lg');
    return `<svg width="${size}" height="${size}" viewBox="0 0 64 64" xmlns="http://www.w3.org/2000/svg">
      <defs><linearGradient id="${g}" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#ffb347"/><stop offset="1" stop-color="#ff5e1a"/></linearGradient></defs>
      <path d="M8 46 L14 18 Q15 13 20 13 L56 13 L50 41 Q49 46 44 46 Z" fill="url(#${g})" opacity=".14"/>
      <text x="33" y="44" text-anchor="middle" font-family="Bahnschrift, 'Arial Narrow', Arial, sans-serif" font-weight="800" font-style="italic" font-size="34" fill="url(#${g})" letter-spacing="-2">SA</text>
      <path d="M10 52 L54 52" stroke="url(#${g})" stroke-width="3" stroke-linecap="round"/>
    </svg>`;
  }

  return { hero, thumb, side, logo, car };
})();
