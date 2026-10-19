/* ==========================================================================
   Marginalia · Landing-page book spines
   --------------------------------------------------------------------------
   3D spine parameters for the preloader animation only. Decorative props, not
   user or demo-library data.
   ========================================================================== */

export const BOOKS = {
  editorial: [
    { // 0
      title: "THE ODYSSEY", author: "HOMER",
      spine: "#d4c4a0", text: "#2a2018", depth: 22, h: 0.72, w: 38,
      font: "'Bodoni Moda', serif", weight: 600, size: 13, tracking: "0.08em",
      topMark: "I", band: "rgba(42,32,24,0.3)",
      coverBg: "#d4c4a0", coverText: "#2a2018",
      coverFont: "'Bodoni Moda', serif", coverWeight: 700, coverSize: 28, coverAlign: "center"
    },
    { // 1
      title: "THE GREAT GATSBY", author: "F. SCOTT FITZGERALD",
      spine: "#8b2a1a", text: "#f0e6d2", depth: 14, h: 0.78, w: 22,
      font: "'Fraunces', serif", weight: 700, size: 11, tracking: "0.12em",
      topMark: "·", band: "rgba(240,230,210,0.35)",
      coverBg: "#8b2a1a", coverText: "#f0e6d2",
      coverFont: "'Bodoni Moda', serif", coverWeight: 800, coverSize: 20
    },
    { // 2
      title: "1984", author: "GEORGE ORWELL",
      spine: "#1f1f1f", text: "#c83a2a", depth: 18, h: 0.68, w: 26,
      font: "'IBM Plex Mono', monospace", weight: 700, size: 18, tracking: "0.2em",
      topMark: "II", band: "rgba(200,58,42,0.6)",
      coverBg: "#1f1f1f", coverText: "#c83a2a",
      coverFont: "'IBM Plex Mono', monospace", coverWeight: 700, coverSize: 44, coverAlign: "center"
    },
    { // 3 — accent
      title: "DUNE", author: "FRANK HERBERT",
      spine: "#d89f3a", text: "#1a1208", depth: 42, h: 0.88, w: 52,
      font: "'Fraunces', serif", weight: 700, size: 26, tracking: "0.04em",
      topMark: "2026", band: "rgba(26,18,8,0.35)",
      coverBg: "#d89f3a", coverText: "#1a1208",
      coverFont: "'Fraunces', serif", coverWeight: 800, coverSize: 64, coverAlign: "center",
      accent: true
    },
    { // 4
      title: "BELOVED", author: "TONI MORRISON",
      spine: "#4a2818", text: "#e8c88a", depth: 20, h: 0.74, w: 28,
      font: "'Fraunces', serif", weight: 400, size: 14, tracking: "0.06em", case: "none",
      topMark: "·", band: "rgba(232,200,138,0.35)",
      coverBg: "#4a2818", coverText: "#e8c88a",
      coverFont: "'Fraunces', serif", coverWeight: 400, coverSize: 32, coverCase: "none"
    },
    { // 5
      title: "IF ON A WINTER'S NIGHT A TRAVELER", author: "ITALO CALVINO",
      spine: "#ede5d4", text: "#2a1a12", depth: 12, h: 0.76, w: 20,
      font: "'Fraunces', serif", weight: 400, size: 9, tracking: "0.08em", case: "none",
      topMark: "·",
      coverBg: "#ede5d4", coverText: "#2a1a12",
      coverFont: "'Fraunces', serif", coverWeight: 400, coverSize: 14, coverCase: "none"
    },
    { // 6
      title: "KAFKA ON THE SHORE", author: "HARUKI MURAKAMI",
      spine: "#2a3f4a", text: "#e8dfc8", depth: 32, h: 0.82, w: 40,
      font: "'Fraunces', serif", weight: 500, size: 14, tracking: "0.04em", case: "none",
      topMark: "·", band: "rgba(232,223,200,0.3)",
      coverBg: "#2a3f4a", coverText: "#e8dfc8",
      coverFont: "'Fraunces', serif", coverWeight: 500, coverSize: 30, coverCase: "none"
    },
    { // 7 — hero
      title: "VISIBLE SIGNS", author: "DAVID CROW",
      spine: "#1a2550", text: "#e8dfc8", depth: 62, h: 1.0, w: 86,
      font: "'Fraunces', serif", weight: 500, size: 20, tracking: "0.02em",
      topMark: "2026", band: "rgba(232,223,200,0.25)",
      coverBg: "#1a2550", coverText: "#e8dfc8",
      coverFont: "'Fraunces', serif", coverWeight: 500, coverSize: 48, coverAlign: "center",
      hero: true
    },
    { // 8
      title: "THE BRIEF WONDROUS LIFE OF OSCAR WAO", author: "JUNOT DÍAZ",
      spine: "#3a2a5a", text: "#f0c8a0", depth: 24, h: 0.72, w: 30,
      font: "'Fraunces', serif", weight: 400, size: 10, tracking: "0.1em", case: "none",
      topMark: "·",
      coverBg: "#3a2a5a", coverText: "#f0c8a0",
      coverFont: "'Fraunces', serif", coverWeight: 400, coverSize: 18, coverCase: "none"
    },
    { // 9
      title: "NORMAL PEOPLE", author: "SALLY ROONEY",
      spine: "#e8aabd", text: "#2a1020", depth: 16, h: 0.70, w: 24,
      font: "'Fraunces', serif", weight: 600, size: 15, tracking: "0.06em",
      topMark: "·",
      coverBg: "#e8aabd", coverText: "#2a1020",
      coverFont: "'Fraunces', serif", coverWeight: 600, coverSize: 26, coverAlign: "center"
    },
    { // 10
      title: "DESIGN EMERGENCY", author: "ALICE RAWSTHORN",
      spine: "#2d5a30", text: "#f8e89a", depth: 22, h: 0.84, w: 32,
      font: "'IBM Plex Mono', monospace", weight: 700, size: 14, tracking: "0.14em",
      topMark: "04", band: "rgba(248,232,154,0.45)",
      coverBg: "#2d5a30", coverText: "#f8e89a",
      coverFont: "'IBM Plex Mono', monospace", coverWeight: 700, coverSize: 28, coverAlign: "center"
    },
    { // 11
      title: "PRINTABLE", author: "J. ALDERSON",
      spine: "#cfd8e8", text: "#2a4a8a", depth: 18, h: 0.82, w: 26,
      font: "'Fraunces', serif", weight: 700, size: 22, tracking: "0.32em",
      topMark: "·",
      coverBg: "#cfd8e8", coverText: "#2a4a8a",
      coverFont: "'Fraunces', serif", coverWeight: 800, coverSize: 54, coverAlign: "center"
    },
    { // 12
      title: "PACHINKO", author: "MIN JIN LEE",
      spine: "#7a1f2a", text: "#e8dfc8", depth: 28, h: 0.78, w: 34,
      font: "'Fraunces', serif", weight: 400, size: 13, tracking: "0.04em", case: "none",
      topMark: "·", band: "rgba(232,223,200,0.3)",
      coverBg: "#7a1f2a", coverText: "#e8dfc8",
      coverFont: "'Fraunces', serif", coverWeight: 400, coverSize: 28, coverCase: "none"
    },
    { // 13
      title: "A LITTLE LIFE", author: "HANYA YANAGIHARA",
      spine: "#3a3a3a", text: "#c8a890", depth: 34, h: 0.86, w: 42,
      font: "'Fraunces', serif", weight: 400, size: 13, tracking: "0.06em",
      topMark: "·", band: "rgba(200,168,144,0.3)",
      coverBg: "#3a3a3a", coverText: "#c8a890",
      coverFont: "'Fraunces', serif", coverWeight: 400, coverSize: 24, coverAlign: "center"
    },
    { // 14
      title: "STATION ELEVEN", author: "EMILY ST. JOHN MANDEL",
      spine: "#0f2028", text: "#d8c068", depth: 20, h: 0.74, w: 28,
      font: "'IBM Plex Mono', monospace", weight: 500, size: 11, tracking: "0.18em",
      topMark: "XI",
      coverBg: "#0f2028", coverText: "#d8c068",
      coverFont: "'IBM Plex Mono', monospace", coverWeight: 500, coverSize: 18, coverAlign: "center"
    }
  ],
  jewel: null,
  mono: null
};

BOOKS.jewel = BOOKS.editorial.map((b, i) => {
  const jewels = ["#3a1a2a","#4a2a1a","#2a3a1a","#1a2a4a","#3a2a4a","#4a3a1a","#1a3a3a","#2a1a3a","#3a1a1a","#1a4a2a","#2a1a4a","#3a3a1a","#4a1a2a","#1a2a2a","#2a2a4a"];
  return { ...b, spine: jewels[i % jewels.length], coverBg: jewels[i % jewels.length] };
});
BOOKS.mono = BOOKS.editorial.map((b, i) => {
  const mono = ["#ede5d4","#c8c0b0","#8a8274","#2a2520","#5a544a","#aaa090","#3a3530","#d4cab6","#1a1714","#6a6458","#ccc3af","#8a8070","#4a443a","#b8ae9a","#2f2a24"];
  const c = mono[i % mono.length];
  const t = parseInt(c.slice(1, 3), 16) > 128 ? "#1a1714" : "#ede5d4";
  return { ...b, spine: c, coverBg: c, text: t, coverText: t };
});
