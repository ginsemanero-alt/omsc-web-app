module.exports = {
  darkMode: ["class"],
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        border: "hsl(222, 15%, 85%)",
        input: "hsl(0, 0%, 85%)",
        ring: "hsl(210, 85%, 55%)",
        background: "hsl(0, 0%, 99%)",
        foreground: "hsl(222, 25%, 20%)",
        primary: {
          DEFAULT: "hsl(222, 75%, 52%)",
          foreground: "hsl(0, 0%, 100%)",
          hover: "hsl(222, 75%, 42%)",
          active: "hsl(222, 75%, 38%)",
        },
        secondary: {
          DEFAULT: "hsl(222, 65%, 60%)",
          foreground: "hsl(0, 0%, 100%)",
          hover: "hsl(222, 65%, 50%)",
          active: "hsl(222, 65%, 45%)",
        },
        tertiary: {
          DEFAULT: "hsl(240, 35%, 95%)",
          foreground: "hsl(222, 35%, 25%)",
        },
        accent: {
          DEFAULT: "hsl(266, 80%, 60%)",
          foreground: "hsl(0, 0%, 100%)",
        },
        success: {
          DEFAULT: "hsl(145, 60%, 40%)",
          foreground: "hsl(0, 0%, 100%)",
        },
        warning: {
          DEFAULT: "hsl(45, 100%, 50%)",
          foreground: "hsl(0, 0%, 10%)",
        },
        error: {
          DEFAULT: "hsl(0, 80%, 50%)",
          foreground: "hsl(0, 0%, 100%)",
        },
        info: {
          DEFAULT: "hsl(210, 85%, 45%)",
          foreground: "hsl(0, 0%, 100%)",
        },
     muted: {
          DEFAULT: "hsl(0, 0%, 95%)",
          foreground: "hsl(0, 0%, 40%)",
        },
        destructive: {
          DEFAULT: "hsl(0, 80%, 50%)",
          foreground: "hsl(0, 0%, 100%)",
        },
        card: {
          DEFAULT: "hsl(0, 0%, 100%)",
          foreground: "hsl(222, 25%, 20%)",
        },
        popover: {
          DEFAULT: "hsl(0, 0%, 100%)",
          foreground: "hsl(222, 25%, 20%)",
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