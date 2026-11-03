import express from "express";
import vercelHandler from "./server/vercel-handler.mjs";

const app = express();
app.use(vercelHandler);

export default app;
