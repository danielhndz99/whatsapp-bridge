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
  try {
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
        console.log('QR generado correctamente.');
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
  } catch (error) {
    console.error('Error al conectar WhatsApp:', error);
  }
}

conectarWhatsApp();

app.get('/', async (req, res) => {
  if (isConnected) {
    return res.send('<h2>¡WhatsApp ya está conectado y listo!</h2>');
  }
  if (!currentQr) {
    return res.send('<h2>Generando código QR, por favor recarga en 5 segundos...</h2>');
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

app.post('/send-whatsapp', async, async (req, res) => {
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
