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
app.use(express.json());

const TARGET_DPI = 300;
const PIXELCUT_URL = 'https://api.developer.pixelcut.ai/v1/upscale';

function roundTo(value, decimals = 2) {
  return Number(Math.round(value + 'e' + decimals) + 'e-' + decimals);
}

function getPrintWidthFromPixels(pixelWidth, dpi = TARGET_DPI) {
  return pixelWidth / dpi;
}

function determineUpscaleOption(originalWidthPx, desiredPrintWidthInches) {
  const requiredWidthPx = Math.ceil(desiredPrintWidthInches * TARGET_DPI);

  if (originalWidthPx >= requiredWidthPx) {
    return {
      selectedScale: 1,
      requiredWidthPx,
      reason: 'Original image already meets target print width at 300 DPI'
    };
  }

  if (originalWidthPx * 2 >= requiredWidthPx) {
    return {
      selectedScale: 2,
      requiredWidthPx,
      reason: '2x upscale is sufficient for target print width at 300 DPI'
    };
  }

  return {
    selectedScale: 4,
    requiredWidthPx,
    reason: '4x upscale selected because 2x is not sufficient'
  };
}

async function callPixelCutUpscale(buffer, originalname, mimetype, scale) {
  const form = new FormData();
  form.append('image', buffer, {
    filename: originalname || 'upload.png',
    contentType: mimetype || 'image/png'
  });
  form.append('scale', String(scale));

  const response = await axios.post(PIXELCUT_URL, form, {
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
  });

  if (response.status >= 400) {
    const errorText = Buffer.from(response.data).toString('utf8');
    throw new Error(`PixelCut request failed (${response.status}): ${errorText}`);
  }

  return Buffer.from(response.data);
}

app.post('/upscale', upload.single('image'), async (req, res) => {
  try {
    console.log('📥 Incoming request to /upscale');

    if (!req.file || !req.file.buffer) {
      return res.status(400).json({ error: 'No image uploaded' });
    }

    const desiredPrintWidth = parseFloat(req.body.printWidth);
    if (!desiredPrintWidth || desiredPrintWidth <= 0) {
      return res.status(400).json({ error: 'A valid print width in inches is required' });
    }

    console.log('✅ File details:', {
      originalname: req.file.originalname,
      mimetype: req.file.mimetype,
      size: req.file.size
    });

    const inputMeta = await sharp(req.file.buffer).metadata();

    if (!inputMeta.width || !inputMeta.height) {
      return res.status(400).json({ error: 'Unable to read uploaded image dimensions' });
    }

    const originalWidthPx = inputMeta.width;
    const originalHeightPx = inputMeta.height;
    const originalAspectRatio = originalWidthPx / originalHeightPx;

    const originalMaxPrintWidth = getPrintWidthFromPixels(originalWidthPx);
    const originalMaxPrintHeight = getPrintWidthFromPixels(originalHeightPx);

    const upscaleDecision = determineUpscaleOption(originalWidthPx, desiredPrintWidth);
    const { selectedScale, requiredWidthPx, reason } = upscaleDecision;

    console.log('📐 Print analysis:', {
      desiredPrintWidth,
      requiredWidthPx,
      originalWidthPx,
      selectedScale,
      reason
    });

    let workingBuffer = req.file.buffer;
    let upscaleApplied = false;

    if (selectedScale > 1) {
      console.log(`📤 Sending to PixelCut with scale ${selectedScale}x...`);
      workingBuffer = await callPixelCutUpscale(
        req.file.buffer,
        req.file.originalname,
        req.file.mimetype,
        selectedScale
      );
      upscaleApplied = true;
    } else {
      console.log('ℹ️ No PixelCut upscale needed');
    }

    const processedMeta = await sharp(workingBuffer).metadata();

    if (!processedMeta.width || !processedMeta.height) {
      return res.status(500).json({ error: 'Unable to read processed image dimensions' });
    }

    const finalWidthPx = processedMeta.width;
    const finalHeightPx = processedMeta.height;

    const maxPrintWidthAt300 = getPrintWidthFromPixels(finalWidthPx);
    const maxPrintHeightAt300 = getPrintWidthFromPixels(finalHeightPx);

    const meetsTarget = finalWidthPx >= requiredWidthPx;

    const targetHeightPx = Math.round(requiredWidthPx / originalAspectRatio);
    const recommendedPrintHeight = roundTo(desiredPrintWidth / originalAspectRatio, 2);

    const outputBuffer = await sharp(workingBuffer)
      .rotate()
      .png()
      .withMetadata({ density: TARGET_DPI })
      .toBuffer();

    const base64 = outputBuffer.toString('base64');

    return res.json({
      image: `data:image/png;base64,${base64}`,
      analysis: {
        targetDpi: TARGET_DPI,
        desiredPrintWidthInches: desiredPrintWidth,
        recommendedPrintHeightInches: recommendedPrintHeight,
        requiredWidthPx,
        targetHeightPx,
        original: {
          widthPx: originalWidthPx,
          heightPx: originalHeightPx,
          maxPrintWidthAt300Dpi: roundTo(originalMaxPrintWidth),
          maxPrintHeightAt300Dpi: roundTo(originalMaxPrintHeight)
        },
        processing: {
          upscaleApplied,
          selectedScale,
          reason
        },
        result: {
          widthPx: finalWidthPx,
          heightPx: finalHeightPx,
          maxPrintWidthAt300Dpi: roundTo(maxPrintWidthAt300),
          maxPrintHeightAt300Dpi: roundTo(maxPrintHeightAt300),
          meetsRequestedPrintWidth: meetsTarget
        },
        message: meetsTarget
          ? `Your file is suitable for printing at ${desiredPrintWidth}" wide at 300 DPI.`
          : `Your file is still smaller than ideal for ${desiredPrintWidth}" wide at 300 DPI. Maximum recommended width is ${roundTo(maxPrintWidthAt300)}".`
      }
    });
  } catch (error) {
    console.error('❌ Upscale error:', error.message);

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