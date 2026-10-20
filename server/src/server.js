const config = require('./config');
const app = require('./app');
app.listen(config.port, () => console.log(`Universal POS running at http://localhost:${config.port}`));
