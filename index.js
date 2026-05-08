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

// Middleware de autenticação
function verifyApiKey(req, res, next) {
  if (req.headers['x-api-key'] !== API_KEY) {
    return res.status(401).json({ error: 'Unauthorized' });
  }
  next();
}

// Rota: Status da conexão
app.get('/status', (req, res) => {
  res.json({
    connected: sock?.user ? true : false,
    user: sock?.user,
    qrAvailable: !!qrCodeData
  });
});

// Rota: QR Code em JSON (base64)
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

// 🎯 Rota: QR Code VISUAL (página HTML)
app.get('/qr-code', async (req, res) => {
  if (!qrCodeData) {
    return res.send(`
      <!DOCTYPE html>
      <html>
      <head>
        <title>📱 Aguarde...</title>
        <meta http-equiv="refresh" content="5">
        <style>
          body { font-family: Arial; text-align: center; padding: 50px; background: #f0f0f0; }
          .loader { border: 4px solid #f3f3f3; border-top: 4px solid #25D366; border-radius: 50%; width: 40px; height: 40px; animation: spin 1s linear infinite; margin: 20px auto; }
          @keyframes spin { 0% { transform: rotate(0deg); } 100% { transform: rotate(360deg); } }
        </style>
      </head>
      <body>
        <h1>⏳ Gerando QR Code...</h1>
        <div class="loader"></div>
        <p>A página irá recarregar automaticamente em 5 segundos.</p>
      </body>
      </html>
    `);
  }
  
  const qrImage = await QRCode.toDataURL(qrCodeData);
  
  res.send(`
    <!DOCTYPE html>
    <html>
    <head>
      <title>📱 Escaneie o QR Code</title>
      <meta name="viewport" content="width=device-width, initial-scale=1">
      <style>
        body { font-family: Arial, sans-serif; text-align: center; padding: 20px; background: #f0f2f5; margin: 0; }
        .container { max-width: 500px; margin: 0 auto; background: white; padding: 30px; border-radius: 10px; box-shadow: 0 2px 10px rgba(0,0,0,0.1); }
        h1 { color: #25D366; margin-bottom: 10px; }
        .subtitle { color: #666; margin-bottom: 20px; }
        img { max-width: 100%; height: auto; border: 1px solid #ddd; border-radius: 8px; margin: 20px 0; }
        .instructions { text-align: left; background: #f9f9f9; padding: 15px; border-radius: 6px; margin: 20px 0; }
        .instructions ol { padding-left: 20px; margin: 10px 0; }
        .instructions li { margin: 8px 0; color: #333; }
        .refresh { color: #25D366; cursor: pointer; text-decoration: none; }
        .footer { margin-top: 30px; color: #999; font-size: 12px; }
      </style>
    </head>
    <body>
      <div class="container">
        <h1>📱 WhatsApp Bot</h1>
        <p class="subtitle">Escaneie o QR Code abaixo para conectar</p>
        
        <img src="${qrImage}" alt="QR Code para WhatsApp">
        
        <div class="instructions">
          <strong>Instruções:</strong>
          <ol>
            <li>Abra o WhatsApp no seu celular</li>
            <li>Toque em <strong>Menu</strong> ou <strong>Configurações</strong></li>
            <li>Selecione <strong>"Dispositivos conectados"</strong></li>
            <li>Toque em <strong>"Conectar dispositivo"</strong></li>
            <li>Aponte a câmera para o QR Code acima</li>
          </ol>
        </div>
        
        <p><a href="/qr-code" class="refresh">🔄 Recarregar QR Code</a></p>
        
        <div class="footer">
          Bot conectado com sucesso! 🎉
        </div>
      </div>
    </body>
    </html>
  `);
});

// Rota: Enviar mensagem (PROTEGIDA)
app.post('/send', verifyApiKey, async (req, res) => {
  try {
    const { phone, message } = req.body;
    
    if (!phone || !message) {
      return res.status(400).json({ error: 'Phone and message required' });
    }
    
    if (!sock || !sock.user) {
      return res.status(503).json({ error: 'WhatsApp not connected' });
    }
    
    const jid = phone.replace(/\D/g, '') + '@s.whatsapp.net';
    const result = await sock.sendMessage(jid, { text: message });
    
    console.log(`✅ Mensagem enviada para ${phone}`);
    res.json({ success: true, messageId: result.key.id });
    
  } catch (error) {
    console.error(`❌ Erro ao enviar: ${error.message}`);
    res.status(500).json({ error: error.message });
  }
});

// Inicializa conexão WhatsApp
async function connectToWhatsApp() {
  try {
    const { state, saveCreds } = await useMultiFileAuthState('auth_info_baileys');
    const { version } = await fetchLatestBaileysVersion();
    
    console.log(`📱 Using WA v${version.join('.')}`);
    
    sock = makeWASocket({
      version,
      logger: pino({ level: 'silent' }),
      auth: state,
      browser: ['Bot Producao', 'Chrome', '1.0.0'],
      printQRInTerminal: false // Desativado para evitar warning
    });

    sock.ev.on('connection.update', (update) => {
      const { connection, lastDisconnect, qr } = update;
      
      if (qr) {
        qrCodeData = qr;
        console.log('📱 QR Code atualizado (Acesse /qr-code)');
      }
      
      if (connection === 'close') {
        const shouldReconnect = (lastDisconnect.error instanceof Boom)?.output?.statusCode !== DisconnectReason.loggedOut;
        console.log(`❌ Connection closed. Reconnecting: ${shouldReconnect}`);
        if (shouldReconnect) {
          setTimeout(connectToWhatsApp, 2000); // Aguarda 2s antes de reconectar
        }
      }
      
      if (connection === 'open') {
        console.log('✅ WhatsApp Conectado com Sucesso!');
        qrCodeData = null;
      }
    });

    sock.ev.on('creds.update', saveCreds);
    
  } catch (error) {
    console.error('❌ Erro ao conectar WhatsApp:', error.message);
    setTimeout(connectToWhatsApp, 5000); // Tenta novamente em 5s
  }
}

// Inicia o servidor
app.listen(PORT, () => {
  console.log(`🚀 Servidor rodando na porta ${PORT}`);
  connectToWhatsApp();
});
