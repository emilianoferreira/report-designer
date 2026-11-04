// Default Angular development backend. Relative /api URLs work behind a production reverse proxy too.
module.exports = {
  '/api': {
    target: process.env.ASPNETCORE_API_URL || 'http://127.0.0.1:5080',
    secure: false,
    changeOrigin: true,
  },
};
