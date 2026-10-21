import express from 'express';
import cors from 'cors';
import { createRequire } from 'module';
import pino from 'pino';
import QRCode from 'qrcode';

const require = createRequire(import.meta.url);
const { default: makeWASocket, useMultiFileAuthState, DisconnectReason } = require('@whiskeysockets/baileys');

const app = express();
app.use(express.json());
app.use(cors());

let sock;
let currentQr = null;
let isConnected = false;

async function iniciarWhatsApp() {
  try {
    const { state, saveCreds } = await useMultiFileAuthState('./auth_info');
    
    sock = makeWASocket({
      auth: state,
      printQRInTerminal: false,
      logger: pino({ level: 'silent' }),
      browser: ['Ubuntu', 'Chrome', '20.0.0'],
      connectTimeoutMs: 60000,
      defaultQueryTimeoutMs: 60000,
      keepAliveIntervalMs: 25000
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
        console.log('✅ WHATSAPP CONECTADO Y CONEXION ESTABLE');
      } else if (connection === 'close') {
        isConnected = false;
        const statusCode = lastDisconnect?.error?.output?.statusCode;
        console.log(`Conexión cerrada. Código de razón: ${statusCode}`);
        
        // Reconectar siempre que no sea un desvinculado explícito
        if (statusCode !== DisconnectReason.loggedOut) {
          console.log('Reconectando a WhatsApp...');
          setTimeout(iniciarWhatsApp, 3000);
        } else {
          console.log('Sesión cerrada explícitamente. Escanea el QR de nuevo.');
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
    return res.send('<h2>✅ ¡WhatsApp ya está conectado y listo!</h2>');
  }
  if (!currentQr) {
    return res.send(`
      <html>
        <head><meta http-equiv="refresh" content="3"></head>
        <body style="display:flex;justify-content:center;align-items:center;height:100vh;font-family:sans-serif;">
          <h2>Iniciando motor de WhatsApp, por favor espera 3 segundos...</h2>
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
        <p>Abre WhatsApp > Dispositivos vinculados > Vincular un dispositivo</p>
      </div>
    `);
  } catch (err) {
    res.status(500).send('Error al generar el QR');
  }
});

app.post('/send-whatsapp', async (req, res) => {
  try {
    console.log('Petición recibida de Lovable:', req.body);
    const { groupId, message, text } = req.body;
    
    const contenido = message || text || 'Aviso de actualización';
    const destino = groupId || '120363294650859422@g.us';

    if (!sock || !isConnected) {
      console.log('Intento de envío fallido: WhatsApp desbalanceado/desconectado');
      return res.status(503).json({ error: 'WhatsApp no está conectado' });
    }

    await sock.sendMessage(destino, { text: contenido });
    console.log(`✅ Mensaje enviado exitosamente a ${destino}`);
    
    res.status(200).json({ success: true, message: 'Aviso enviado a WhatsApp' });
  } catch (error) {
    console.error('Error al enviar el mensaje:', error);
    res.status(500).json({ error: 'Error interno enviando mensaje' });
  }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Servidor activo en el puerto ${PORT}`);
});
