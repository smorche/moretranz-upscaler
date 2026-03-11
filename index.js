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
    console.log('Incoming request to /upscale');

    if (!req.file || !req.file.buffer) {
      return res.status(400).json({ error: 'No image uploaded' });
    }

    const printWidth = parseFloat(req.body.printWidth || 8);

    if (!printWidth || printWidth <= 0) {
      return res.status(400).json({ error: 'Invalid print width' });
    }

    // Read original image metadata
    const originalMeta = await sharp(req.file.buffer).metadata();

    const originalWidth = originalMeta.width;
    const originalHeight = originalMeta.height;

    if (!originalWidth || !originalHeight) {
      return res.status(400).json({ error: 'Unable to read uploaded image dimensions' });
    }

    // Original print size at 300 DPI
    const originalPrintWidth = originalWidth / 300;
    const originalPrintHeight = originalHeight / 300;

    // Maintain aspect ratio
    const aspectRatio = originalHeight / originalWidth;
    const requestedPrintHeight = printWidth * aspectRatio;

    // Required pixels for requested print size
    const requiredWidthPx = Math.round(printWidth * 300);
    const requiredHeightPx = Math.round(requestedPrintHeight * 300);

    // Determine upscale factor
    const rawScale = requiredWidthPx / originalWidth;

    let scale;
    if (rawScale <= 1) scale = 1;
    else if (rawScale <= 2) scale = 2;
    else scale = 4;

    console.log('Upscale factor:', scale);

    let processedInputBuffer;

    // Skip PixelCut if upscale not needed
    if (scale === 1) {
      processedInputBuffer = req.file.buffer;
    } else {
      const form = new FormData();

      form.append('image', req.file.buffer, {
        filename: req.file.originalname || 'upload.png',
        contentType: req.file.mimetype || 'image/png'
      });

      form.append('scale', scale.toString());

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

      processedInputBuffer = Buffer.from(pixelcutResponse.data);
    }

    // Convert to PNG with 300 DPI metadata
    const outputBuffer = await sharp(processedInputBuffer)
      .rotate()
      .withMetadata({ density: 300 })
      .png()
      .toBuffer();

    // Read processed image metadata
    const processedMeta = await sharp(outputBuffer).metadata();

    const processedWidth = processedMeta.width;
    const processedHeight = processedMeta.height;

    // Max printable size
    const maxPrintWidth = processedWidth / 300;
    const maxPrintHeight = processedHeight / 300;

    const analysis = {
      originalWidth,
      originalHeight,
      originalPrintWidth: originalPrintWidth.toFixed(2),
      originalPrintHeight: originalPrintHeight.toFixed(2),
      processedWidth,
      processedHeight,
      maxPrintWidth: maxPrintWidth.toFixed(2),
      maxPrintHeight: maxPrintHeight.toFixed(2),
      requestedPrintWidth: printWidth.toFixed(2),
      requestedPrintHeight: requestedPrintHeight.toFixed(2),
      requiredWidthPx,
      requiredHeightPx,
      scaleApplied: scale
    };

    const base64 = outputBuffer.toString('base64');

    res.json({
      image: `data:image/png;base64,${base64}`,
      analysis
    });
  } catch (error) {
    console.error('Upscale error:', error.message);

    res.status(500).json({
      error: 'Upscale failed',
      details: error.message
    });
  }
});

const PORT = process.env.PORT || 3000;

app.listen(PORT, () => {
  console.log(`MoreTranz Upscaler running on port ${PORT}`);
});