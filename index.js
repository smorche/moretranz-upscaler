const express = require('express');
const multer = require('multer');
const dotenv = require('dotenv');
const cloudinary = require('cloudinary').v2;
const fs = require('fs');
const path = require('path');
const axios = require('axios');
const FormData = require('form-data');

dotenv.config();
const app = express();
const port = process.env.PORT || 3000;

// Multer setup
const upload = multer({ dest: 'uploads/' });

// Serve static frontend
app.use(express.static(path.join(__dirname, 'public')));

// Cloudinary config
cloudinary.config({
  cloud_name: process.env.CLOUDINARY_NAME,
  api_key: process.env.CLOUDINARY_KEY,
  api_secret: process.env.CLOUDINARY_SECRET
});

// API route
app.post('/upscale', upload.single('image'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ success: false, error: 'No image uploaded.' });
    }

    // Upload to Cloudinary
    const cloudResult = await cloudinary.uploader.upload(req.file.path, {
      folder: 'moretranz-upscaler',
    });

    // Send image URL to Claid
    const form = new FormData();
    form.append('image_url', cloudResult.secure_url);
    form.append('operations', JSON.stringify([{ type: 'upscale', scale: 2 }]));

    const response = await axios.post(
      'https://api.claid.ai/v1-beta1/image/edit',
      form,
      {
        headers: {
          ...form.getHeaders(),
          'x-api-key': process.env.CLAID_API_KEY,
        },
        responseType: 'arraybuffer',
      }
    );

    // Convert buffer to base64 image URL
    const base64Image = Buffer.from(response.data).toString('base64');
    const imageUrl = `data:image/jpeg;base64,${base64Image}`;

    // Clean up temp file
    fs.unlinkSync(req.file.path);

    res.json({ success: true, imageUrl });
  } catch (err) {
    console.error('Upscale error:', err.message || err);
    res.status(500).json({ success: false, error: 'Upscaling failed.' });
  }
});

// Catch-all fallback
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'public/index.html'));
});

app.listen(port, () => {
  console.log(`🚀 Server running on http://localhost:${port}`);
});
