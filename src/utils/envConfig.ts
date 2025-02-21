import dotenv from 'dotenv';

dotenv.config();

export const PORT = process.env.PORT
export const NODE_ENV = process.env.NODE_ENV
export const MONGO_URI = process.env.MONGO_URI || ""
export const JWT_SECRET_KEY = process.env.JWT_SECRET_KEY||""