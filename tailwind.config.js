/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    './app/**/*.{js,ts,jsx,tsx,mdx}',
    './components/**/*.{js,ts,jsx,tsx,mdx}',
  ],
  theme: {
    extend: {
      colors: {
        ink: '#16233A',
        paper: '#FBFAF6',
        ledger: {
          DEFAULT: '#1F6F54',
          dark: '#164F3C',
        },
        rule: '#D9D5C4',
        slate: {
          ink: '#5B6472',
        },
        amber: '#C97A2B',
        danger: '#B3452C',
        canvas: '#F2F1EC',
      },
      fontFamily: {
        display: ['var(--font-display)', 'sans-serif'],
        body: ['var(--font-body)', 'sans-serif'],
        mono: ['var(--font-mono)', 'monospace'],
      },
      keyframes: {
        pulseHighlight: {
          '0%': { backgroundColor: 'rgba(31,111,84,0.22)' },
          '100%': { backgroundColor: 'rgba(31,111,84,0)' },
        },
        micPulse: {
          '0%, 100%': { transform: 'scale(1)', opacity: '0.55' },
          '50%': { transform: 'scale(1.35)', opacity: '0' },
        },
      },
      animation: {
        'pulse-highlight': 'pulseHighlight 1.4s ease-out',
        'mic-pulse': 'micPulse 1.6s ease-out infinite',
      },
    },
  },
  plugins: [],
};
