const express = require('express');
const { default: makeWASocket, useMultiFileAuthState, DisconnectReason, fetchLatestBaileysVersion } = require('@whiskeysockets/baileys');
const QRCode = require('qrcode');
const pino = require('pino');
const { Boom } = require('@hapi/boom');

const app = express();
app.use(express.json());

// Configurações
const PORT = process.env.PORT || 3000;
const API_KEY = process.env.API_KEY || 'minha_chave_secreta_123';

let sock;
let qrCodeData = null;

// Rota: Status
app.get('/status', (req, res) => {
  res.json({
    connected: sock?.user ? true : false,
    user: sock?.user,
    qrAvailable: !!qrCodeData
  });
});

// Rota: Gerar QR Code
app.get('/qr', async (req, res) => {
  if (!qrCodeData) {
    return res.status(404).json({ error: 'QR code not available' });
  }
  try {
    const qrImage = await QRCode.toDataURL(qrCodeData);
    res.json({ qr: qrImage });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// Rota: Enviar Mensagem
app.post('/send', (req, res) => {
  if (req.headers['x-api-key'] !== API_KEY) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  try {
    const { phone, message } = req.body;
    if (!phone || !message) throw new Error('Phone and message required');
    if (!sock || !sock.user) throw new Error('WhatsApp not connected');

    const jid = phone.replace(/\D/g, '') + '@s.whatsapp.net';
    
    sock.sendMessage(jid, { text: message })
      .then(() => {
        console.log(`✅ Mensagem enviada para ${phone}`);
        res.json({ success: true });
      })
      .catch(err => {
        console.error(err);
        res.status(500).json({ error: err.message });
      });

  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Função para conectar
async function connectToWhatsApp() {
  const { state, saveCreds } = await useMultiFileAuthState('auth_info_baileys');
  const { version, isLatest } = await fetchLatestBaileysVersion();
  console.log(`📱 Using WA v${version.join('.')}, isLatest: ${isLatest}`);

  sock = makeWASocket({
    version,
    logger: pino({ level: 'silent' }),
    auth: state,
    browser: ['Bot Producao', 'Chrome', '1.0.0'],
    printQRInTerminal: true
  });

  sock.ev.on('connection.update', (update) => {
    const { connection, lastDisconnect, qr } = update;
    
    if (qr) {
      qrCodeData = qr;
      console.log('📱 QR Code atualizado (Acesse /qr)');
    }

    if (connection === 'close') {
      const shouldReconnect = (lastDisconnect.error instanceof Boom)?.output?.statusCode !== DisconnectReason.loggedOut;
      console.log('❌ Connection closed. Reconnecting:', shouldReconnect);
      if (shouldReconnect) connectToWhatsApp();
    } else if (connection === 'open') {
      console.log('✅ WhatsApp Conectado com Sucesso!');
      qrCodeData = null;
    }
  });

  sock.ev.on('creds.update', saveCreds);
}

// Inicia o Servidor
app.listen(PORT, () => {
  console.log(`🚀 Servidor rodando na porta ${PORT}`);
  connectToWhatsApp();
});
