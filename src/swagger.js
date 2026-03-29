const swaggerJsdoc = require('swagger-jsdoc');

const options = {
  definition: {
    openapi: '3.0.0',
    info: {
      title: 'Sosoeat Comment Server API',
      version: '1.0.0',
      description: '소소잇 댓글 서버 API 문서',
    },
    servers: [
      {
        url: 'http://localhost:3001',
        description: '로컬 개발 서버',
      },
      {
        url: 'https://sosoeat-comment.up.railway.app',
        description: '배포 서버',
      },
    ],
    components: {
      securitySchemes: {
        bearerAuth: {
          type: 'http',
          scheme: 'bearer',
          bearerFormat: 'JWT',
        },
      },
    },
  },
  apis: ['./src/routes/*.js'],
};

module.exports = swaggerJsdoc(options);