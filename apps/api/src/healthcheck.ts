import http from 'node:http';

const portArg = process.argv[2];

if (!portArg) {
  process.exit(1);
}

const port = Number(portArg);

const request = http.get(
  { host: '127.0.0.1', port, path: '/health', timeout: 3000 },
  (response) => {
    if (response.statusCode === 200) {
      process.exit(0);
    }
    process.exit(1);
  },
);

request.on('error', () => process.exit(1));
request.on('timeout', () => {
  request.destroy();
  process.exit(1);
});
