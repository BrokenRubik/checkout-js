const express = require('express');
const app = require('./app');

const PORT = process.env.PORT || 3000;

app.use(express.static('build'));

// En src/server.ts, actualizar CORS:
app.use((req, res, next) => {
  res.header('Access-Control-Allow-Origin', process.env.STOREURL || '*');
  res.header('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
  res.header('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  // Permitir iframe
  res.header('X-Frame-Options', 'ALLOWALL');
  res.header('Content-Security-Policy', `frame-ancestors 'self' ${process.env.STOREURL}`);

  if (req.method === 'OPTIONS') {
    return res.sendStatus(200);
  }
  return next();
});

app.listen(PORT, () => {
    console.log(`Server running at http://localhost:${PORT}`);
});
