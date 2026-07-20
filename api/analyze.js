// Esta función corre en el servidor de Vercel, nunca en el celular del usuario.
// La clave ANTHROPIC_API_KEY vive solo acá (variable de entorno en Vercel), nunca en el código.

module.exports = async function handler(req, res) {
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
              text: 'Extraé los datos de este comprobante fiscal argentino (factura o ticket). Devolvé SOLAMENTE un objeto JSON, sin texto adicional, sin markdown, con esta forma exacta: {"tipo":"venta" o "compra" (venta si el emisor sos vos/LAFON JORGE EZEQUIEL cobrando, compra si estás pagando a otro proveedor),"fecha":"YYYY-MM-DD o null","contraparte":"nombre de la empresa/persona en el comprobante o null","neto":numero o null,"alicuota":21|10.5|27|0 o null,"percepcion":numero o null (percepcion de IIBB si figura, si no 0),"dudosos":["nombres de campos con baja confianza, de esta lista: fecha, contraparte, neto, alicuota, percepcion"]}. No inventes valores: si no podes leer un campo con confianza, poné null (o 0 para percepcion) y agregalo a dudosos.'
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
