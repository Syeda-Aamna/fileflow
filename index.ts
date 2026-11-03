import express from "express";
import { createApp } from "./server/app";

const app = createApp(express());

export default app;
