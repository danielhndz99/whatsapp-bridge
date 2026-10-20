import express from 'express';
import cors from 'cors';
import makeWASocket, { useMultiFileAuthState } from '@whiskeysockets/baileys';
import pino from 'pino';
import QRCode from 'qrcode';

const app = express();
app.use(express.json());
app.use(cors());

let sock;
let currentQr = null;
let isConnected = false;

async function conectarWhatsApp() {
  const { state, saveCreds } = await useMultiFileAuthState('sesion_whatsapp');
  
  sock = makeWASocket({
    auth: state,
    printQRInTerminal: false,
    logger: pino({ level: 'silent' }),
    browser: ['Render', 'Chrome', '1.0.0']
  });

  sock.ev.on('creds.update', saveCreds);
  
  sock.ev.on('connection.update', (update) => {
    const { connection, qr } = update;
    if (qr) {
      currentQr = qr;
      console.log('Nuevo QR generado en memoria.');
    }
    if (connection === 'open') {
      isConnected = true;
      currentQr = null;
      console.log('¡WhatsApp conectado exitosamente!');
    } else if (connection === 'close') {
      isConnected = false;
      setTimeout(conectarWhatsApp, 5000);
    }
  });
}

conectarWhatsApp();

app.get('/', async (req, res) => {
  if (isConnected) {
    return res.send('<h2>¡WhatsApp ya está conectado y listo!</h2>');
  }
  if (!currentQr) {
    return res.send(`
      <html>
        <head>
          <meta http-equiv="refresh" content="3">
        </head>
        <body style="display:flex;justify-content:center;align-items:center;height:100vh;font-family:sans-serif;">
          <h2>Generando código QR, actualizando en 3 segundos...</h2>
        </body>
      </html>
    `);
  }
  try {
    const qrImage = await QRCode.toDataURL(currentQr);
    res.send(`
      <div style="display:flex;flex-direction:column;align-items:center;justify-content:center;height:100vh;font-family:sans-serif;">
        <h2>Escanea este código QR con tu WhatsApp</h2>
        <img src="${qrImage}" alt="QR Code" style="width:300px;height:300px;" />
        <p>Abre WhatsApp > Dispositivos vinculados > Vincular dispositivo</p>
      </div>
    `);
  } catch (err) {
    res.status(500).send('Error al generar el QR');
  }
});

app.post('/send-whatsapp', async (req, res) => {
  try {
    const { groupId, message } = req.body;
    if (!sock || !isConnected) {
      return res.status(500).json({ error: 'WhatsApp no está conectado aún.' });
    }
    await sock.sendMessage(groupId, { text: message });
    res.json({ success: true, message: 'Mensaje enviado correctamente.' });
  } catch (error) {
    console.error('Error al enviar mensaje:', error);
    res.status(500).json({ error: 'No se pudo enviar el mensaje.' });
  }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Servidor escuchando en el puerto ${PORT}`);
});
