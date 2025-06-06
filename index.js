const express = require('express');
const multer = require('multer');
const fs = require('fs');
const axios = require('axios');
const FormData = require('form-data');
require('dotenv').config();

const app = express();
const upload = multer({ dest: 'uploads/' });

app.use(express.static('public'));

app.get('/', (req, res) => {
  res.sendFile(__dirname + '/public/index.html');
});

app.post('/upscale', upload.single('image_file'), async (req, res) => {
  const imagePath = req.file?.path;

  if (!imagePath) {
    return res.status(400).json({ error: 'No image file received' });
  }

  try {
    const form = new FormData();
    form.append('image', fs.createReadStream(imagePath));
    form.append('operations', JSON.stringify([
      { type: 'upscale', scale: 2 }
    ]));

    const response = await axios.post(
      'https://api.claid.ai/v1/process',
      form,
      {
        headers: {
          ...form.getHeaders(),
          'x-api-key': process.env.CLAID_API_KEY,
        },
        responseType: 'arraybuffer',
      }
    );

    fs.unlinkSync(imagePath);
    res.set('Content-Type', 'image/png');
    res.send(response.data);

  } catch (error) {
    console.error('Upscaling failed:', error.message);
    if (error.response) {
      console.error('Status:', error.response.status);
      console.error('Data:', error.response.data);
    }
    res.status(500).json({ error: 'Upscaling failed. Please try again.' });
  }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`✅ MoreTranz Upscaler running at http://localhost:${PORT}`);
});
