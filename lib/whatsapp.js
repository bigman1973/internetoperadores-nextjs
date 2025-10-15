/**
 * Genera un enlace de WhatsApp con un mensaje pre-formateado
 * @param {string} phoneNumber - Número de teléfono en formato internacional (ej: 34655100400)
 * @param {object} data - Datos para incluir en el mensaje
 * @returns {string} URL de WhatsApp
 */
export function generateWhatsAppLink(phoneNumber, data) {
  const {
    customerName = '',
    customerEmail = '',
    customerCompany = '',
    customerPhone = '',
    numSedes = 1,
    sedes = [],
    subtotal = 0,
    iva = 0,
    total = 0,
    paymentType = 'one-time'
  } = data;

  // Construir el mensaje
  let message = `Hola, me gustaría solicitar el Informe Cero Riesgos.\n\n`;
  message += `📋 *Datos de contacto:*\n`;
  message += `• Nombre: ${customerName}\n`;
  message += `• Email: ${customerEmail}\n`;
  message += `• Empresa: ${customerCompany}\n`;
  if (customerPhone) {
    message += `• Teléfono: ${customerPhone}\n`;
  }
  
  message += `\n🏢 *Configuración:*\n`;
  message += `• Número de sedes: ${numSedes}\n\n`;
  
  sedes.forEach((sede, index) => {
    message += `${index === 0 ? '📍 Sede Principal' : `📍 Sede ${index + 1}`}:\n`;
    message += `  • ${sede.pcs} PCs\n`;
    message += `  • ${sede.servidores} ${sede.servidores === 1 ? 'Servidor' : 'Servidores'}\n`;
    
    // Calcular precio de esta sede
    let precioSede = index === 0 ? 790 : 590;
    if (sede.pcs > 10) {
      precioSede += (sede.pcs - 10) * 15;
    }
    if (sede.servidores > 1) {
      precioSede += (sede.servidores - 1) * 50;
    }
    message += `  • Precio: €${precioSede}\n\n`;
  });
  
  message += `💰 *Resumen financiero:*\n`;
  message += `• Subtotal: €${subtotal.toFixed(2)}\n`;
  message += `• IVA (21%): €${iva.toFixed(2)}\n`;
  message += `• *Total: €${total.toFixed(2)}*\n\n`;
  
  let paymentTypeText = 'Pago único';
  if (paymentType === 'subscription-annual') {
    paymentTypeText = 'Suscripción anual';
  } else if (paymentType === 'subscription-biennial') {
    paymentTypeText = 'Suscripción 2 años (10% descuento)';
    const discountedTotal = total * 2 * 0.9;
    message += `🎉 *Descuento aplicado:*\n`;
    message += `• Total sin descuento: €${(total * 2).toFixed(2)}\n`;
    message += `• Total con 10% descuento: €${discountedTotal.toFixed(2)}\n`;
    message += `• Ahorro: €${(total * 2 - discountedTotal).toFixed(2)}\n\n`;
  }
  
  message += `💳 *Tipo de pago:* ${paymentTypeText}\n\n`;
  message += `¿Podemos proceder con la auditoría?`;

  // Codificar el mensaje para URL
  const encodedMessage = encodeURIComponent(message);
  
  // Generar URL de WhatsApp
  return `https://wa.me/${phoneNumber}?text=${encodedMessage}`;
}

/**
 * Genera un mensaje simple de WhatsApp
 * @param {string} phoneNumber - Número de teléfono en formato internacional
 * @param {string} message - Mensaje a enviar
 * @returns {string} URL de WhatsApp
 */
export function generateSimpleWhatsAppLink(phoneNumber, message ) {
  const encodedMessage = encodeURIComponent(message);
  return `https://wa.me/${phoneNumber}?text=${encodedMessage}`;
}

/**
 * Número de WhatsApp de Internet Operadores
 */
export const WHATSAPP_NUMBER = '34655100400';
