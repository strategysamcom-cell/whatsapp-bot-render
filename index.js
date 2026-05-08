// Rota: Página visual do QR Code
app.get('/qr-code', async (req, res) => {
  if (!qrCodeData) {
    return res.send('<h1>⏳ Aguarde... QR Code será gerado em instantes</h1><script>setTimeout(() => location.reload(), 3000)</script>');
  }
  
  const qrImage = await QRCode.toDataURL(qrCodeData);
  
  res.send(`
    <!DOCTYPE html>
    <html>
    <head>
      <title>📱 Escaneie o QR Code</title>
      <style>
        body { 
          font-family: Arial; 
          text-align: center; 
          padding: 50px; 
          background: #f0f0f0;
        }
        img { 
          border: 10px solid white; 
          border-radius: 10px;
          box-shadow: 0 4px 8px rgba(0,0,0,0.2);
        }
        h1 { color: #25D366; }
        p { color: #666; }
      </style>
    </head>
    <body>
      <h1>📱 WhatsApp Bot</h1>
      <p>Escaneie o QR Code abaixo com seu WhatsApp:</p>
      <img src="${qrImage}" alt="QR Code">
      <p><strong>Instruções:</strong></p>
      <p>1. Abra o WhatsApp no celular<br>
         2. Toque em Menu ou Configurações<br>
         3. Selecione "Dispositivos conectados"<br>
         4. Toque em "Conectar dispositivo"<br>
         5. Aponte a câmera para o QR Code</p>
    </body>
    </html>
  `);
});
