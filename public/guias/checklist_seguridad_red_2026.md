<style>
@page {
  size: A4;
  margin: 2.5cm 2cm 3cm 2cm;
}
@page :first {
  margin-top: 0;
}
body {
  font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;
  font-size: 11pt;
  line-height: 1.6;
  color: #333;
}
.page-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 15px 0;
  border-bottom: 2px solid #F97316;
  margin-bottom: 25px;
}
.page-header img {
  height: 45px;
  margin-left: 0;
  padding-left: 0;
  position: relative;
  left: -10px;
}
.page-header-right {
  text-align: right;
  font-size: 9pt;
  color: #555;
  line-height: 1.4;
}
.cover {
  text-align: center;
  padding-top: 80px;
  page-break-after: always;
}
.cover img {
  width: 280px;
  margin-bottom: 50px;
}
.cover h1 {
  font-size: 32pt;
  color: #F97316;
  margin-bottom: 15px;
  font-weight: 700;
  line-height: 1.2;
}
.cover h2 {
  font-size: 13pt;
  color: #555;
  font-weight: 400;
  font-style: italic;
  margin-bottom: 35px;
  padding: 0 60px;
  line-height: 1.6;
  border: none;
}
.cover-edition {
  font-size: 16pt;
  color: #F97316;
  font-weight: 600;
  margin-bottom: 60px;
}
.cover-ceo-box {
  margin-top: 50px;
  padding: 25px 40px;
  background: linear-gradient(135deg, #FFF7ED 0%, #FFEDD5 100%);
  border: 2px solid #F97316;
  border-radius: 10px;
  display: inline-block;
}
.cover-ceo-box p { margin: 5px 0; }
.cover-ceo-box .ceo-title { color: #F97316; font-weight: 600; font-size: 12pt; }
.cover-ceo-box .ceo-name { font-size: 14pt; font-weight: 600; color: #333; margin: 8px 0; }
.cover-ceo-box .ceo-phone { font-size: 18pt; font-weight: 700; color: #333; }
.toc-page { page-break-after: always; }
.toc-title {
  font-size: 24pt;
  color: #F97316;
  text-align: center;
  margin-bottom: 40px;
  padding-bottom: 15px;
  border-bottom: 3px solid #F97316;
}
.toc-list { list-style: none; padding: 0; margin: 0; }
.toc-item {
  display: flex;
  justify-content: space-between;
  align-items: baseline;
  padding: 12px 0;
  border-bottom: 1px dotted #ccc;
  font-size: 12pt;
}
.toc-chapter { color: #1F2937; font-weight: 600; }
.toc-intro { color: #F97316; font-weight: 600; }
.toc-page-num { color: #F97316; font-weight: 600; min-width: 30px; text-align: right; }
h1 {
  color: #F97316;
  font-size: 22pt;
  border-bottom: 3px solid #F97316;
  padding-bottom: 10px;
  margin-top: 35px;
  margin-bottom: 20px;
  page-break-after: avoid;
}
h2 {
  color: #1F2937;
  font-size: 14pt;
  margin-top: 25px;
  margin-bottom: 15px;
  border-left: 4px solid #F97316;
  padding-left: 12px;
  page-break-after: avoid;
}
h3 {
  color: #374151;
  font-size: 12pt;
  margin-top: 18px;
  margin-bottom: 10px;
  page-break-after: avoid;
}
p { text-align: justify; margin-bottom: 12px; }
ul, ol { margin-left: 20px; margin-bottom: 15px; }
li { margin-bottom: 6px; }
table { width: 100%; border-collapse: collapse; margin: 20px 0; font-size: 10pt; }
th {
  background: linear-gradient(135deg, #F97316 0%, #EA580C 100%);
  color: white;
  padding: 10px 12px;
  text-align: left;
  font-weight: 600;
}
td { padding: 8px 12px; border-bottom: 1px solid #E5E7EB; }
tr:nth-child(even) { background-color: #FFF7ED; }
.highlight-box {
  background: linear-gradient(135deg, #FFF7ED 0%, #FFEDD5 100%);
  border-left: 4px solid #F97316;
  padding: 15px 20px;
  margin: 20px 0;
  border-radius: 0 8px 8px 0;
}
.highlight-box strong { color: #F97316; }
.tip-box {
  background: #ECFDF5;
  border-left: 4px solid #10B981;
  padding: 12px 18px;
  margin: 18px 0;
  border-radius: 0 8px 8px 0;
}
.tip-box strong { color: #10B981; }
.warning-box {
  background: #FEF2F2;
  border-left: 4px solid #EF4444;
  padding: 12px 18px;
  margin: 18px 0;
  border-radius: 0 8px 8px 0;
}
.warning-box strong { color: #EF4444; }
.chapter-intro {
  font-size: 11pt;
  font-style: italic;
  color: #6B7280;
  margin-bottom: 20px;
  padding: 12px 15px;
  background: #F9FAFB;
  border-radius: 8px;
}
.checklist-box { background: #F9FAFB; padding: 15px 20px; border-radius: 8px; margin: 15px 0; }
.checklist-box ul { list-style: none; margin-left: 0; padding-left: 0; }
.checklist-box li { padding-left: 25px; position: relative; margin-bottom: 8px; }
.checklist-box li:before { content: "☐"; position: absolute; left: 0; color: #F97316; font-size: 12pt; }
.page-break { page-break-before: always; }
.footer-cta {
  background: linear-gradient(135deg, #F97316 0%, #EA580C 100%);
  color: white;
  padding: 25px 30px;
  border-radius: 10px;
  text-align: center;
  margin-top: 30px;
}
.footer-cta h3 { color: white; margin: 0 0 10px 0; font-size: 16pt; border: none; padding: 0; }
.footer-cta p { text-align: center; margin: 8px 0; }
.glossary-section dt { font-weight: bold; color: #F97316; margin-top: 12px; font-size: 11pt; }
.glossary-section dd { margin-left: 15px; margin-bottom: 8px; font-size: 10pt; }
.copyright {
  text-align: center; color: #666; font-size: 9pt; margin-top: 40px; padding-top: 20px; border-top: 1px solid #ddd;
}
</style>

<div class="cover">
  <img src="/home/ubuntu/internetoperadores-web/public/guias/logo-internetoperadores.png" alt="Internet Operadores">
  <h1>Checklist Esencial de<br>Seguridad de Red</h1>
  <h2>Guía práctica con los controles de seguridad imprescindibles para proteger la infraestructura de red de su empresa</h2>
  <p class="cover-edition">Edición 2026</p>
  <div class="cover-ceo-box">
    <p class="ceo-title">¿Tiene dudas? Hable directamente con el CEO</p>
    <p class="ceo-name">David Pérez</p>
    <p class="ceo-phone">WhatsApp: 655 100 400</p>
  </div>
</div>

<div class="page-header">
  <img src="/home/ubuntu/internetoperadores-web/public/guias/logo-internetoperadores.png" alt="Internet Operadores">
  <div class="page-header-right">
    <strong>Internet Operadores</strong><br>
    Paseo de la Habana, 26 · 28036 Madrid<br>
    Hablar con el CEO: 655 100 400
  </div>
</div>

<div class="toc-page">
<h1 class="toc-title">Índice de Contenidos</h1>
<ul class="toc-list">
  <li class="toc-item"><span class="toc-intro">Introducción — La seguridad de red como prioridad empresarial</span><span class="toc-page-num">3</span></li>
  <li class="toc-item"><span class="toc-chapter">Capítulo 1 — Gestión de Acceso y Contraseñas</span><span class="toc-page-num">5</span></li>
  <li class="toc-item"><span class="toc-chapter">Capítulo 2 — Seguridad del Perímetro de Red</span><span class="toc-page-num">7</span></li>
  <li class="toc-item"><span class="toc-chapter">Capítulo 3 — Protección de Endpoints y Servidores</span><span class="toc-page-num">9</span></li>
  <li class="toc-item"><span class="toc-chapter">Capítulo 4 — Gestión de Vulnerabilidades</span><span class="toc-page-num">11</span></li>
  <li class="toc-item"><span class="toc-chapter">Capítulo 5 — Copias de Seguridad y Recuperación</span><span class="toc-page-num">13</span></li>
  <li class="toc-item"><span class="toc-chapter">Capítulo 6 — Monitorización y Respuesta a Incidentes</span><span class="toc-page-num">15</span></li>
  <li class="toc-item"><span class="toc-chapter">Capítulo 7 — Formación y Concienciación</span><span class="toc-page-num">17</span></li>
  <li class="toc-item"><span class="toc-chapter">Checklist resumen ejecutivo</span><span class="toc-page-num">19</span></li>
</ul>
</div>

<div class="page-header">
  <img src="/home/ubuntu/internetoperadores-web/public/guias/logo-internetoperadores.png" alt="Internet Operadores">
  <div class="page-header-right">
    <strong>Internet Operadores</strong><br>
    Paseo de la Habana, 26 · 28036 Madrid<br>
    Hablar con el CEO: 655 100 400
  </div>
</div>

<h1>Introducción</h1>
<p class="chapter-intro">El 60% de las PYMEs que sufren un ciberataque grave cierran en los 6 meses siguientes. La seguridad de red ya no es opcional: es una cuestión de supervivencia empresarial.</p>

<p>Los ciberataques a empresas españolas han aumentado un 35% en el último año, con un coste medio por incidente de 105.000 € para las PYMEs. El ransomware, el phishing y las intrusiones en la red son las amenazas más frecuentes, y ninguna empresa está exenta de riesgo.</p>

<p>Este checklist le proporciona una guía práctica y accionable para evaluar y mejorar la seguridad de su infraestructura de red. Cada sección incluye controles específicos que puede implementar de forma progresiva.</p>

<div class="warning-box">
<strong>Alerta:</strong> Si su empresa maneja datos personales (clientes, empleados, pacientes), el RGPD le obliga a implementar medidas técnicas y organizativas adecuadas. El incumplimiento puede suponer multas de hasta el 4% de la facturación anual.
</div>

<div class="page-break"></div>

<div class="page-header">
  <img src="/home/ubuntu/internetoperadores-web/public/guias/logo-internetoperadores.png" alt="Internet Operadores">
  <div class="page-header-right">
    <strong>Internet Operadores</strong><br>
    Paseo de la Habana, 26 · 28036 Madrid<br>
    Hablar con el CEO: 655 100 400
  </div>
</div>

<h1>Capítulo 1 — Gestión de Acceso y Contraseñas</h1>
<p class="chapter-intro">El control de acceso es la primera línea de defensa. El 81% de las brechas de seguridad están relacionadas con contraseñas débiles o robadas.</p>

<div class="checklist-box">
<ul>
<li>Política de contraseñas robustas (mínimo 12 caracteres, combinando mayúsculas, minúsculas, números y símbolos)</li>
<li>Autenticación multifactor (MFA) activada en todos los accesos críticos</li>
<li>Cambio obligatorio de contraseñas cada 90 días</li>
<li>Bloqueo automático de cuentas tras 5 intentos fallidos</li>
<li>Eliminación inmediata de accesos de empleados que causan baja</li>
<li>Principio de mínimo privilegio: cada usuario solo accede a lo que necesita</li>
<li>Registro y auditoría de todos los accesos a sistemas críticos</li>
<li>Uso de gestor de contraseñas corporativo (LastPass, 1Password, Bitwarden)</li>
<li>Prohibición de compartir credenciales entre empleados</li>
<li>Revisión trimestral de permisos y accesos</li>
</ul>
</div>

<div class="tip-box">
<strong>Recomendación:</strong> Implemente un sistema de Single Sign-On (SSO) para centralizar la autenticación y reducir el número de contraseñas que sus empleados deben gestionar.
</div>

<div class="page-break"></div>

<div class="page-header">
  <img src="/home/ubuntu/internetoperadores-web/public/guias/logo-internetoperadores.png" alt="Internet Operadores">
  <div class="page-header-right">
    <strong>Internet Operadores</strong><br>
    Paseo de la Habana, 26 · 28036 Madrid<br>
    Hablar con el CEO: 655 100 400
  </div>
</div>

<h1>Capítulo 2 — Seguridad del Perímetro de Red</h1>
<p class="chapter-intro">El perímetro de red es la frontera entre su red interna y el mundo exterior. Un perímetro mal configurado es una puerta abierta para los atacantes.</p>

<div class="checklist-box">
<ul>
<li>Firewall de nueva generación (NGFW) instalado y configurado</li>
<li>Reglas de firewall revisadas y actualizadas (eliminar reglas obsoletas)</li>
<li>Sistema de detección/prevención de intrusiones (IDS/IPS) activo</li>
<li>Segmentación de red: separar redes de producción, invitados y IoT</li>
<li>VPN corporativa para acceso remoto de empleados</li>
<li>Filtrado de contenido web para bloquear sitios maliciosos</li>
<li>Protección anti-DDoS configurada</li>
<li>DMZ configurada para servicios expuestos a internet</li>
<li>Puertos no utilizados cerrados en el firewall</li>
<li>Logs del firewall monitorizados y almacenados (mínimo 12 meses)</li>
</ul>
</div>

<table>
<tr><th>Tipo de firewall</th><th>Protección</th><th>Ideal para</th></tr>
<tr><td>Firewall básico (stateful)</td><td>Filtrado de paquetes por IP/puerto</td><td>Microempresas (1-5 empleados)</td></tr>
<tr><td>UTM (Unified Threat Management)</td><td>Firewall + antivirus + IPS + VPN</td><td>PYMEs (5-50 empleados)</td></tr>
<tr><td>NGFW (Next-Generation Firewall)</td><td>UTM + inspección SSL + control de aplicaciones</td><td>Empresas medianas (50-500)</td></tr>
<tr><td>Firewall cloud / SASE</td><td>Seguridad perimetral cloud + SD-WAN</td><td>Empresas distribuidas multi-sede</td></tr>
</table>

<div class="page-break"></div>

<div class="page-header">
  <img src="/home/ubuntu/internetoperadores-web/public/guias/logo-internetoperadores.png" alt="Internet Operadores">
  <div class="page-header-right">
    <strong>Internet Operadores</strong><br>
    Paseo de la Habana, 26 · 28036 Madrid<br>
    Hablar con el CEO: 655 100 400
  </div>
</div>

<h1>Capítulo 3 — Protección de Endpoints y Servidores</h1>
<p class="chapter-intro">Cada dispositivo conectado a su red es un potencial punto de entrada para los atacantes.</p>

<div class="checklist-box">
<ul>
<li>Antivirus/EDR empresarial instalado en todos los equipos</li>
<li>Sistema operativo actualizado con los últimos parches de seguridad</li>
<li>Cifrado de disco completo en portátiles y dispositivos móviles</li>
<li>Control de dispositivos USB (bloqueo o restricción)</li>
<li>Política de BYOD (Bring Your Own Device) definida y aplicada</li>
<li>Gestión centralizada de dispositivos móviles (MDM)</li>
<li>Servidores con hardening aplicado (servicios innecesarios desactivados)</li>
<li>Acceso a servidores solo mediante VPN o red interna</li>
<li>Monitorización de procesos y conexiones sospechosas</li>
<li>Inventario actualizado de todos los dispositivos de la red</li>
</ul>
</div>

<div class="highlight-box">
<strong>Internet Operadores recomienda:</strong> Implemente una solución EDR (Endpoint Detection and Response) en lugar de un antivirus tradicional. Las soluciones EDR detectan amenazas avanzadas que los antivirus convencionales no pueden identificar.
</div>

<div class="page-break"></div>

<div class="page-header">
  <img src="/home/ubuntu/internetoperadores-web/public/guias/logo-internetoperadores.png" alt="Internet Operadores">
  <div class="page-header-right">
    <strong>Internet Operadores</strong><br>
    Paseo de la Habana, 26 · 28036 Madrid<br>
    Hablar con el CEO: 655 100 400
  </div>
</div>

<h1>Capítulo 4 — Gestión de Vulnerabilidades</h1>
<p class="chapter-intro">Las vulnerabilidades no parcheadas son la causa del 60% de las brechas de seguridad. Un programa de gestión de vulnerabilidades es esencial.</p>

<div class="checklist-box">
<ul>
<li>Escaneo de vulnerabilidades trimestral (mínimo)</li>
<li>Parches de seguridad críticos aplicados en menos de 48 horas</li>
<li>Actualizaciones de firmware de routers, switches y APs al día</li>
<li>Software no soportado identificado y planificada su sustitución</li>
<li>Test de penetración anual realizado por empresa externa</li>
<li>Proceso documentado de gestión de parches</li>
<li>Inventario de software con versiones actualizadas</li>
</ul>
</div>

<h2>Priorización de vulnerabilidades</h2>
<table>
<tr><th>Severidad CVSS</th><th>Nivel</th><th>Plazo de parcheo</th><th>Ejemplo</th></tr>
<tr><td>9.0 - 10.0</td><td>Crítica</td><td>24-48 horas</td><td>Ejecución remota de código sin autenticación</td></tr>
<tr><td>7.0 - 8.9</td><td>Alta</td><td>1 semana</td><td>Escalada de privilegios local</td></tr>
<tr><td>4.0 - 6.9</td><td>Media</td><td>1 mes</td><td>Divulgación de información</td></tr>
<tr><td>0.1 - 3.9</td><td>Baja</td><td>Próximo ciclo de mantenimiento</td><td>Denegación de servicio local</td></tr>
</table>

<div class="page-break"></div>

<div class="page-header">
  <img src="/home/ubuntu/internetoperadores-web/public/guias/logo-internetoperadores.png" alt="Internet Operadores">
  <div class="page-header-right">
    <strong>Internet Operadores</strong><br>
    Paseo de la Habana, 26 · 28036 Madrid<br>
    Hablar con el CEO: 655 100 400
  </div>
</div>

<h1>Capítulo 5 — Copias de Seguridad y Recuperación</h1>
<p class="chapter-intro">La regla 3-2-1: 3 copias de sus datos, en 2 soportes diferentes, con 1 copia fuera de sus instalaciones.</p>

<div class="checklist-box">
<ul>
<li>Política de backup documentada y aplicada</li>
<li>Backups automáticos diarios de datos críticos</li>
<li>Al menos una copia offsite o en la nube</li>
<li>Backups cifrados en tránsito y en reposo</li>
<li>Pruebas de restauración mensuales documentadas</li>
<li>RPO (Recovery Point Objective) definido para cada sistema</li>
<li>RTO (Recovery Time Objective) definido y probado</li>
<li>Plan de recuperación ante desastres (DRP) documentado</li>
<li>Backups protegidos contra ransomware (inmutables)</li>
<li>Retención de backups según requisitos legales (mínimo 5 años para datos fiscales)</li>
</ul>
</div>

<div class="highlight-box">
<strong>Solución ExaGrid:</strong> Internet Operadores ofrece ExaGrid como solución de backup empresarial con deduplicación, retención a largo plazo y protección anti-ransomware integrada. Consulte nuestra guía específica de ExaGrid para más información.
</div>

<div class="page-break"></div>

<div class="page-header">
  <img src="/home/ubuntu/internetoperadores-web/public/guias/logo-internetoperadores.png" alt="Internet Operadores">
  <div class="page-header-right">
    <strong>Internet Operadores</strong><br>
    Paseo de la Habana, 26 · 28036 Madrid<br>
    Hablar con el CEO: 655 100 400
  </div>
</div>

<h1>Capítulo 6 — Monitorización y Respuesta a Incidentes</h1>
<p class="chapter-intro">Detectar una amenaza a tiempo puede marcar la diferencia entre un incidente menor y una catástrofe empresarial.</p>

<div class="checklist-box">
<ul>
<li>Sistema de monitorización de red activo 24/7</li>
<li>Alertas configuradas para eventos de seguridad críticos</li>
<li>Logs centralizados en un SIEM o sistema equivalente</li>
<li>Plan de respuesta a incidentes documentado</li>
<li>Equipo de respuesta a incidentes identificado con roles claros</li>
<li>Procedimiento de notificación a la AEPD en caso de brecha de datos (72 horas)</li>
<li>Contacto de empresa de respuesta a incidentes externa</li>
<li>Simulacros de incidentes realizados al menos una vez al año</li>
</ul>
</div>

<div class="page-break"></div>

<div class="page-header">
  <img src="/home/ubuntu/internetoperadores-web/public/guias/logo-internetoperadores.png" alt="Internet Operadores">
  <div class="page-header-right">
    <strong>Internet Operadores</strong><br>
    Paseo de la Habana, 26 · 28036 Madrid<br>
    Hablar con el CEO: 655 100 400
  </div>
</div>

<h1>Capítulo 7 — Formación y Concienciación</h1>
<p class="chapter-intro">El eslabón más débil de la cadena de seguridad es el factor humano. El 95% de los incidentes de seguridad involucran un error humano.</p>

<div class="checklist-box">
<ul>
<li>Formación en ciberseguridad para todos los empleados (al menos anual)</li>
<li>Simulacros de phishing periódicos</li>
<li>Política de uso aceptable de recursos IT firmada por todos los empleados</li>
<li>Protocolo claro para reportar emails o actividad sospechosa</li>
<li>Formación específica para personal con acceso privilegiado</li>
<li>Material de concienciación visible (pósters, emails periódicos)</li>
</ul>
</div>

<div class="page-break"></div>

<div class="page-header">
  <img src="/home/ubuntu/internetoperadores-web/public/guias/logo-internetoperadores.png" alt="Internet Operadores">
  <div class="page-header-right">
    <strong>Internet Operadores</strong><br>
    Paseo de la Habana, 26 · 28036 Madrid<br>
    Hablar con el CEO: 655 100 400
  </div>
</div>

<h1>Checklist Resumen Ejecutivo</h1>

<table>
<tr><th>Área</th><th>Controles clave</th><th>Estado</th></tr>
<tr><td><strong>Acceso y contraseñas</strong></td><td>MFA activado, política de contraseñas, mínimo privilegio</td><td>☐</td></tr>
<tr><td><strong>Perímetro de red</strong></td><td>NGFW configurado, VPN, segmentación, IDS/IPS</td><td>☐</td></tr>
<tr><td><strong>Endpoints</strong></td><td>EDR instalado, cifrado de disco, MDM, inventario</td><td>☐</td></tr>
<tr><td><strong>Vulnerabilidades</strong></td><td>Escaneo trimestral, parches < 48h, pentest anual</td><td>☐</td></tr>
<tr><td><strong>Backup</strong></td><td>Regla 3-2-1, pruebas mensuales, DRP documentado</td><td>☐</td></tr>
<tr><td><strong>Monitorización</strong></td><td>SIEM, alertas 24/7, plan de respuesta a incidentes</td><td>☐</td></tr>
<tr><td><strong>Formación</strong></td><td>Formación anual, simulacros phishing, política de uso</td><td>☐</td></tr>
</table>

<div class="tip-box">
<strong>¿Necesita ayuda?</strong> Internet Operadores ofrece auditorías de seguridad gratuitas para evaluar el estado de su infraestructura y proponer un plan de mejora adaptado a su presupuesto.
</div>

<div class="footer-cta">
  <h3>¿Necesita ayuda con su proyecto?</h3>
  <p>Nuestro equipo de expertos está a su disposición para asesorarle sin compromiso.</p>
  <p><strong>Llame al 900 XXX XXX · WhatsApp: 655 100 400 · comercial@internetoperadores.com</strong></p>
</div>
<div class="copyright">
  <p>© 2026 Internet Operadores. Todos los derechos reservados.</p>
  <p>Este documento es propiedad de Internet Operadores. Queda prohibida su reproducción sin autorización.</p>
</div>
