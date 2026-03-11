const express = require('express');
const cors = require('cors');
const multer = require('multer');
const axios = require('axios');
const FormData = require('form-data');
const sharp = require('sharp');
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

    form.append('scale', '2');

    console.log('📤 Sending to PixelCut...');

    const pixelcutResponse = await axios.post(
      'https://api.developer.pixelcut.ai/v1/upscale',
      form,
      {
        headers: {
          ...form.getHeaders(),
          'X-API-KEY': process.env.PIXELCUT_API_KEY,
          'Accept': 'image/*'
        },
        responseType: 'arraybuffer',
        timeout: 120000,
        maxBodyLength: Infinity,
        maxContentLength: Infinity,
        validateStatus: (status) => status >= 200 && status < 500
      }
    );

    console.log('📦 PixelCut status:', pixelcutResponse.status);
    console.log('📦 PixelCut content-type:', pixelcutResponse.headers['content-type']);

    if (pixelcutResponse.status >= 400) {
      const errorText = Buffer.from(pixelcutResponse.data).toString('utf8');
      console.error('❌ PixelCut error response:', errorText);
      return res.status(pixelcutResponse.status).json({
        error: 'PixelCut request failed',
        details: errorText
      });
    }

    const outputBuffer = await sharp(Buffer.from(pixelcutResponse.data))
      .rotate()
      .withMetadata({ density: 300 })
      .png()
      .toBuffer();

    const base64 = outputBuffer.toString('base64');

    return res.json({
      image: `data:image/png;base64,${base64}`
    });
  } catch (error) {
    console.error('❌ Upscale error:', {
      message: error.message,
      status: error.response?.status,
      data: error.response?.data
        ? Buffer.isBuffer(error.response.data)
          ? error.response.data.toString('utf8')
          : error.response.data
        : null
    });

    return res.status(500).json({
      error: 'Upscale failed',
      details: error.message
    });
  }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`✅ MoreTranz Upscaler running on port ${PORT}`);
});