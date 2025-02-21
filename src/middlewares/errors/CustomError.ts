export class CustomError extends Error {
    public statusCode: number;
    public success: boolean;
    public isOperational: boolean;

    constructor(message: string, statusCode: number = 500) {
        super(message);
        this.statusCode = statusCode;
        this.success = false;
        this.isOperational = true; // to distinguish between operational errors and programming bugs
        Error.captureStackTrace(this, this.constructor);
    }
}