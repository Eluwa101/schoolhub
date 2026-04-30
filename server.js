const app = require('./app');

const PORT = process.env.PORT || 3000;

const server = app.listen(PORT, () => {
  console.log(`SchoolHub running on http://localhost:${PORT}`);
  console.log(`Environment: ${process.env.NODE_ENV || 'development'}`);
});

server.on('error', (err) => {
  if (err.code === 'EADDRINUSE') {
    console.error(`Port ${PORT} is already in use.`);
  } else {
    console.error('Server error:', err);
  }
  process.exit(1);
});

process.on('SIGTERM', () => {
  server.close(() => {
    console.log('Server gracefully shut down.');
    process.exit(0);
  });
});
