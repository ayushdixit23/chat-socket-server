import { NextFunction, Request, Response } from "express";

// asyncHandler to handle async errors properly
const asyncHandler = (fn: Function) => (req: Request, res: Response, next: NextFunction) => {
  Promise.resolve(fn(req, res, next)).catch(next); // Catch asynchronous errors and forward to next middleware
};

export default asyncHandler;
