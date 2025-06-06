const express = require('express');
const multer = require('multer');
const axios = require('axios');
const FormData = require('form-data');
const cors = require('cors');
const fs = require('fs');
const path = require('path');

const app = express();
const port = process.env.PORT || 3000;

const upload = multer({ dest: 'uploads/' });
app.use(cors());
app.use(express.static('public'));

const CLAID_API_KEY = process.env.CLAID_API_KEY || 'YOUR_CLAID_API_KEY';

app.post('/upscale', upload.single('image_file'), async (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'No file uploaded' });

  try {
    const formData = new FormData();
    formData.append('image_file', fs.createReadStream(req.file.path));
    formData.append('operations', JSON.stringify([
      {
        operation: 'upscale',
        parameters: { scale: 2 }
      }
    ]));

    const response = await axios.post('https://api.claid.ai/v1/image/edit', formData, {
      headers: {
        ...formData.getHeaders(),
        'x-api-key': CLAID_API_KEY
      },
      responseType: 'stream'
    });

    res.setHeader('Content-Type', response.headers['content-type']);
    response.data.pipe(res);
  } catch (error) {
    console.error(error.response ? error.response.data : error.message);
    res.status(500).json({ error: 'Failed to upscale image' });
  } finally {
    fs.unlink(req.file.path, () => {});
  }
});

app.listen(port, () => {
  console.log(`Server is running on http://localhost:${port}`);
});