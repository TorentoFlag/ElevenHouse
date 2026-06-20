export const colorTokens = {
  core: {
    night: "#0B0B1F",
    violetDeep: "#2A1B4E",
    amethyst: "#8B5CF6",
    gold: "#F4C430",
    moon: "#D8D4EC",
    white: "#FFFFFF",
    black: "#000000"
  },
  background: {
    deepest: "#07060F",
    app: "#0B0B1F",
    panel: "rgba(13, 12, 32, 0.6)",
    panelOpaque: "rgba(13,12,32,0.85)",
    scrim: "rgba(7,6,15,0.7)",
    scrimSoft: "rgba(7,6,15,0.6)",
    scrimStrong: "rgba(7,6,15,0.72)"
  },
  surface: {
    sidebar: "#110F26",
    card: "#16142F",
    raised: "#1E1B3E",
    selected: "#272252",
    popover: "#1A1838",
    calendarPanel: "#14122B",
    documentEnd: "#100E26",
    glass: "rgba(255,255,255,0.045)",
    glassHover: "rgba(255,255,255,0.07)"
  },
  text: {
    primary: "#ECEAF7",
    secondary: "#A7A2C8",
    muted: "#6F6A93",
    moon: "#D8D4EC",
    softWhite: "rgba(236,232,247,0.7)",
    dimWhite: "rgba(236,232,247,0.6)",
    onAccent: "#0B0B1F",
    onGold: "#2A1B0B",
    onGradient: "#1a1230",
    white: "#FFFFFF"
  },
  line: {
    default: "rgba(216, 212, 236, 0.08)",
    strong: "rgba(216, 212, 236, 0.14)",
    amethyst: "rgba(139, 92, 246, 0.32)",
    moon: "rgba(216,212,236,0.18)",
    moonStrong: "rgba(216,212,236,0.22)",
    whiteSubtle: "rgba(255,255,255,0.08)",
    whiteStrong: "rgba(255,255,255,0.1)"
  },
  accent: {
    amethyst: {
      solid: "#8B5CF6",
      soft: "rgba(139, 92, 246, 0.14)",
      line: "rgba(139, 92, 246, 0.40)",
      text: "#B79CFB",
      glow: "rgba(139, 92, 246, 0.45)",
      onSolid: "#0B0B1F"
    },
    gold: {
      solid: "#F4C430",
      soft: "rgba(244, 196, 48, 0.14)",
      line: "rgba(244, 196, 48, 0.42)",
      text: "#F6D266",
      glow: "rgba(244, 196, 48, 0.40)",
      onSolid: "#2A1B0B"
    }
  },
  status: {
    positive: {
      solid: "#4EC8A0",
      soft: "rgba(78, 200, 160, 0.14)",
      line: "rgba(78, 200, 160, 0.3)"
    },
    warning: {
      solid: "#F4C430",
      soft: "rgba(244, 196, 48, 0.14)",
      line: "rgba(244, 196, 48, 0.3)"
    },
    danger: {
      solid: "#F47A7A",
      soft: "rgba(244, 122, 122, 0.12)",
      line: "rgba(244, 122, 122, 0.3)"
    },
    info: {
      solid: "#6FA8FF",
      soft: "rgba(111, 168, 255, 0.16)",
      line: "rgba(111, 168, 255, 0.36)"
    },
    neutral: {
      solid: "#A7A2C8",
      soft: "rgba(167, 162, 200, 0.10)",
      line: "rgba(167, 162, 200, 0.35)"
    }
  },
  data: {
    categorical: [
      "#F4C430",
      "#F47A7A",
      "#E59CC4",
      "#B79CFB",
      "#6FA8FF",
      "#4EC8A0",
      "#D8D4EC",
      "#A7A2C8"
    ],
    product: {
      gold: {
        solid: "#F4C430",
        soft: "rgba(244,196,48,0.14)",
        line: "rgba(244,196,48,0.32)"
      },
      amethyst: {
        solid: "#B79CFB",
        soft: "rgba(183,156,251,0.16)",
        line: "rgba(183,156,251,0.36)"
      },
      rose: {
        solid: "#E59CC4",
        soft: "rgba(229,156,196,0.16)",
        line: "rgba(229,156,196,0.36)"
      },
      emerald: {
        solid: "#4EC8A0",
        soft: "rgba(78,200,160,0.15)",
        line: "rgba(78,200,160,0.34)"
      },
      azure: {
        solid: "#6FA8FF",
        soft: "rgba(111,168,255,0.16)",
        line: "rgba(111,168,255,0.36)"
      }
    },
    elements: {
      fire: "#F4806B",
      earth: "#9BB36A",
      air: "#E7C75B",
      water: "#6FA8FF"
    }
  },
  channel: {
    telegram: "#2AABEE",
    instagram: "#E1306C",
    whatsapp: "#25D366",
    vk: "#0077FF",
    max: "#7C5CFC",
    googleBlue: "#4285F4",
    googleGreen: "#34A853",
    googleYellow: "#FBBC04",
    googleRed: "#EA4335"
  },
  gradient: {
    cosmicTitle: ["#F4C430", "#F47A7A", "#E59CC4", "#B79CFB", "#6FA8FF"],
    cosmicCta: ["#F4C430", "#F47A7A", "#E59CC4", "#B79CFB"],
    goldRose: ["#F4C430", "#E59CC4"],
    goldAmethyst: ["#F4C430", "#B79CFB"],
    azureEmerald: ["#6FA8FF", "#4EC8A0"]
  }
} as const;

export * from "./motion/index.js";
