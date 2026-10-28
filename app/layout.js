import RootRuntimeSurface from "../components/RootRuntimeSurface";
import { assistantPublicEnabled } from "../lib/asistente/public-flag";
import "./globals.css";

export const metadata = {
  title: "Internet Operadores - Servicios IT, Seguridad y Telecomunicaciones",
  description: "Servicios IT profesionales: ciberseguridad, backups, telecomunicaciones. Informe Cero Riesgos por 790€. Más de 25 años de experiencia."
};

export default function RootLayout({ children }) {
  return (
    <html lang="es">
      <body className="antialiased">
        <RootRuntimeSurface assistantEnabled={assistantPublicEnabled()}>{children}</RootRuntimeSurface>
      </body>
    </html>
  );
}
