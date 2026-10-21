import express from 'express';
import cors from 'cors';
import { createRequire } from 'module';
import pino from 'pino';
import QRCode from 'qrcode';
import fs from 'fs';
import NodeCache from 'node-cache';

const require = createRequire(import.meta.url);
const { default: makeWASocket, useMultiFileAuthState, DisconnectReason } = require('@whiskeysockets/baileys');

const app = express();
app.use(express.json());
app.use(cors());

let sock;
let currentQr = null;
let isConnected = false;
const msgRetryCounterCache = new NodeCache();

const authPath = '/opt/render/project/src/auth_info';

if (!fs.existsSync(authPath)) {
  fs.mkdirSync(authPath, { recursive: true });
}

async function iniciarWhatsApp() {
  try {
    const { state, saveCreds } = await useMultiFileAuthState(authPath);
    
    sock = makeWASocket({
      auth: state,
      printQRInTerminal: false,
      logger: pino({ level: 'silent' }),
      browser: ['Ubuntu', 'Chrome', '20.0.0'],
      msgRetryCounterCache,
      syncFullHistory: false
    });

    sock.ev.on('creds.update', saveCreds);
    
    sock.ev.on('connection.update', async (update) => {
      const { connection, lastDisconnect, qr } = update;
      
      if (qr) {
        currentQr = qr;
        console.log('¡Nuevo código QR listo para escanear!');
      }
      
      if (connection === 'open') {
        isConnected = true;
        currentQr = null;
        console.log('✅ WHATSAPP CONECTADO Y SESIÓN CARGADA DESDE EL DISCO');
      } else if (connection === 'close') {
        isConnected = false;
        const statusCode = lastDisconnect?.error?.output?.statusCode;
        console.log(`Conexión cerrada (Código: ${statusCode}). Reconectando...`);
        
        if (statusCode !== DisconnectReason.loggedOut) {
          setTimeout(iniciarWhatsApp, 3000);
        }
      }
    });
  } catch (error) {
    console.error('Error al iniciar WhatsApp:', error);
    setTimeout(iniciarWhatsApp, 5000);
  }
}

iniciarWhatsApp();

app.get('/', async (req, res) => {
  if (isConnected) {
    return res.send('<h2>✅ ¡WhatsApp está conectado y la sesión persistente está activa!</h2>');
  }
  if (!currentQr) {
    return res.send(`
      <html>
        <head><meta http-equiv="refresh" content="3"></head>
        <body style="display:flex;justify-content:center;align-items:center;height:100vh;font-family:sans-serif;">
          <h2>Iniciando servidor y cargando sesión guardada...</h2>
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
      </div>
    `);
  } catch (err) {
    res.status(500).send('Error al generar el QR');
  }
});

app.post('/send-whatsapp', async (req, res) => {
  try {
    const { groupId, message, text } = req.body;
    const contenido = message || text || 'Aviso de actualización';
    const destino = groupId || '120363294650859422@g.us';

    if (!sock || !isConnected) {
      return res.status(503).json({ error: 'WhatsApp no está conectado' });
    }

    // Uso de relayMessage para evitar errores de cifrado libsignal en grupos
    const messageId = sock.generateMessageTag();
    await sock.relayMessage(destino, {
      conversation: contenido
    }, { messageId });

    console.log(`✅ Mensaje enviado exitosamente mediante relayMessage a ${destino}`);
    return res.status(200).json({ success: true, message: 'Aviso enviado a WhatsApp' });

  } catch (error) {
    console.error('Error crítico al enviar el mensaje:', error);
    return res.status(500).json({ error: 'Error al enviar mensaje.' });
  }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Servidor activo en el puerto ${PORT}`);
});
