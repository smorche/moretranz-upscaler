// index.js — MoreTranz Pixelcut Image Upscaler (Updated Endpoint)

const express = require('express');
const multer = require('multer');
const axios = require('axios');
const fs = require('fs');
const path = require('path');
const FormData = require('form-data');
const dotenv = require('dotenv');
dotenv.config();

const app = express();
const port = process.env.PORT || 3000;

app.use(express.static('public'));

// Multer setup
const upload = multer({ dest: 'uploads/' });

app.post('/upscale', upload.single('image'), async (req, res) => {
  try {
    const imagePath = req.file.path;
    const fileStream = fs.createReadStream(imagePath);

    const form = new FormData();
    form.append('image', fileStream);

    const response = await axios.post('https://api.developer.pixelcut.ai/v1/upscale', form, {
      headers: {
        ...form.getHeaders(),
        'x-api-key': process.env.PIXELCUT_API_KEY,
      },
      responseType: 'arraybuffer',
    });

    fs.unlinkSync(imagePath); // Clean up temp file

    const base64Image = Buffer.from(response.data).toString('base64');
    res.json({ image: `data:image/png;base64,${base64Image}` });

  } catch (err) {
    console.error('Upscale error:', err.response?.data || err.message);
    res.status(500).json({ error: 'Upscaling failed.' });
  }
});

// fallback route
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.listen(port, () => {
  console.log(`Server running at http://localhost:${port}`);
});
