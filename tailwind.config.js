module.exports = {
  darkMode: ["class"],
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        // These reference the CSS custom properties defined in index.css
        // (:root for light, .dark for the student dashboard's scoped dark
        // mode) instead of hardcoded values — without the var() + hsl()
        // wrapping, a .dark ancestor class has nothing to actually change,
        // since Tailwind would bake in the light value at build time.
        // hsl(var(--x) / <alpha-value>) is what makes opacity modifiers
        // (bg-background/90, etc.) work on top of a CSS variable.
        border: "hsl(var(--color-border) / <alpha-value>)",
        input: "hsl(var(--color-input) / <alpha-value>)",
        ring: "hsl(var(--color-ring) / <alpha-value>)",
        background: "hsl(var(--color-background) / <alpha-value>)",
        foreground: "hsl(var(--color-foreground) / <alpha-value>)",
        primary: {
          DEFAULT: "hsl(var(--color-primary) / <alpha-value>)",
          foreground: "hsl(var(--color-primary-foreground) / <alpha-value>)",
          hover: "hsl(var(--color-primary-hover) / <alpha-value>)",
          active: "hsl(var(--color-primary-active) / <alpha-value>)",
        },
        secondary: {
          DEFAULT: "hsl(var(--color-secondary) / <alpha-value>)",
          foreground: "hsl(var(--color-secondary-foreground) / <alpha-value>)",
          hover: "hsl(var(--color-secondary-hover) / <alpha-value>)",
          active: "hsl(var(--color-secondary-active) / <alpha-value>)",
        },
        tertiary: {
          DEFAULT: "hsl(var(--color-tertiary) / <alpha-value>)",
          foreground: "hsl(var(--color-tertiary-foreground) / <alpha-value>)",
        },
        accent: {
          DEFAULT: "hsl(var(--color-accent) / <alpha-value>)",
          foreground: "hsl(var(--color-accent-foreground) / <alpha-value>)",
        },
        success: {
          DEFAULT: "hsl(var(--color-success) / <alpha-value>)",
          foreground: "hsl(var(--color-success-foreground) / <alpha-value>)",
        },
        warning: {
          DEFAULT: "hsl(var(--color-warning) / <alpha-value>)",
          foreground: "hsl(var(--color-warning-foreground) / <alpha-value>)",
        },
        error: {
          DEFAULT: "hsl(var(--color-error) / <alpha-value>)",
          foreground: "hsl(var(--color-error-foreground) / <alpha-value>)",
        },
        info: {
          DEFAULT: "hsl(var(--color-info) / <alpha-value>)",
          foreground: "hsl(var(--color-info-foreground) / <alpha-value>)",
        },
        muted: {
          DEFAULT: "hsl(var(--color-muted) / <alpha-value>)",
          foreground: "hsl(var(--color-muted-foreground) / <alpha-value>)",
        },
        // No dark-mode variable defined for this one (kept the same in
        // both themes — a destructive-red reads fine on both).
        destructive: {
          DEFAULT: "hsl(0, 80%, 50%)",
          foreground: "hsl(0, 0%, 100%)",
        },
        card: {
          DEFAULT: "hsl(var(--color-card) / <alpha-value>)",
          foreground: "hsl(var(--color-card-foreground) / <alpha-value>)",
        },
        popover: {
          DEFAULT: "hsl(var(--color-popover) / <alpha-value>)",
          foreground: "hsl(var(--color-popover-foreground) / <alpha-value>)",
        },
        neutral: {
          50: "hsl(0, 0%, 98%)",
          100: "hsl(0, 0%, 95%)",
          200: "hsl(0, 0%, 90%)",
          300: "hsl(0, 0%, 80%)",
          400: "hsl(0, 0%, 65%)",
          500: "hsl(0, 0%, 50%)",
          600: "hsl(0, 0%, 40%)",
          700: "hsl(0, 0%, 30%)",
          800: "hsl(0, 0%, 20%)",
          900: "hsl(0, 0%, 10%)",
        },
      },
      fontFamily: {
        sans: ['"Inter"', 'sans-serif'],
        heading: ['"DM Sans"', 'sans-serif'],
        mono: ['"IBM Plex Mono"', 'monospace'],
      },
      fontSize: {
        'h1': ['36px', { lineHeight: '1.2', fontWeight: '500' }],
        'h2': ['28px', { lineHeight: '1.25', fontWeight: '500' }],
        'h3': ['22px', { lineHeight: '1.3', fontWeight: '500' }],
        'h4': ['18px', { lineHeight: '1.4', fontWeight: '500' }],
        'body-lg': ['18px', { lineHeight: '1.5', fontWeight: '400' }],
        'body': ['16px', { lineHeight: '1.5', fontWeight: '400' }],
        'body-sm': ['14px', { lineHeight: '1.5', fontWeight: '400' }],
        'caption': ['12px', { lineHeight: '1.5', fontWeight: '400' }],
      },
      spacing: {
        '1': '4px',
        '2': '8px',
        '4': '16px',
        '6': '24px',
        '8': '32px',
		  '12': '48px',
        '16': '64px',
        'xs': '8px',
        'sm': '16px',
        'md': '24px',
        'lg': '32px',
        'xl': '48px',
        '2xl': '64px',
      },
      borderRadius: {
        sm: '4px',
        md: '8px',
        lg: '12px',
        full: '9999px',
      },
      boxShadow: {
        sm: '0 1px 2px hsla(0, 0%, 0%, 0.05)',
        md: '0 2px 4px hsla(0, 0%, 0%, 0.1)',
        lg: '0 4px 10px hsla(0, 0%, 0%, 0.15)',
        xl: '0 6px 20px hsla(0, 0%, 0%, 0.2)',
      },
      transitionDuration: {
        fast: '150ms',
        normal: '300ms',
        slow: '450ms',
      },
      transitionTimingFunction: {
        'ease-in': 'cubic-bezier(0.4, 0, 1, 1)',
        'ease-out': 'cubic-bezier(0, 0, 0.2, 1)',
        'ease-in-out': 'cubic-bezier(0.4, 0, 0.2, 1)',
      },
      backgroundImage: {
        'gradient-primary': 'linear-gradient(135deg, hsl(222, 75%, 52%), hsl(266, 80%, 60%))',
        'gradient-secondary': 'linear-gradient(135deg, hsl(222, 65%, 60%), hsl(208, 80%, 55%))',
        'gradient-accent': 'linear-gradient(135deg, hsl(266, 80%, 60%), hsl(290, 80%, 65%))',
      },
    },
  },
  // tailwindcss-animate was installed but never registered here, so every
  // animate-in/fade-in/slide-in-from-*/duration-* class used across the
  // app (LoginPage modals, UserManagement, StudentDashboard, etc.) was a
  // no-op — the plugin defines those utilities, so without it Tailwind
  // just silently drops them.
  plugins: [require("tailwindcss-animate")],
}