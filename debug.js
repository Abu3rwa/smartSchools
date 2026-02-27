import mongoose from 'mongoose';
import dotenv from 'dotenv';
dotenv.config();

mongoose.connect('mongodb+srv://3bdulhafeezsd_db_user:8RjhpkWb4aVnPyif@cluster0.glgpmmp.mongodb.net/test?appName=Cluster0').then(async () => {
    console.log('connected');

    // Find all assignments, populate necessary fields
    const assigns = await mongoose.connection.db.collection('teacherperiodassignments').aggregate([
        {
            $lookup: {
                from: 'users',
                localField: 'teacher',
                foreignField: '_id',
                as: 'teacherDoc'
            }
        },
        {
            $lookup: {
                from: 'classes',
                localField: 'class',
                foreignField: '_id',
                as: 'classDoc'
            }
        },
        {
            $lookup: {
                from: 'rooms',
                localField: 'room',
                foreignField: '_id',
                as: 'roomDoc'
            }
        },
        {
            $lookup: {
                from: 'timetableperiods',
                localField: 'period',
                foreignField: '_id',
                as: 'periodDoc'
            }
        }
    ]).toArray();

    // Filter to find where teacher is Abdulhafeez
    for (const a of assigns) {
        if (a.teacherDoc && a.teacherDoc[0] && a.teacherDoc[0].firstName === 'Abdulhafeez') {
            const periodDoc = a.periodDoc ? a.periodDoc[0] : null;
            console.log('Assignment:', {
                id: a._id.toString(),
                teacher: a.teacherDoc[0].firstName + ' ' + a.teacherDoc[0].lastName,
                class: a.classDoc[0] ? a.classDoc[0].name : 'none',
                room: a.roomDoc[0] ? a.roomDoc[0].name : 'none',
                period: periodDoc ? periodDoc.name : 'none',
                periodId: a.period.toString(),
                startTime: periodDoc ? periodDoc.startTime : 'none',
                days: a.daysOfWeek
            });
        }
    }

    process.exit(0);
}).catch(console.error);
