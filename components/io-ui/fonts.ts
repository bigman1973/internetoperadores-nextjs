import { Roboto, Roboto_Condensed, Roboto_Mono } from 'next/font/google';

const body = Roboto({ subsets: ['latin'], weight: ['400', '500', '700'], variable: '--io-f-body', display: 'swap' });
const display = Roboto_Condensed({ subsets: ['latin'], weight: ['500', '700'], variable: '--io-f-display', display: 'swap' });
const mono = Roboto_Mono({ subsets: ['latin'], weight: ['400', '500'], variable: '--io-f-mono', display: 'swap' });

/** Clases que cargan las tres fuentes del simulador (se autoalojan en el build; no hay peticiones a Google desde el navegador). */
export const ioFontClasses = `${body.variable} ${display.variable} ${mono.variable}`;
