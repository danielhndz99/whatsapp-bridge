import express from 'express';
import cors from 'cors';
import makeWASocket, { useMultiFileAuthState } from '@whiskeysockets/baileys';
import pino from 'pino';

const app = express();
app.use(express.json());
app.use(cors());

let sock;

async function conectarWhatsApp() {
  const { state, saveCreds } = await useMultiFileAuthState('sesion_whatsapp');
  
  sock = makeWASocket({
    auth: state,
    printQRInTerminal: true,
    logger: pino({ level: 'silent' })
  });

  sock.ev.on('creds.update', saveCreds);
  
  sock.ev.on('connection.update', (update) => {
    const { connection } = update;
    if (connection === 'open') {
      console.log("¡WhatsApp conectado exitosamente y listo para enviar mensajes!");
    }
  });
}

conectarWhatsApp();

app.post('/send-whatsapp', async (req, res) => {
  try {
    const { groupId, message } = req.body;
    if (!sock) {
      return res.status(500).json({ error: 'WhatsApp no está inicializado aún.' });
    }
    await sock.sendMessage(groupId, { text: message });
    res.json({ success: true, message: 'Mensaje enviado al grupo correctamente.' });
  } catch (error) {
    console.error("Error al enviar mensaje:", error);
    res.status(500).json({ error: 'No se pudo enviar el mensaje.' });
  }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Servidor puente de WhatsApp corriendo en el puerto ${PORT}`);
});
