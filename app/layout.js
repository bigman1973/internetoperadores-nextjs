import { Geist, Geist_Mono } from "next/font/google";
import Script from "next/script";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata = {
  title: "Internet Operadores - Servicios IT, Seguridad y Telecomunicaciones",
  description: "Servicios IT profesionales: ciberseguridad, backups, telecomunicaciones. Informe Cero Riesgos por 790€. Más de 25 años de experiencia.",
  other: {
    'Cache-Control': 'no-cache, no-store, must-revalidate',
    'Pragma': 'no-cache',
    'Expires': '0'
  }
};

export default function RootLayout({ children }) {
  return (
    <html lang="es">
      <head>
        <meta httpEquiv="Cache-Control" content="no-cache, no-store, must-revalidate" />
        <meta httpEquiv="Pragma" content="no-cache" />
        <meta httpEquiv="Expires" content="0" />
      </head>
      <body
        className={`${geistSans.variable} ${geistMono.variable} antialiased`}
      >
        {/* Cookiebot script cargado de forma asíncrona */}
        <Script
          id="Cookiebot"
          src="https://consent.cookiebot.com/uc.js"
          data-cbid="1621b6e2-0bdc-4d8d-8995-ed4e9db62ee5"
          data-blockingmode="auto"
          strategy="beforeInteractive"
        />
        {children}
      </body>
    </html>
  );
}

