/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ['./src/**/*.{js,ts,jsx,tsx,mdx}'],
  theme: {
    extend: {
      colors: {
        bg:       '#0C2B1A',
        bg2:      '#0F3320',
        bg3:      '#1A4028',
        card:     '#1E4C30',
        gold:     '#F5A623',
        'gold-lt':'rgba(245,166,35,0.18)',
        green:    '#2ECC7A',
        'green-lt':'rgba(46,204,122,0.18)',
        red:      '#FF6B6B',
        'red-lt': 'rgba(255,107,107,0.15)',
        offwhite: '#E8F5EE',
        muted:    '#A8C4B0',
      },
      fontFamily: {
        sans: ['DM Sans', 'system-ui', 'sans-serif'],
      },
      borderRadius: {
        xl2: '18px',
      },
    },
  },
  plugins: [],
}
