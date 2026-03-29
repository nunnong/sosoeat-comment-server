const express = require('express');
const cors = require('cors');
const swaggerUi = require('swagger-ui-express');
const swaggerSpec = require('./src/swagger');
require('dotenv').config();

const meetingsRouter = require('./src/routes/meetings');
const commentsRouter = require('./src/routes/comments');

const app = express();

app.use(cors());
app.use(express.json());

app.use('/api-docs', swaggerUi.serve, swaggerUi.setup(swaggerSpec));

app.use('/meetings', meetingsRouter);
app.use('/comments', commentsRouter);

const PORT = process.env.PORT || 3001;
app.listen(PORT, () => console.log(`서버 실행 중: ${PORT}`));