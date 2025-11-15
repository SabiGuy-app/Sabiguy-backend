const express = require ('express');
const app = express();
const dotenv = require('dotenv');
const connectToDB = require ('./utils/db')
const { swaggerUi, swaggerSpec } = require ('./src/config/swagger');

app.use (express.json());
const cors = require ("cors");


dotenv.config()
app.use(
  cors({
    origin: ["http://localhost:5173", "https://sabiguy-frontend.vercel.app"],
    methods: ["GET", "POST", "PUT", "PATCH", "DELETE"],
    credentials: true,
  })
);

const routes = [
   { path: '/auth', file: './routes/auth'},
   { path: '/file', file: './routes/uploadFile'},
   { path: '/provider', file: './routes/provider'},
   { path: '/users', file: './routes/users'},



];

routes.forEach(route => {
  app.use(`/api/v1${route.path}`, require(route.file));
});

app.use("/api-docs", swaggerUi.serve, swaggerUi.setup(swaggerSpec));


Port = process.env.PORT

app.listen (Port, () => {
   console.log(`Server is running on port ${Port}`)
});

connectToDB();