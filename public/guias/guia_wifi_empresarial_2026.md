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
  <h1>Manual de WiFi<br>para Empresas</h1>
  <h2>Guía completa para diseñar, implementar y gestionar redes WiFi empresariales de alto rendimiento</h2>
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
  <li class="toc-item"><span class="toc-intro">Introducción — WiFi como infraestructura crítica</span><span class="toc-page-num">3</span></li>
  <li class="toc-item"><span class="toc-chapter">Capítulo 1 — Fundamentos de WiFi empresarial</span><span class="toc-page-num">5</span></li>
  <li class="toc-item"><span class="toc-chapter">Capítulo 2 — Planificación y diseño de cobertura</span><span class="toc-page-num">7</span></li>
  <li class="toc-item"><span class="toc-chapter">Capítulo 3 — WiFi 6 y WiFi 7: La nueva generación</span><span class="toc-page-num">9</span></li>
  <li class="toc-item"><span class="toc-chapter">Capítulo 4 — Seguridad WiFi empresarial</span><span class="toc-page-num">11</span></li>
  <li class="toc-item"><span class="toc-chapter">Capítulo 5 — WiFi para hostelería y retail</span><span class="toc-page-num">13</span></li>
  <li class="toc-item"><span class="toc-chapter">Capítulo 6 — Gestión y monitorización</span><span class="toc-page-num">15</span></li>
  <li class="toc-item"><span class="toc-chapter">Glosario de términos</span><span class="toc-page-num">17</span></li>
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
<p class="chapter-intro">El WiFi ha pasado de ser un servicio complementario a convertirse en la columna vertebral de la conectividad empresarial. Una red WiFi mal diseñada puede paralizar su negocio.</p>

<p>En la empresa moderna, el WiFi es tan esencial como la electricidad. Portátiles, smartphones, tablets, impresoras, cámaras de seguridad, sensores IoT... todos dependen de una conexión inalámbrica fiable y de alto rendimiento.</p>

<p>Sin embargo, diseñar una red WiFi empresarial es muy diferente a instalar un router doméstico. Requiere planificación, equipamiento profesional y una configuración adecuada para garantizar cobertura, rendimiento y seguridad.</p>

<div class="highlight-box">
<strong>Dato clave:</strong> El 73% de los problemas de rendimiento en redes empresariales están relacionados con una mala planificación del WiFi. Un diseño profesional puede mejorar el rendimiento un 300% con la misma inversión en hardware.
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

<h1>Capítulo 1 — Fundamentos de WiFi empresarial</h1>
<p class="chapter-intro">Antes de diseñar su red WiFi, es fundamental entender los conceptos básicos que determinan su rendimiento.</p>

<h2>Estándares WiFi actuales</h2>
<table>
<tr><th>Estándar</th><th>Nombre comercial</th><th>Velocidad máxima</th><th>Frecuencias</th><th>Año</th></tr>
<tr><td>802.11ac</td><td>WiFi 5</td><td>3,5 Gbps</td><td>5 GHz</td><td>2014</td></tr>
<tr><td>802.11ax</td><td>WiFi 6</td><td>9,6 Gbps</td><td>2,4 + 5 GHz</td><td>2020</td></tr>
<tr><td>802.11ax</td><td>WiFi 6E</td><td>9,6 Gbps</td><td>2,4 + 5 + 6 GHz</td><td>2021</td></tr>
<tr><td>802.11be</td><td>WiFi 7</td><td>46 Gbps</td><td>2,4 + 5 + 6 GHz</td><td>2024</td></tr>
</table>

<h2>Diferencias entre WiFi doméstico y empresarial</h2>
<table>
<tr><th>Característica</th><th>WiFi doméstico</th><th>WiFi empresarial</th></tr>
<tr><td>Usuarios simultáneos</td><td>5-10</td><td>50-500+</td></tr>
<tr><td>Puntos de acceso</td><td>1 router</td><td>Múltiples APs gestionados</td></tr>
<tr><td>Gestión</td><td>Individual</td><td>Centralizada (controlador)</td></tr>
<tr><td>Seguridad</td><td>WPA2/WPA3 Personal</td><td>WPA3 Enterprise + 802.1X</td></tr>
<tr><td>Roaming</td><td>No</td><td>Seamless (802.11r/k/v)</td></tr>
<tr><td>Portal cautivo</td><td>No</td><td>Sí (para invitados)</td></tr>
<tr><td>Garantía</td><td>1-2 años</td><td>3-5 años + soporte</td></tr>
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

<h1>Capítulo 2 — Planificación y diseño de cobertura</h1>
<p class="chapter-intro">Un buen diseño WiFi empieza por un estudio de cobertura (site survey) que analiza las características físicas del espacio.</p>

<h2>Proceso de diseño</h2>
<ol>
<li><strong>Site survey:</strong> Análisis del espacio físico, materiales de construcción, fuentes de interferencia y requisitos de cobertura.</li>
<li><strong>Diseño de cobertura:</strong> Ubicación óptima de los puntos de acceso, selección de canales y potencia de transmisión.</li>
<li><strong>Dimensionamiento:</strong> Cálculo del número de APs necesarios según usuarios simultáneos y aplicaciones.</li>
<li><strong>Validación:</strong> Verificación post-instalación con mediciones reales de cobertura y rendimiento.</li>
</ol>

<h2>Reglas de dimensionamiento</h2>
<table>
<tr><th>Tipo de espacio</th><th>Usuarios por AP</th><th>Cobertura por AP</th><th>Consideraciones</th></tr>
<tr><td>Oficina abierta</td><td>25-30</td><td>150-200 m²</td><td>Alta densidad, muchos dispositivos</td></tr>
<tr><td>Despachos individuales</td><td>5-10</td><td>100-150 m²</td><td>Paredes que atenúan la señal</td></tr>
<tr><td>Almacén / Nave</td><td>10-15</td><td>300-500 m²</td><td>Espacio abierto, estanterías metálicas</td></tr>
<tr><td>Hotel (habitaciones)</td><td>2-3 por habitación</td><td>4-6 habitaciones por AP</td><td>Paredes gruesas, alta expectativa de calidad</td></tr>
<tr><td>Restaurante / Cafetería</td><td>30-50</td><td>100-150 m²</td><td>Alta densidad temporal, portal cautivo</td></tr>
</table>

<div class="tip-box">
<strong>Internet Operadores ofrece:</strong> Site survey profesional gratuito con mapa de calor de cobertura y propuesta de diseño optimizada para su espacio.
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

<h1>Capítulo 3 — WiFi 6 y WiFi 7</h1>
<p class="chapter-intro">Las nuevas generaciones de WiFi están diseñadas para entornos de alta densidad y aplicaciones exigentes como videoconferencia y IoT.</p>

<h2>Ventajas de WiFi 6 (802.11ax)</h2>
<ul>
<li><strong>OFDMA:</strong> Permite servir a múltiples dispositivos simultáneamente en el mismo canal, ideal para entornos densos.</li>
<li><strong>MU-MIMO mejorado:</strong> Comunicación simultánea con hasta 8 dispositivos (vs 4 en WiFi 5).</li>
<li><strong>Target Wake Time (TWT):</strong> Reduce el consumo de batería de dispositivos IoT hasta un 70%.</li>
<li><strong>BSS Coloring:</strong> Reduce la interferencia entre APs vecinos en entornos de alta densidad.</li>
<li><strong>WPA3:</strong> Seguridad mejorada con cifrado individualizado por dispositivo.</li>
</ul>

<h2>WiFi 7: El futuro ya está aquí</h2>
<p>WiFi 7 (802.11be) multiplica por 4 la velocidad de WiFi 6 y añade capacidades revolucionarias:</p>
<ul>
<li><strong>MLO (Multi-Link Operation):</strong> Usa simultáneamente las bandas 2,4, 5 y 6 GHz para máximo rendimiento.</li>
<li><strong>Canales de 320 MHz:</strong> El doble de ancho de canal que WiFi 6, duplicando la velocidad.</li>
<li><strong>4K-QAM:</strong> Mayor eficiencia de modulación para más datos por transmisión.</li>
<li><strong>Latencia ultra-baja:</strong> Ideal para aplicaciones en tiempo real (VoIP, vídeo, IoT industrial).</li>
</ul>

<div class="highlight-box">
<strong>¿Merece la pena WiFi 7?</strong> Si está renovando su infraestructura WiFi en 2026, invierta en WiFi 7. Los puntos de acceso WiFi 7 son retrocompatibles con todos los dispositivos WiFi anteriores, por lo que protege su inversión a largo plazo.
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

<h1>Capítulo 4 — Seguridad WiFi empresarial</h1>
<p class="chapter-intro">Una red WiFi sin seguridad adecuada es una invitación abierta para los atacantes. La seguridad WiFi va mucho más allá de poner una contraseña.</p>

<h2>Medidas de seguridad esenciales</h2>
<div class="checklist-box">
<ul>
<li>WPA3 Enterprise con autenticación 802.1X (RADIUS)</li>
<li>Red de invitados separada y aislada de la red corporativa</li>
<li>Segmentación por VLAN (corporativa, invitados, IoT, CCTV)</li>
<li>Portal cautivo para acceso de invitados con registro</li>
<li>Detección de puntos de acceso no autorizados (rogue AP detection)</li>
<li>Cifrado de tráfico entre APs y controlador</li>
<li>Desactivación de WPS y protocolos obsoletos (WEP, WPA)</li>
<li>Cambio periódico de contraseñas de redes compartidas</li>
<li>Monitorización de dispositivos conectados</li>
<li>Logs de acceso WiFi almacenados (requisito legal en hostelería)</li>
</ul>
</div>

<div class="warning-box">
<strong>Obligación legal:</strong> En España, los establecimientos que ofrecen WiFi público (hoteles, restaurantes, cafeterías) están obligados a conservar los logs de conexión durante 12 meses según la Ley de Conservación de Datos.
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

<h1>Capítulo 5 — WiFi para hostelería y retail</h1>
<p class="chapter-intro">El WiFi en hostelería y retail no es solo conectividad: es una herramienta de marketing, fidelización y análisis de clientes.</p>

<h2>Portal cautivo inteligente</h2>
<p>El portal cautivo es la página que aparece cuando un cliente se conecta a su WiFi. Más allá de dar acceso a internet, puede utilizarse para:</p>
<ul>
<li>Captar datos de contacto (email, teléfono) para campañas de marketing</li>
<li>Mostrar promociones y ofertas especiales</li>
<li>Ofrecer login social (Facebook, Google) para conocer el perfil del cliente</li>
<li>Encuestas de satisfacción automáticas</li>
<li>Programa de fidelización integrado</li>
</ul>

<h2>Analíticas WiFi</h2>
<p>Los puntos de acceso empresariales pueden proporcionar datos valiosos sobre el comportamiento de sus clientes:</p>
<table>
<tr><th>Métrica</th><th>Utilidad</th></tr>
<tr><td>Afluencia por horas/días</td><td>Optimizar horarios de personal y promociones</td></tr>
<tr><td>Tiempo de permanencia</td><td>Medir el engagement del cliente</td></tr>
<tr><td>Tasa de retorno</td><td>Identificar clientes recurrentes vs nuevos</td></tr>
<tr><td>Zonas calientes (heatmap)</td><td>Optimizar la distribución del espacio</td></tr>
<tr><td>Tasa de conversión WiFi</td><td>% de visitantes que se conectan al WiFi</td></tr>
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

<h1>Capítulo 6 — Gestión y monitorización</h1>
<p class="chapter-intro">Una red WiFi empresarial requiere gestión centralizada y monitorización continua para mantener su rendimiento óptimo.</p>

<h2>Gestión centralizada (Cloud vs On-premise)</h2>
<table>
<tr><th>Característica</th><th>Controlador Cloud</th><th>Controlador On-premise</th></tr>
<tr><td>Gestión</td><td>Desde cualquier lugar via web</td><td>Solo desde la red local</td></tr>
<tr><td>Actualizaciones</td><td>Automáticas</td><td>Manuales</td></tr>
<tr><td>Coste</td><td>Suscripción mensual</td><td>Licencia única + mantenimiento</td></tr>
<tr><td>Escalabilidad</td><td>Ilimitada</td><td>Limitada por hardware</td></tr>
<tr><td>Multi-sede</td><td>Nativo</td><td>Requiere VPN</td></tr>
</table>

<h2>Métricas clave a monitorizar</h2>
<ul>
<li><strong>Utilización de canal:</strong> Si supera el 60%, es necesario añadir APs o redistribuir canales.</li>
<li><strong>Nivel de señal (RSSI):</strong> Mínimo -67 dBm para VoIP, -70 dBm para datos generales.</li>
<li><strong>Tasa de errores:</strong> Retransmisiones superiores al 10% indican problemas de cobertura o interferencia.</li>
<li><strong>Clientes por AP:</strong> Si supera los 30-40 clientes activos, considere añadir capacidad.</li>
<li><strong>Disponibilidad:</strong> Objetivo mínimo del 99,9% (menos de 8,7 horas de caída al año).</li>
</ul>

<div class="tip-box">
<strong>Internet Operadores incluye:</strong> Monitorización 24/7 de su red WiFi con alertas proactivas, informes mensuales de rendimiento y soporte técnico remoto incluido en todos nuestros planes de WiFi gestionado.
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

<h1>Glosario de términos</h1>

<dl class="glossary-section">
<dt>AP (Access Point)</dt>
<dd>Punto de acceso inalámbrico que permite a los dispositivos conectarse a la red WiFi.</dd>
<dt>SSID</dt>
<dd>Service Set Identifier. El nombre de la red WiFi visible para los usuarios.</dd>
<dt>VLAN</dt>
<dd>Virtual Local Area Network. Red virtual que permite segmentar el tráfico de forma lógica.</dd>
<dt>802.1X</dt>
<dd>Estándar de autenticación de red que requiere credenciales individuales para cada usuario.</dd>
<dt>RADIUS</dt>
<dd>Remote Authentication Dial-In User Service. Servidor de autenticación centralizado.</dd>
<dt>Roaming</dt>
<dd>Capacidad de un dispositivo de cambiar de AP sin perder la conexión.</dd>
<dt>Site Survey</dt>
<dd>Estudio de cobertura que analiza el espacio físico para diseñar la red WiFi óptima.</dd>
<dt>PoE</dt>
<dd>Power over Ethernet. Tecnología que alimenta los APs a través del cable de red, sin necesidad de enchufe eléctrico.</dd>
<dt>OFDMA</dt>
<dd>Orthogonal Frequency Division Multiple Access. Tecnología de WiFi 6 que permite servir a múltiples dispositivos simultáneamente.</dd>
<dt>MLO</dt>
<dd>Multi-Link Operation. Tecnología de WiFi 7 que permite usar múltiples bandas de frecuencia simultáneamente.</dd>
</dl>

<div class="footer-cta">
  <h3>¿Necesita ayuda con su proyecto?</h3>
  <p>Nuestro equipo de expertos está a su disposición para asesorarle sin compromiso.</p>
  <p><strong>Llame al 900 XXX XXX · WhatsApp: 655 100 400 · comercial@internetoperadores.com</strong></p>
</div>
<div class="copyright">
  <p>© 2026 Internet Operadores. Todos los derechos reservados.</p>
  <p>Este documento es propiedad de Internet Operadores. Queda prohibida su reproducción sin autorización.</p>
</div>
