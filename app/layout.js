import { Geist, Geist_Mono } from "next/font/google";
import Script from "next/script";
import SessionProvider from "../components/SessionProvider";
import { CartProvider } from "../components/CartProvider";
import SegmentProvider from "../components/SegmentProvider";
import NewsletterFloat from "../components/public/NewsletterFloat";
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
  description: "Servicios IT profesionales: ciberseguridad, backups, telecomunicaciones. Informe Cero Riesgos por 790€. Más de 25 años de experiencia."
};

export default function RootLayout({ children }) {
  return (
    <html lang="es">
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
        <SessionProvider>
          <SegmentProvider>
            <CartProvider>
              {children}
              <NewsletterFloat />
            </CartProvider>
          </SegmentProvider>
        </SessionProvider>
      </body>
    </html>
  );
}
