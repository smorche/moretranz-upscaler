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

    if (!req.file || !req.file.buffer) {
      return res.status(400).json({ error: 'No image uploaded' });
    }

    const printWidth = parseFloat(req.body.printWidth || '8');

    if (!printWidth || printWidth <= 0) {
      return res.status(400).json({ error: 'Invalid print width' });
    }

    const inputMeta = await sharp(req.file.buffer).metadata();

    if (!inputMeta.width || !inputMeta.height) {
      return res.status(400).json({ error: 'Could not read uploaded image dimensions' });
    }

    const originalWidth = inputMeta.width;
    const originalHeight = inputMeta.height;
    const aspectRatio = originalHeight / originalWidth;

    const requiredWidthPx = Math.round(printWidth * 300);
    const requiredHeightPx = Math.round(requiredWidthPx * aspectRatio);

    const originalMaxPrintWidth = originalWidth / 300;
    const originalMaxPrintHeight = originalHeight / 300;

    let scale = 2;
    const neededScale = requiredWidthPx / originalWidth;

    if (neededScale > 2) {
      scale = 4;
    }

    const maxPrintWidthAt4x = (originalWidth * 4) / 300;
    const maxPrintHeightAt4x = (originalHeight * 4) / 300;

    console.log('✅ Upload metadata:', {
      originalWidth,
      originalHeight,
      printWidth,
      requiredWidthPx,
      neededScale,
      selectedScale: scale
    });

    const form = new FormData();
    form.append('image', req.file.buffer, {
      filename: req.file.originalname || 'upload.png',
      contentType: req.file.mimetype || 'image/png'
    });
    form.append('scale', String(scale));

    console.log(`📤 Sending to PixelCut with ${scale}x upscale...`);

    const pixelcutResponse = await axios.post(
      'https://api.developer.pixelcut.ai/v1/upscale',
      form,
      {
        headers: {
          ...form.getHeaders(),
          'X-API-KEY': process.env.PIXELCUT_API_KEY,
          Accept: 'image/*'
        },
        responseType: 'arraybuffer',
        timeout: 120000,
        maxBodyLength: Infinity,
        maxContentLength: Infinity,
        validateStatus: (status) => status >= 200 && status < 500
      }
    );

    if (pixelcutResponse.status >= 400) {
      const errorText = Buffer.from(pixelcutResponse.data).toString('utf8');
      console.error('❌ PixelCut error:', errorText);

      return res.status(pixelcutResponse.status).json({
        error: 'PixelCut request failed',
        details: errorText
      });
    }

    const pixelcutBuffer = Buffer.from(pixelcutResponse.data);
    const processedMeta = await sharp(pixelcutBuffer).metadata();

    if (!processedMeta.width || !processedMeta.height) {
      return res.status(500).json({ error: 'Could not read processed image dimensions' });
    }

    const processedWidth = processedMeta.width;
    const processedHeight = processedMeta.height;

    const processedMaxPrintWidth = processedWidth / 300;
    const processedMaxPrintHeight = processedHeight / 300;

    let message = `Your artwork has been enhanced and prepared as a 300 DPI PNG.`;

    if (processedWidth < requiredWidthPx) {
      message = `Your file is still smaller than ideal for ${printWidth}" wide at 300 DPI. Maximum recommended width is ${processedMaxPrintWidth.toFixed(2)}".`;
    }

    const outputBuffer = await sharp(pixelcutBuffer)
      .rotate()
      .withMetadata({ density: 300 })
      .png()
      .toBuffer();

    const base64 = outputBuffer.toString('base64');

    return res.json({
      image: `data:image/png;base64,${base64}`,
      analysis: {
        message,
        originalWidth,
        originalHeight,
        originalMaxPrintWidth: originalMaxPrintWidth.toFixed(2),
        originalMaxPrintHeight: originalMaxPrintHeight.toFixed(2),
        selectedScale: `${scale}x`,
        processedWidth,
        processedHeight,
        processedMaxPrintWidth: processedMaxPrintWidth.toFixed(2),
        processedMaxPrintHeight: processedMaxPrintHeight.toFixed(2),
        requestedPrintWidth: printWidth.toFixed(2),
        requestedPrintHeight: (printWidth * aspectRatio).toFixed(2),
        requiredWidthPx,
        requiredHeightPx
      }
    });
  } catch (error) {
    const details = error.response?.data
      ? Buffer.isBuffer(error.response.data)
        ? error.response.data.toString('utf8')
        : error.response.data
      : error.message;

    console.error('❌ Upscale error:', details);

    return res.status(500).json({
      error: 'Upscale failed',
      details
    });
  }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`✅ MoreTranz Upscaler running on port ${PORT}`);
});