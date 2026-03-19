import mongoose from 'mongoose';
import dotenv from 'dotenv';
import Grade from '../models/Grade.js';
import Teacher from '../models/Teacher.js';

dotenv.config();

const migrate = async () => {
    try {
        await mongoose.connect(process.env.MONGODB_URI);
        console.log('Connected to MongoDB');

        const grades = await Grade.find({}).lean();
        console.log(`Found ${grades.length} grades to process.`);

        let updatedCount = 0;
        let skipCount = 0;
        let errorCount = 0;

        for (const grade of grades) {
            // Check if teacher is a Teacher ID
            const teacherDoc = await Teacher.findById(grade.teacher).lean();
            if (teacherDoc) {
                // It was a Teacher ID, replace with User ID
                await Grade.updateOne({ _id: grade._id }, { $set: { teacher: teacherDoc.user } });
                updatedCount++;
            } else {
                // If not found in Teacher collection, it might already be a User ID or an invalid ID
                skipCount++;
            }
        }

        console.log(`Migration complete. Updated: ${updatedCount}, Skipped: ${skipCount}, Errors: ${errorCount}`);
        process.exit(0);
    } catch (err) {
        console.error('Migration failed:', err);
        process.exit(1);
    }
};

migrate();