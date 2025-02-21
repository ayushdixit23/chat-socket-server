import jwt from "jsonwebtoken";
import { JWT_SECRET_KEY } from "./envConfig.js";

export interface User {
  id: string;
  email: string;
  fullName: string;
  userName: string;
  profilePic: string;
}

export const generateToken = (payload: User): string => {
  return jwt.sign(payload, JWT_SECRET_KEY, { expiresIn: "65d" });
};

// Function to verify a JWT token
export const verifyToken = (token: string): User | null => {
  try {
    const decoded = jwt.verify(token, JWT_SECRET_KEY) as User;
    return decoded;
  } catch (error) {
    return null;
  }
};
