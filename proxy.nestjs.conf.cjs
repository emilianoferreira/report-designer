// Explicit rollback profile: npm run start:nestjs.
module.exports = {
  '/api': {
    target: process.env.NESTJS_API_URL || 'http://127.0.0.1:3000',
    secure: false,
    changeOrigin: true,
  },
};
