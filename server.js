import express from 'express';
import cors from 'cors';
import makeWASocket, { useMultiFileAuthState } from '@whiskeysockets/baileys';
import pino from 'pino';
import qrcodeTerminal from 'qrcode-terminal';

const app = express();
app.use(express.json());
app.use(cors());

let sock;
let isConnected = false;

async function conectarWhatsApp() {
  const { state, saveCreds } = await useMultiFileAuthState('sesion_whatsapp');
  
  sock = makeWASocket({
    auth: state,
    printQRInTerminal: true,
    logger: pino({ level: 'silent' }),
    browser: ['Render', 'Chrome', '1.0.0']
  });

  sock.ev.on('creds.update', saveCreds);
  
  sock.ev.on('connection.update', (update) => {
    const { connection, qr } = update;
    if (qr) {
      console.log('--- COPIA Y ESCANEA ESTE QR EN TU CONSOLA O USA UN VISOR ---');
      qrcodeTerminal.generate(qr, { small: true });
    }
    if (connection === 'open') {
      isConnected = true;
      console.log('¡WhatsApp conectado exitosamente!');
    } else if (connection === 'close') {
      isConnected = false;
      setTimeout(conectarWhatsApp, 5000);
    }
  });
}

conectarWhatsApp();

app.get('/', (req, res) => {
  if (isConnected) {
    res.send('<h2>¡WhatsApp está conectado y listo!</h2>');
  } else {
    res.send('<h2>Revisa los Logs (registros) en Render para ver el código QR en formato de texto.</h2>');
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
