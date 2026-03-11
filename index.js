const express = require('express');
const cors = require('cors');
const multer = require('multer');
const axios = require('axios');
const FormData = require('form-data');
const sharp = require('sharp');
require('dotenv').config();
const path = require('path');
require('dotenv').config();

const app = express();
const upload = multer({ storage: multer.memoryStorage() });

app.use(cors());
app.use(express.static('public'));

app.post('/upscale', upload.single('image'), async (req, res) => {
  try {
    console.log('📥 Incoming request to /upscale');
    console.log('File received:', !!req.file);

    if (!req.file || !req.file.buffer) {
      return res.status(400).json({ error: 'No image uploaded' });
    }

    console.log('✅ File details:', {
      originalname: req.file.originalname,
      mimetype: req.file.mimetype,
      size: req.file.size,
      fieldname: req.file.fieldname
    });

    const form = new FormData();
    form.append('image', req.file.buffer, {
      filename: req.file.originalname || 'upload.png',
      contentType: req.file.mimetype || 'image/png'
    });

    // PixelCut requires scale parameter
    form.append('scale', '2')
    
    console.log('📤 Sending to PixelCut...');

    const pixelcutResponse = await axios.post(
      'https://api.developer.pixelcut.ai/v1/upscale',
      form,
      {
        headers: {
          ...form.getHeaders(),
          'X-API-KEY': process.env.PIXELCUT_API_KEY
        }
      }
    );

    const resultUrl = pixelcutResponse.data?.result_url || pixelcutResponse.data?.result?.image_url;
    if (!resultUrl) {
      console.error('❌ PixelCut returned unexpected response:', pixelcutResponse.data);
      return res.status(500).json({ error: 'PixelCut response format unexpected' });
    }

    console.log('✅ PixelCut result URL:', resultUrl);

    const imageResponse = await axios.get(resultUrl, {
      responseType: 'arraybuffer'
    });

    // Important: withMetadata must come before png()
    const outputBuffer = await sharp(Buffer.from(imageResponse.data))
      .withMetadata({ density: 300 })
      .png()
      .toBuffer();

    const base64 = outputBuffer.toString('base64');

    res.json({
      image: `data:image/png;base64,${base64}`
    });
  } catch (error) {
    console.error('❌ Upscale error:', error.response?.data || error.message);
    res.status(500).json({ error: 'Upscale failed' });
  }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`✅ MoreTranz Upscaler running on port ${PORT}`);
});
