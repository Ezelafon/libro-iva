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

  const { imageBase64, mediaType, isPdf } = req.body || {};
  if (!imageBase64) {
    return res.status(400).json({ error: 'Falta la imagen' });
  }

  const fileBlock = isPdf
    ? { type: 'document', source: { type: 'base64', media_type: 'application/pdf', data: imageBase64 } }
    : { type: 'image', source: { type: 'base64', media_type: mediaType || 'image/jpeg', data: imageBase64 } };

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
            fileBlock,
            {
              type: 'text',
              text: 'Tu respuesta completa debe empezar directamente con el carácter "{" y terminar con "}", sin ninguna palabra antes ni después, sin explicaciones, sin markdown. Extraé los datos de este comprobante fiscal argentino (factura o ticket). Devolvé SOLAMENTE un objeto JSON, sin texto adicional, sin markdown, con esta forma exacta: {"tipo":"venta" o "compra" (venta si el emisor sos vos/LAFON JORGE EZEQUIEL cobrando, compra si estás pagando a otro proveedor),"tipoComprobante":"A"|"B"|"C"|"NC" (NC = nota de crédito; mirá el encabezado del ticket/factura, ej "FACTURA A", "TIQUE FACTURA A", "COD.006"=A, "COD.081"=A, "COD.011"=B, "COD.083"=B; si es nota de crédito marcá NC sin importar la letra),"numeroComprobante":"punto de venta y número tal cual figuran, ej 0052-00032605, o null","cuit":"CUIT de la contraparte (el que NO es LAFON JORGE EZEQUIEL / 20-32694351-8), formato NN-NNNNNNNN-N, o null","fecha":"YYYY-MM-DD o null","contraparte":"nombre de la empresa/persona en el comprobante o null","netos":{"21":{"neto":numero,"iva":numero},"10.5":{"neto":numero,"iva":numero},"27":{"neto":numero,"iva":numero},"0":{"neto":numero,"iva":0}} (IMPORTANTE: muchos tickets, sobre todo de supermercado, tienen productos con distintas alícuotas de IVA en el mismo comprobante — mirá bien el detalle de IVA discriminado por tasa, por ejemplo "Iva (21.000%): $9534.14" y "Iva (10.500%): $2579.33" por separado. El campo "iva" de cada alícuota es el monto de IVA TAL COMO FIGURA IMPRESO en el comprobante para esa tasa, no lo calcules vos multiplicando — leelo directamente del ticket. Las alícuotas que no aparezcan quedan en neto:0, iva:0. Si solo hay una alícuota, completá solo esa clave),"otrosTributos":numero (impuestos internos, tasas municipales u otros tributos que no sean IVA/percepciones; 0 si no hay),"percepcionIVA":numero (percepción de IVA si figura discriminada como tal; 0 si no hay),"percepcionIIBB":numero (percepción de Ingresos Brutos si figura; 0 si no hay),"total":numero o null (importe TOTAL del comprobante, el que realmente se pagó),"categoria":"una sola etiqueta corta que mejor describa el concepto: para compras elegí entre Casa, Alimento e higiene, Transporte, Bienestar, Educación, Otro; para ventas elegí entre Asesoramiento, Control de plagas, Extracción de petróleo y gas, Otro","dudosos":["nombres de campos con baja confianza, de esta lista: fecha, contraparte, neto, alicuota, percepcionIIBB, percepcionIVA, total, tipoComprobante, numeroComprobante, cuit, categoria"]}. No inventes valores: si no podes leer un campo con confianza, poné null (0 para los numéricos que suelen ser 0) y agregalo a dudosos. Antes de responder, verificá mentalmente que la suma de los netos más el IVA de cada alícuota más las percepciones más otrosTributos dé aproximadamente el total del comprobante; si no cierra, revisá si te faltó separar alguna alícuota.'
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

    let clean = textBlock.text.replace(/```json|```/g, '').trim();
    const start = clean.indexOf('{');
    const end = clean.lastIndexOf('}');
    if (start !== -1 && end !== -1 && end > start) {
      clean = clean.slice(start, end + 1);
    }
    const parsed = JSON.parse(clean);

    return res.status(200).json(parsed);
  } catch (e) {
    return res.status(500).json({ error: e.message || 'Error inesperado procesando la imagen' });
  }
}
