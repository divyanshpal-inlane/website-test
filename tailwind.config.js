/** @type {import('tailwindcss').Config} */
import aspectRatio from '@tailwindcss/aspect-ratio';
export default {
  content: ["./index.html", "./src/**/*.{js,ts,jsx,tsx}"],
  theme: {
    extend: {
      fontFamily: {
        'grotesque': ['Bricolage Grotesque', 'sans-serif'],
        'glancyr': ['glancyr', 'sans-serif'],
      },
      aspectRatio: {
        '1': '1',
        "w-16": 16,
        "h-9": 9,
      },
      screens: {
        "xs": "420px",
      },
    },
  },
  plugins: [aspectRatio],
};