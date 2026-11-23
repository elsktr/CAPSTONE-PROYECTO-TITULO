/**
 * Datos de contacto que muestra el pie de página de la tienda.
 *
 * DATOS DE DEMOSTRACIÓN: la dirección, el teléfono, los correos y las redes son de ejemplo
 * para presentar el proyecto. Antes de publicar la tienda hay que reemplazarlos aquí por
 * los reales; es el único lugar donde están.
 */
export const CONTACTO = {
  direccion: 'San Diego 1050, local 12',
  comuna: 'Santiago Centro, Región Metropolitana',
  horario: ['Lunes a sábado · 11:00 a 20:00', 'Domingo · 12:00 a 18:00'],
  /** Número en formato internacional, sin espacios ni signos; se usa en los enlaces. */
  telefono: '56912345678',
  telefonoVisible: '+56 9 1234 5678',
  correoVentas: 'ventas@rockstar.cl',
  correoAyuda: 'ayuda@rockstar.cl',
  redes: [
    { nombre: 'Instagram', usuario: '@rockstar.ecommerce.cl', url: 'https://www.instagram.com/rockstar.ecommerce.cl' },
    { nombre: 'Facebook', usuario: 'Rockstar e-commerce', url: 'https://www.facebook.com/rockstar.ecommerce.cl' },
    { nombre: 'TikTok', usuario: '@rockstar.ecommerce.cl', url: 'https://www.tiktok.com/@rockstar.ecommerce.cl' },
  ],
} as const;
