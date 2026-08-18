/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  darkMode: 'class',
  theme: {
    extend: {
      colors: {
        primary: {
          50: '#eef6ff',
          100: '#d9eaff',
          200: '#bcdaff',
          300: '#8ec1ff',
          400: '#599cff',
          500: '#3478f6',
          600: '#235add',
          700: '#1c47b3',
          800: '#1c3e8f',
          900: '#1d3773',
        },
        git: {
          add: '#16a34a',
          modify: '#ca8a04',
          delete: '#dc2626',
          rename: '#9333ea',
        },
      },
      fontFamily: {
        mono: ['"JetBrains Mono"', '"Cascadia Code"', 'Consolas', 'monospace'],
      },
    },
  },
  plugins: [],
};
