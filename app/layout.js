import { Geist, Geist_Mono } from "next/font/google";
import RootRuntimeSurface from "../components/RootRuntimeSurface";
import { assistantPublicEnabled } from "../lib/asistente/public-flag";
import "./globals.css";

// These variables remain available to public pages. Conciliar uses its own
// self-hosted Roboto: do not compete with it by preloading unused global fonts.
const geistSans = Geist({ variable: "--font-geist-sans", subsets: ["latin"], display: "swap", preload: false });
const geistMono = Geist_Mono({ variable: "--font-geist-mono", subsets: ["latin"], display: "swap", preload: false });

export const metadata = {
  title: "Internet Operadores - Servicios IT, Seguridad y Telecomunicaciones",
  description: "Servicios IT profesionales: ciberseguridad, backups, telecomunicaciones. Informe Cero Riesgos por 790€. Más de 25 años de experiencia."
};

export default function RootLayout({ children }) {
  return (
    <html lang="es">
      <body className={`${geistSans.variable} ${geistMono.variable} antialiased`}>
        <RootRuntimeSurface assistantEnabled={assistantPublicEnabled()}>{children}</RootRuntimeSurface>
      </body>
    </html>
  );
}
