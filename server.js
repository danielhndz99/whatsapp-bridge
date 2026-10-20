import express from 'express';
import cors from 'cors';
import makeWASocket, { useMultiFileAuthState, DisconnectReason } from '@whiskeysockets/baileys';
import pino from 'pino';
import qrcodeTerminal from 'qrcode-terminal';

const app = express();
app.use(express.json());
app.use(cors());

let sock;
let isConnected = false;

async function iniciarWhatsApp() {
  try {
    const { state, saveCreds } = await useMultiFileAuthState('./auth_info');
    
    sock = makeWASocket({
      auth: state,
      printQRInTerminal: true,
      logger: pino({ level: 'silent' }),
      browser: ['Ubuntu', 'Chrome', '20.0.0']
    });

    sock.ev.on('creds.update', saveCreds);
    
    sock.ev.on('connection.update', async (update) => {
      const { connection, lastDisconnect, qr } = update;
      
      if (qr) {
        console.log('\n================ NUEVO CÓDIGO QR ================');
        qrcodeTerminal.generate(qr, { small: true });
        console.log('==================================================\n');
      }
      
      if (connection === 'open') {
        isConnected = true;
        console.log('¡WhatsApp conectado correctamente!');
      } else if (connection === 'close') {
        isConnected = false;
        const shouldReconnect = lastDisconnect?.error?.output?.statusCode !== DisconnectReason.loggedOut;
        if (shouldReconnect) {
          setTimeout(iniciarWhatsApp, 3000);
        }
      }
    });
  } catch (error) {
    console.error('Error crítico al iniciar WhatsApp:', error);
    setTimeout(iniciarWhatsApp, 5000);
  }
}

iniciarWhatsApp();

app.get('/', (req, res) => {
  if (isConnected) {
    res.send('<h2>¡WhatsApp está conectado y listo para recibir alertas!</h2>');
  } else {
    res.send('<h2>El servicio está activo. Por favor revisa la pestaña "Logs" en tu panel de Render para ver y escanear el código QR.</h2>');
  }
});

app.post('/send-whatsapp', async (req, res) => {
  try {
    const { groupId, message } = req.body;
    if (!sock || !isConnected) {
      return res.status(500).json({ error: 'WhatsApp no está conectado todavía.' });
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
  console.log(`Servidor web corriendo en el puerto ${PORT}`);
});
