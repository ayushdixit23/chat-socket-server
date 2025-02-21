import mongoose from "mongoose";

/**
 * Function to connect to MongoDB
 * @param dbUrl - MongoDB connection URL
 * @returns {Promise<void>} - Resolves when connected, rejects on error
 */
const connectDb = async (dbUrl: string): Promise<void> => {
    try {
        // Connect to MongoDB using the provided dbUrl
        await mongoose.connect(dbUrl);
        console.log("MongoDB connected successfully!");
    } catch (error) {
        console.error("Error connecting to MongoDB:", error);
        process.exit(1); // Exit the process if unable to connect
    }
};

export default connectDb;