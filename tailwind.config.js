/** @type {import('tailwindcss').Config} */
export default {
  darkMode: ["class"],
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      borderRadius: {
        lg: "var(--radius)",
        md: "calc(var(--radius) - 2px)",
        sm: "calc(var(--radius) - 4px)",
      },
      colors: {
        border: "hsl(var(--border))",
        input: "hsl(var(--input))",
        ring: "hsl(var(--ring))",
        background: "hsl(var(--background))",
        foreground: "hsl(var(--foreground))",
        primary: {
          DEFAULT: "hsl(var(--primary))",
          foreground: "hsl(var(--primary-foreground))",
        },
        secondary: {
          DEFAULT: "hsl(var(--secondary))",
          foreground: "hsl(var(--secondary-foreground))",
        },
        destructive: {
          DEFAULT: "hsl(var(--destructive))",
          foreground: "hsl(var(--destructive-foreground))",
        },
        muted: {
          DEFAULT: "hsl(var(--muted))",
          foreground: "hsl(var(--muted-foreground))",
        },
        accent: {
          DEFAULT: "hsl(var(--accent))",
          foreground: "hsl(var(--accent-foreground))",
        },
        popover: {
          DEFAULT: "hsl(var(--popover))",
          foreground: "hsl(var(--popover-foreground))",
        },
        card: {
          DEFAULT: "hsl(var(--card))",
          foreground: "hsl(var(--card-foreground))",
        },
        /* Semáforo KPI */
        semaforo: {
          verde: "hsl(var(--semaforo-verde))",
          amarillo: "hsl(var(--semaforo-amarillo))",
          rojo: "hsl(var(--semaforo-rojo))",
        },
        /* Estados de acciones */
        status: {
          pendiente: "hsl(var(--status-pendiente))",
          hoy: "hsl(var(--status-hoy))",
          ejecucion: "hsl(var(--status-ejecucion))",
          bloqueado: "hsl(var(--status-bloqueado))",
          hecho: "hsl(var(--status-hecho))",
          verificado: "hsl(var(--status-verificado))",
        },
        /* Sidebar (Dark Premium) */
        sidebar: {
          DEFAULT: "hsl(var(--sidebar-background))",
          foreground: "hsl(var(--sidebar-foreground))",
          primary: "hsl(var(--sidebar-primary))",
          accent: "hsl(var(--sidebar-accent))",
        },
      },
      backgroundImage: {
        "gradient-primary": "var(--gradient-primary)",
        "gradient-success": "var(--gradient-success)",
        "gradient-warning": "var(--gradient-warning)",
        "gradient-danger": "var(--gradient-danger)",
        "gradient-dark": "var(--gradient-dark)",
      },
      keyframes: {
        "challenge-fade-up": {
          from: { opacity: "0", transform: "translateY(12px)" },
          to: { opacity: "1", transform: "translateY(0)" },
        },
        "challenge-float": {
          "0%, 100%": { transform: "translate(0, 0) scale(1)" },
          "50%": { transform: "translate(10px, -12px) scale(1.06)" },
        },
        "challenge-pulse-soft": {
          "0%, 100%": { opacity: "0.45" },
          "50%": { opacity: "0.85" },
        },
        "challenge-progress": {
          from: { transform: "scaleX(0)" },
          to: { transform: "scaleX(1)" },
        },
      },
      animation: {
        "challenge-fade-up": "challenge-fade-up 0.45s ease-out both",
        "challenge-float": "challenge-float 9s ease-in-out infinite",
        "challenge-pulse-soft": "challenge-pulse-soft 4.5s ease-in-out infinite",
        "challenge-progress": "challenge-progress 0.7s ease-out both",
      },
    },
  },
  plugins: [require("tailwindcss-animate")],
}
