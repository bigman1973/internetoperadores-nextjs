import localFont from 'next/font/local';

const body = localFont({
  src: [
    { path: './fonts/RobotoLatin.woff2', weight: '400', style: 'normal' },
    { path: './fonts/RobotoLatin.woff2', weight: '500', style: 'normal' },
    { path: './fonts/RobotoLatin.woff2', weight: '700', style: 'normal' },
  ],
  variable: '--io-f-body',
  display: 'swap',
});
const display = localFont({
  src: [
    { path: './fonts/RobotoCondensedLatin.woff2', weight: '500', style: 'normal' },
    { path: './fonts/RobotoCondensedLatin.woff2', weight: '700', style: 'normal' },
  ],
  variable: '--io-f-display',
  display: 'swap',
});
const mono = localFont({
  src: [
    { path: './fonts/RobotoMonoLatin.woff2', weight: '400', style: 'normal' },
    { path: './fonts/RobotoMonoLatin.woff2', weight: '500', style: 'normal' },
  ],
  variable: '--io-f-mono',
  display: 'swap',
});

/** Los mismos WOFF2 latinos del kit validado, incluidos en el repo; sin red en build ni navegador. */
export const ioFontClasses = `${body.variable} ${display.variable} ${mono.variable}`;
