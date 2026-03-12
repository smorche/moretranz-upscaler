const express = require('express');
const cors = require('cors');
const multer = require('multer');
const axios = require('axios');
const FormData = require('form-data');
const sharp = require('sharp');
require('dotenv').config();

const app = express();
const upload = multer({ storage: multer.memoryStorage() });

app.use(cors({
  origin: [
    'https://moretranz.com',
    'https://www.moretranz.com'
  ],
  methods: ['GET', 'POST', 'OPTIONS']
}));

app.use(express.static('public'));

app.get('/', (req, res) => {
  res.send('MoreTranz Artwork Enhancer API is running.');
});

app.post('/upscale', upload.single('image'), async (req, res) => {
  try {
    if (!req.file || !req.file.buffer) {
      return res.status(400).json({ error: 'No image uploaded' });
    }

    const requestedPrintWidth = parseFloat(req.body.printWidth || '8');

    if (!requestedPrintWidth || requestedPrintWidth <= 0) {
      return res.status(400).json({ error: 'Invalid print width' });
    }

    const inputMeta = await sharp(req.file.buffer).metadata();
    const originalWidth = inputMeta.width;
    const originalHeight = inputMeta.height;

    if (!originalWidth || !originalHeight) {
      return res.status(400).json({ error: 'Unable to read uploaded image dimensions' });
    }

    const requestedPrintHeight = (originalHeight / originalWidth) * requestedPrintWidth;
    const requiredWidthPx = Math.round(requestedPrintWidth * 300);
    const requiredHeightPx = Math.round(requestedPrintHeight * 300);

    const originalMaxWidth = originalWidth / 300;
    const originalMaxHeight = originalHeight / 300;

    const requestedScale = requiredWidthPx / originalWidth;

    let scale;
    if (requestedScale <= 1) {
      scale = 1;
    } else if (requestedScale <= 2) {
      scale = 2;
    } else {
      scale = 4;
    }

    let processedBuffer;
    let processedWidth = originalWidth;
    let processedHeight = originalHeight;
    let processedMaxWidth = originalMaxWidth;
    let processedMaxHeight = originalMaxHeight;
    let enhancementApplied = 'No upscale needed';

    if (scale === 1) {
      processedBuffer = await sharp(req.file.buffer)
        .rotate()
        .png()
        .withMetadata({ density: 300 })
        .toBuffer();
    } else {
      const form = new FormData();
      form.append('image', req.file.buffer, {
        filename: req.file.originalname || 'upload.png',
        contentType: req.file.mimetype || 'image/png'
      });
      form.append('scale', String(scale));

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

      if (pixelcutResponse.status >= 400) {
        const errorText = Buffer.from(pixelcutResponse.data).toString('utf8');
        return res.status(pixelcutResponse.status).json({
          error: 'PixelCut request failed',
          details: errorText
        });
      }

      const pixelcutBuffer = Buffer.from(pixelcutResponse.data);

      const processedMeta = await sharp(pixelcutBuffer).metadata();
      processedWidth = processedMeta.width;
      processedHeight = processedMeta.height;

      if (!processedWidth || !processedHeight) {
        return res.status(500).json({ error: 'Unable to read enhanced image dimensions' });
      }

      processedMaxWidth = processedWidth / 300;
      processedMaxHeight = processedHeight / 300;
      enhancementApplied = `${scale}x upscale`;

      processedBuffer = await sharp(pixelcutBuffer)
        .rotate()
        .png()
        .withMetadata({ density: 300 })
        .toBuffer();
    }

    let status = 'good';
    let statusTitle = 'Ready for Print';
    let message = `Your artwork is large enough for a ${requestedPrintWidth.toFixed(2)}" print at 300 DPI.`;

    if (scale > 1 && processedWidth >= requiredWidthPx && processedHeight >= requiredHeightPx) {
      status = 'upscaled';
      statusTitle = 'AI Enhanced and Print Ready';
      message = `Your artwork was enhanced with AI and is now large enough for a ${requestedPrintWidth.toFixed(2)}" print at 300 DPI.`;
    } else if (processedWidth < requiredWidthPx || processedHeight < requiredHeightPx) {
      status = 'warning';
      statusTitle = 'Smaller Than Ideal';
      message = `Your file is still smaller than ideal for ${requestedPrintWidth.toFixed(2)}" wide at 300 DPI. Maximum recommended width is ${processedMaxWidth.toFixed(2)}".`;
    }

    const base64 = processedBuffer.toString('base64');

    return res.json({
      image: `data:image/png;base64,${base64}`,
      analysis: {
        status,
        statusTitle,
        message,
        fileName: req.file.originalname || 'upload.png',
        originalWidth,
        originalHeight,
        processedWidth,
        processedHeight,
        originalMaxWidth: originalMaxWidth.toFixed(2),
        originalMaxHeight: originalMaxHeight.toFixed(2),
        processedMaxWidth: processedMaxWidth.toFixed(2),
        processedMaxHeight: processedMaxHeight.toFixed(2),
        requestedPrintWidth: requestedPrintWidth.toFixed(2),
        requestedPrintHeight: requestedPrintHeight.toFixed(2),
        requiredWidthPx,
        requiredHeightPx,
        scale,
        enhancementApplied
      }
    });
  } catch (error) {
    return res.status(500).json({
      error: 'Upscale failed',
      details: error.message
    });
  }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`MoreTranz Upscaler running on port ${PORT}`);
});