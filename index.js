// index.js (FIXED VERSION)
const { Client, LocalAuth, MessageMedia } = require('whatsapp-web.js');
const qrcode = require('qrcode-terminal');
const express = require('express');
const fs = require('fs-extra');
const path = require('path');
const sharp = require('sharp');
const ffmpeg = require('fluent-ffmpeg');
const ffmpegStatic = require('ffmpeg-static');
const axios = require('axios');
const bodyParser = require('body-parser');
const cors = require('cors');
const http = require('http');

ffmpeg.setFfmpegPath(ffmpegStatic);

const app = express();
app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: true }));
app.use(cors());
app.use(express.static('public'));

// Bot Configuration
const config = {
  ownerNumber: '62895320723578@c.us', // Ganti dengan nomor owner
  botName: 'NAMZ BOT',
  autoRead: true,
  autoReply: true,
  mediaPath: './media/',
  stickersPath: './stickers/'
};

// Ensure directories exist
fs.ensureDirSync(config.mediaPath);
fs.ensureDirSync(config.stickersPath);
fs.ensureDirSync('./auth');
fs.ensureDirSync('./public');

// Global variables
global.pendingCodes = global.pendingCodes || {};
global.lastQR = null;
global.clientReady = false;

// Client Initialization
const client = new Client({
  authStrategy: new LocalAuth({
    clientId: 'namz-bot',
    dataPath: './auth'
  }),
  puppeteer: {
    headless: true,
    args: [
      '--no-sandbox',
      '--disable-setuid-sandbox',
      '--disable-dev-shm-usage',
      '--disable-accelerated-2d-canvas',
      '--no-first-run',
      '--no-zygote',
      '--single-process',
      '--disable-gpu'
    ]
  }
});

// Auto Reply Messages
const autoReplies = {
  'hai': async () => {
    try {
      const mediaPath = 'hoshino.png';
      const audioPath = 'tes.mp3';
      
      const result = { text: '✨ Hai! Selamat datang di NAMZ BOT ✨\n\nBot siap membantu Anda!' };
      
      if (await fs.pathExists(mediaPath)) {
        result.media = MessageMedia.fromFilePath(mediaPath);
      }
      if (await fs.pathExists(audioPath)) {
        result.audio = MessageMedia.fromFilePath(audioPath);
      }
      
      return result;
    } catch (error) {
      return { text: '✨ Hai! Selamat datang di NAMZ BOT ✨\n\nBot siap membantu Anda!' };
    }
  },
  'help': async () => {
    return { text: `🤖 *${config.botName}* 🤖

📋 *Daftar Perintah:*

• *sticker* / *stiker* - Buat stiker dari foto/gambar
• *sticker-gif* / *stikergif* - Buat stiker dari video/gif
• *brat [teks]* - Buat stiker BRAT (text style)
• *bratvid* - Buat video stiker BRAT
• *iqc* - Verifikasi nomor dengan kode
• *menu* - Tampilkan menu ini

🎵 *Auto Reply:* Bot akan membalas pesan dengan audio & foto

💫 *Fitur Lain:*
- Auto Read Pesan
- Support Sticker semua ukuran
- Convert video ke sticker
- BRAT Sticker Generator

© NAMZ BOT - Anti Banned System` };
  },
  'menu': async () => {
    try {
      const mediaPath = './media/menu.jpg';
      const result = { text: '📱 *MENU NAMZ BOT*\n\nKetik *help* untuk melihat semua perintah!' };
      
      if (await fs.pathExists(mediaPath)) {
        result.media = MessageMedia.fromFilePath(mediaPath);
      }
      
      return result;
    } catch (error) {
      return { text: '📱 *MENU NAMZ BOT*\n\nKetik *help* untuk melihat semua perintah!' };
    }
  }
};

// Default reply
const defaultReply = async () => {
  try {
    const mediaPath = './media/default.jpg';
    const audioPath = './media/default.mp3';
    
    const result = { text: '🤖 *NAMZ BOT*\n\nKetik *help* untuk melihat menu!' };
    
    if (await fs.pathExists(mediaPath)) {
      result.media = MessageMedia.fromFilePath(mediaPath);
    }
    if (await fs.pathExists(audioPath)) {
      result.audio = MessageMedia.fromFilePath(audioPath);
    }
    
    return result;
  } catch (error) {
    return { text: '🤖 *NAMZ BOT*\n\nKetik *help* untuk melihat menu!' };
  }
};

// Sticker Functions
async function createSticker(imagePath, outputPath) {
  try {
    await sharp(imagePath)
      .resize(512, 512, { fit: 'contain', background: { r: 0, g: 0, b: 0, alpha: 0 } })
      .webp({ quality: 80 })
      .toFile(outputPath);
    return true;
  } catch (error) {
    console.error('Sticker creation error:', error);
    return false;
  }
}

async function createVideoSticker(videoPath, outputPath) {
  return new Promise((resolve, reject) => {
    ffmpeg(videoPath)
      .inputOptions(['-stream_loop -1'])
      .outputOptions([
        '-vf', 'scale=512:512:force_original_aspect_ratio=increase,crop=512:512',
        '-c:v', 'libwebp',
        '-lossless', '0',
        '-q:v', '70',
        '-loop', '0',
        '-an',
        '-vsync', '0'
      ])
      .on('end', () => resolve(true))
      .on('error', (err) => reject(err))
      .save(outputPath);
  });
}

async function createBratSticker(text, outputPath) {
  const displayText = text.length > 20 ? text.substring(0, 20) + '...' : text;
  
  const svg = `
    <svg width="512" height="512" xmlns="http://www.w3.org/2000/svg">
      <rect width="512" height="512" fill="#ff69b4"/>
      <text x="256" y="256" font-family="Arial, sans-serif" font-size="48" font-weight="bold" fill="white" text-anchor="middle" dominant-baseline="middle" word-wrap="break-word" max-width="400">
        ${displayText}
      </text>
      <text x="256" y="400" font-family="Arial, sans-serif" font-size="24" fill="#ffff00" text-anchor="middle">
        ✨ BRAT STYLE ✨
      </text>
    </svg>
  `;
  
  await sharp(Buffer.from(svg))
    .webp()
    .toFile(outputPath);
  return true;
}

// Message Handler
client.on('message', async (message) => {
  try {
    // Skip status messages and own messages
    if (message.from.includes('status') || message.from === 'status@broadcast') {
      return;
    }
    
    console.log(`Message from: ${message.from} | Body: ${message.body || '[media]'}`);
    
    // Auto Read
    if (config.autoRead) {
      try {
        await message.read();
      } catch (readError) {
        console.log('Auto read error:', readError.message);
      }
    }
    
    const msgBody = message.body ? message.body.toLowerCase().trim() : '';
    
    // Auto Reply
    if (config.autoReply) {
      // Check for commands
      if (msgBody === 'sticker' || msgBody === 'stiker') {
        if (message.hasMedia) {
          try {
            const media = await message.downloadMedia();
            const tempPath = path.join(config.mediaPath, `temp_img_${Date.now()}.jpg`);
            const outputPath = path.join(config.stickersPath, `sticker_${Date.now()}.webp`);
            
            fs.writeFileSync(tempPath, media.data, 'base64');
            const success = await createSticker(tempPath, outputPath);
            
            if (success) {
              const stickerMedia = MessageMedia.fromFilePath(outputPath);
              await client.sendMessage(message.from, stickerMedia, { sendMediaAsSticker: true });
            } else {
              await message.reply('❌ Gagal membuat stiker. Coba lagi!');
            }
            
            await fs.remove(tempPath).catch(() => {});
            await fs.remove(outputPath).catch(() => {});
          } catch (error) {
            console.error('Sticker creation error:', error);
            await message.reply('❌ Terjadi kesalahan saat membuat stiker!');
          }
        } else {
          await message.reply('📸 *Cara membuat stiker:*\nKirim foto dan ketik *sticker* di caption!');
        }
      }
      
      else if (msgBody === 'sticker-gif' || msgBody === 'stikergif') {
        if (message.hasMedia) {
          try {
            const media = await message.downloadMedia();
            const tempPath = path.join(config.mediaPath, `temp_vid_${Date.now()}.mp4`);
            const outputPath = path.join(config.stickersPath, `sticker_${Date.now()}.webp`);
            
            fs.writeFileSync(tempPath, media.data, 'base64');
            const success = await createVideoSticker(tempPath, outputPath);
            
            if (success) {
              const stickerMedia = MessageMedia.fromFilePath(outputPath);
              await client.sendMessage(message.from, stickerMedia, { sendMediaAsSticker: true });
            } else {
              await message.reply('❌ Gagal membuat stiker GIF. Coba lagi!');
            }
            
            await fs.remove(tempPath).catch(() => {});
            await fs.remove(outputPath).catch(() => {});
          } catch (error) {
            console.error('Video sticker error:', error);
            await message.reply('❌ Terjadi kesalahan saat membuat stiker GIF!');
          }
        } else {
          await message.reply('🎬 *Cara membuat stiker GIF:*\nKirim video/gif dan ketik *sticker-gif* di caption!');
        }
      }
      
      else if (msgBody.startsWith('brat ') || msgBody === 'brat') {
        if (msgBody.length > 5) {
          const text = message.body.slice(5).trim();
          if (text.length > 0) {
            try {
              const outputPath = path.join(config.stickersPath, `brat_${Date.now()}.webp`);
              await createBratSticker(text, outputPath);
              const stickerMedia = MessageMedia.fromFilePath(outputPath);
              await client.sendMessage(message.from, stickerMedia, { sendMediaAsSticker: true });
              await fs.remove(outputPath).catch(() => {});
            } catch (error) {
              console.error('BRAT sticker error:', error);
              await message.reply('❌ Gagal membuat stiker BRAT!');
            }
          } else {
            await message.reply('🎨 *Buat Stiker BRAT:*\nKetik *brat [teks]*\nContoh: brat NAMZ BOT');
          }
        } else {
          await message.reply('🎨 *Buat Stiker BRAT:*\nKetik *brat [teks]*\nContoh: brat NAMZ BOT');
        }
      }
      
      else if (msgBody === 'bratvid') {
        await message.reply('🎬 *Fitur BRAT Video* sedang dalam pengembangan!');
      }
      
      else if (msgBody === 'iqc') {
        const code = Math.floor(100000 + Math.random() * 900000).toString();
        global.pendingCodes[message.from] = { code, timestamp: Date.now() };
        await message.reply(`🔐 *Verifikasi Kode*\n\nKode verifikasi Anda: *${code}*\n\nMasukkan kode ini untuk verifikasi.\nKode berlaku 5 menit.`);
      }
      
      else if (autoReplies[msgBody]) {
        const reply = await autoReplies[msgBody]();
        
        if (reply.text) await message.reply(reply.text);
        if (reply.media) await client.sendMessage(message.from, reply.media);
        if (reply.audio) await client.sendMessage(message.from, reply.audio);
      }
      
      else if (global.pendingCodes[message.from] && msgBody === global.pendingCodes[message.from].code) {
        const pending = global.pendingCodes[message.from];
        if (Date.now() - pending.timestamp <= 5 * 60 * 1000) {
          delete global.pendingCodes[message.from];
          await message.reply('✅ *Verifikasi Berhasil!*\n\nSelamat datang di NAMZ BOT!\nKetik *help* untuk mulai menggunakan bot.');
        } else {
          delete global.pendingCodes[message.from];
          await message.reply('❌ *Kode verifikasi expired!*\n\nKetik *iqc* untuk mendapatkan kode baru.');
        }
      }
      
      else if (msgBody && msgBody.length > 0) {
        const reply = await defaultReply();
        if (reply.text) await message.reply(reply.text);
        if (reply.media) await client.sendMessage(message.from, reply.media);
        if (reply.audio) await client.sendMessage(message.from, reply.audio);
      }
    }
  } catch (error) {
    console.error('Error handling message:', error);
    try {
      await message.reply('⚠️ Terjadi kesalahan! Silakan coba lagi.');
    } catch (replyError) {
      console.error('Failed to send error message:', replyError);
    }
  }
});

// QR Code Generation
client.on('qr', (qr) => {
  console.log('📱 Scan QR Code berikut dengan WhatsApp:');
  qrcode.generate(qr, { small: true });
  global.lastQR = qr;
  global.clientReady = false;
});

client.on('ready', () => {
  console.log(`✅ ${config.botName} is ready!`);
  console.log(`🤖 Bot is running with Anti-Banned system`);
  global.clientReady = true;
  global.lastQR = null;
});

client.on('authenticated', () => {
  console.log('🔐 Authentication successful!');
});

client.on('auth_failure', (msg) => {
  console.error('❌ Authentication failed:', msg);
  global.clientReady = false;
});

client.on('disconnected', (reason) => {
  console.log('Client was logged out', reason);
  global.clientReady = false;
});

// Initialize client
client.initialize().catch(err => {
  console.error('Failed to initialize client:', err);
});

// HTTP Server for Render
app.get('/', (req, res) => {
  res.send(`
    <!DOCTYPE html>
    <html>
    <head>
      <title>NAMZ BOT - WhatsApp Bot Dashboard</title>
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
      <style>
        * { margin: 0; padding: 0; box-sizing: border-box; }
        body {
          font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;
          background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
          min-height: 100vh;
          display: flex;
          justify-content: center;
          align-items: center;
          padding: 20px;
          color: white;
        }
        .container {
          background: rgba(255,255,255,0.1);
          backdrop-filter: blur(10px);
          border-radius: 20px;
          padding: 40px;
          box-shadow: 0 8px 32px rgba(0,0,0,0.1);
          text-align: center;
          max-width: 90%;
          width: 500px;
        }
        h1 {
          font-size: 3em;
          margin-bottom: 10px;
          background: linear-gradient(135deg, #fff, #ffd89b);
          -webkit-background-clip: text;
          -webkit-text-fill-color: transparent;
        }
        .status {
          padding: 10px;
          border-radius: 10px;
          margin: 20px 0;
          font-weight: bold;
        }
        .status.online { background: #4CAF50; }
        .status.offline { background: #f44336; }
        .status.waiting { background: #ff9800; }
        .qr-container {
          background: white;
          padding: 20px;
          border-radius: 10px;
          margin: 20px 0;
        }
        .feature-list {
          text-align: left;
          margin-top: 20px;
        }
        .feature-list li {
          margin: 10px 0;
          list-style: none;
          padding-left: 25px;
          position: relative;
        }
        .feature-list li:before {
          content: "✨";
          position: absolute;
          left: 0;
        }
        button {
          background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
          border: none;
          color: white;
          padding: 12px 30px;
          border-radius: 25px;
          font-size: 16px;
          cursor: pointer;
          margin-top: 20px;
          transition: transform 0.3s;
        }
        button:hover {
          transform: scale(1.05);
        }
        #qrCode {
          max-width: 200px;
          margin: 20px auto;
        }
        .info {
          margin-top: 20px;
          font-size: 12px;
          opacity: 0.8;
        }
      </style>
    </head>
    <body>
      <div class="container">
        <h1>🤖 NAMZ BOT</h1>
        <p>WhatsApp Business Bot Ultimate</p>
        
        <div class="status" id="status">
          🔄 Loading...
        </div>
        
        <div class="qr-container" id="qrSection" style="display: none;">
          <h3>Scan QR Code to Connect</h3>
          <div id="qrCode"></div>
          <p style="color: #333;">Buka WhatsApp > Linked Devices > Link a Device</p>
        </div>
        
        <div class="feature-list">
          <h3>✨ Bot Features:</h3>
          <ul>
            <li>Auto Read & Auto Reply with Media</li>
            <li>Sticker Creator (Photo & Video)</li>
            <li>BRAT Sticker Generator</li>
            <li>IQC Verification System</li>
            <li>Anti-Banned Protection</li>
            <li>24/7 Hosting Ready</li>
          </ul>
        </div>
        
        <button onclick="location.reload()">⟳ Refresh Status</button>
        <div class="info">© NAMZ BOT - All Rights Reserved</div>
      </div>
      
      <script src="https://cdn.jsdelivr.net/npm/qrcodejs@1.0.0/qrcode.min.js"></script>
      <script>
        function updateStatus() {
          fetch('/api/status')
            .then(res => res.json())
            .then(data => {
              const statusEl = document.getElementById('status');
              const qrSection = document.getElementById('qrSection');
              
              if (data.ready) {
                statusEl.className = 'status online';
                statusEl.innerHTML = '🟢 Bot is Online & Connected';
                qrSection.style.display = 'none';
              } else if (data.qr) {
                statusEl.className = 'status waiting';
                statusEl.innerHTML = '📱 Waiting for QR Scan';
                qrSection.style.display = 'block';
                document.getElementById('qrCode').innerHTML = '';
                new QRCode(document.getElementById('qrCode'), data.qr);
              } else {
                statusEl.className = 'status offline';
                statusEl.innerHTML = '🔴 Bot is Offline';
                qrSection.style.display = 'none';
              }
            })
            .catch(err => {
              console.error('Status fetch error:', err);
            });
        }
        
        updateStatus();
        setInterval(updateStatus, 5000);
      </script>
    </body>
    </html>
  `);
});

app.get('/api/status', (req, res) => {
  res.json({ 
    status: global.clientReady ? 'ready' : (global.lastQR ? 'waiting' : 'offline'),
    ready: global.clientReady,
    botName: config.botName,
    qr: global.lastQR || null
  });
});

app.post('/api/send-code', async (req, res) => {
  const { number } = req.body;
  
  if (!number) {
    return res.json({ success: false, error: 'Nomor tidak boleh kosong' });
  }
  
  const formattedNumber = number.includes('@c.us') ? number : `${number}@c.us`;
  const code = Math.floor(100000 + Math.random() * 900000).toString();
  
  try {
    if (!global.clientReady) {
      return res.json({ success: false, error: 'Bot belum siap. Tunggu hingga bot online.' });
    }
    
    await client.sendMessage(formattedNumber, `🔐 *Verification Code:* ${code}\n\nValid for 5 minutes.`);
    global.pendingCodes[formattedNumber] = { code, timestamp: Date.now() };
    res.json({ success: true, message: 'Code sent successfully!' });
  } catch (error) {
    console.error('Send code error:', error);
    res.json({ success: false, error: error.message });
  }
});

// Self-ping untuk keep alive di Render
setInterval(() => {
  const port = PORT || 3000;
  http.get(`http://localhost:${port}`, (res) => {
    console.log('✅ Keep-alive ping sent at', new Date().toLocaleString());
  }).on('error', (err) => {
    console.log('⚠️ Keep-alive ping failed:', err.message);
  });
}, 10 * 60 * 1000); // setiap 10 menit

const PORT = process.env.PORT || 3000;
app.listen(PORT, '0.0.0.0', () => {
  console.log(`🌐 Dashboard available at http://0.0.0.0:${PORT}`);
  console.log(`📱 Bot is starting... Scan QR code at the dashboard`);
});

// Handle graceful shutdown
process.on('SIGINT', async () => {
  console.log('Shutting down...');
  await client.destroy();
  process.exit(0);
});