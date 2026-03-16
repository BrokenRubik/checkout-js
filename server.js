const express = require('express');
const app = require('./app');

const PORT = process.env.PORT || 3000;

app.use(express.static('dist'));

app.listen(PORT, () => {
    console.log(`Server running at http://localhost:${PORT}`);
});
