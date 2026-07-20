// Esta función corre en el servidor de Vercel, nunca en el celular del usuario.
// La clave ANTHROPIC_API_KEY vive solo acá (variable de entorno en Vercel), nunca en el código.

const { requireAuth } = require('../lib/auth');

module.exports = async function handler(req, res) {
  const user = requireAuth(req, res);
  if (!user) return; // requireAuth ya respondió 401

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Método no permitido' });
  }

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    return res.status(500).json({ error: 'Falta configurar ANTHROPIC_API_KEY en Vercel' });
  }

  const { imageBase64, mediaType } = req.body || {};
  if (!imageBase64) {
    return res.status(400).json({ error: 'Falta la imagen' });
  }

  try {
    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01'
      },
      body: JSON.stringify({
        model: 'claude-sonnet-4-6',
        max_tokens: 1000,
        messages: [{
          role: 'user',
          content: [
            { type: 'image', source: { type: 'base64', media_type: mediaType || 'image/jpeg', data: imageBase64 } },
            {
              type: 'text',
              text: 'Extraé los datos de este comprobante fiscal argentino (factura o ticket). Devolvé SOLAMENTE un objeto JSON, sin texto adicional, sin markdown, con esta forma exacta: {"tipo":"venta" o "compra" (venta si el emisor sos vos/LAFON JORGE EZEQUIEL cobrando, compra si estás pagando a otro proveedor),"tipoComprobante":"A"|"B"|"C"|"NC" (NC = nota de crédito; mirá el encabezado del ticket/factura, ej "FACTURA A", "TIQUE FACTURA A", "COD.006"=A, "COD.081"=A, "COD.011"=B, "COD.083"=B; si es nota de crédito marcá NC sin importar la letra),"numeroComprobante":"punto de venta y número tal cual figuran, ej 0052-00032605, o null","cuit":"CUIT de la contraparte (el que NO es LAFON JORGE EZEQUIEL / 20-32694351-8), formato NN-NNNNNNNN-N, o null","fecha":"YYYY-MM-DD o null","contraparte":"nombre de la empresa/persona en el comprobante o null","neto":numero o null (importe neto gravado, antes de IVA),"alicuota":21|10.5|27|0 o null,"iva":numero o null (monto de IVA discriminado si figura, para cruzar contra neto×alicuota),"otrosTributos":numero (impuestos internos, tasas municipales u otros tributos que no sean IVA/percepciones; 0 si no hay),"percepcionIVA":numero (percepción de IVA si figura discriminada como tal; 0 si no hay),"percepcionIIBB":numero (percepción de Ingresos Brutos si figura; 0 si no hay),"total":numero o null (importe TOTAL del comprobante),"categoria":"una sola etiqueta corta que mejor describa el concepto: para compras elegí entre Combustible, Insumos/EPP, Servicios profesionales, Alquiler, Impuestos/tasas, Honorarios, Otro; para ventas elegí entre Inspección altura, Inspección espacios confinados, Detección de gas, Ticketing/eventos, Otro","dudosos":["nombres de campos con baja confianza, de esta lista: fecha, contraparte, neto, alicuota, percepcionIIBB, percepcionIVA, total, tipoComprobante, numeroComprobante, cuit, categoria"]}. No inventes valores: si no podes leer un campo con confianza, poné null (0 para los numéricos que suelen ser 0) y agregalo a dudosos.'
            }
          ]
        }]
      })
    });

    const data = await response.json();

    if (!response.ok) {
      return res.status(response.status).json({ error: data?.error?.message || 'Error de la API de Anthropic' });
    }

    const textBlock = (data.content || []).find(b => b.type === 'text');
    if (!textBlock) {
      return res.status(500).json({ error: 'La respuesta no trajo texto' });
    }

    const clean = textBlock.text.replace(/```json|```/g, '').trim();
    const parsed = JSON.parse(clean);

    return res.status(200).json(parsed);
  } catch (e) {
    return res.status(500).json({ error: e.message || 'Error inesperado procesando la imagen' });
  }
}
