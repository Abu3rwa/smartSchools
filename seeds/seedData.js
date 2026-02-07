import mongoose from 'mongoose';
import dotenv from 'dotenv';
import bcrypt from 'bcryptjs';

// Import models
import User from '../models/User.js';
import Teacher from '../models/Teacher.js';
import Student from '../models/Student.js';
import Class from '../models/Class.js';
import Subject from '../models/Subject.js';
import Grade from '../models/Grade.js';
import School from '../models/School.js';

dotenv.config();

const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://localhost:27017/gradebook';

const seedData = async () => {
    try {
        await mongoose.connect(MONGODB_URI);
        console.log('✅ Connected to MongoDB');

        // Clear existing data
        const skipOpt = { skipTenantFilter: true };
        await Promise.all([
            User.deleteMany({}).setOptions(skipOpt),
            Teacher.deleteMany({}).setOptions(skipOpt),
            Student.deleteMany({}).setOptions(skipOpt),
            Class.deleteMany({}).setOptions(skipOpt),
            Subject.deleteMany({}).setOptions(skipOpt),
            Grade.deleteMany({}).setOptions(skipOpt),
            School.deleteMany({})
        ]);
        console.log('🗑️  Cleared existing data');

        // Create Default School
        const school = await School.create({
            name: 'Demo School',
            slug: 'demo',
            contact: {
                adminName: 'System Admin',
                adminEmail: 'admin@gradebook.com'
            },
            subscription: { status: 'active', plan: 'enterprise' }
        });
        const schoolId = school._id;
        console.log('🏫 School created:', school.name);

        // Create Admin User
        const adminUser = await User.create({
            email: 'admin@gradebook.com',
            password: 'Admin@123',
            firstName: 'System',
            lastName: 'Admin',
            role: 'admin',
            school: schoolId
        });
        console.log('👤 Admin user created');

        // Create Subjects
        const subjects = await Subject.insertMany([
            { school: schoolId, name: 'Mathematics', code: 'MATH', description: 'Core mathematics', dailyMaxMarks: 10, maxMarks: 100, applicableGrades: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12] },
            { school: schoolId, name: 'English', code: 'ENG', description: 'English language and literature', dailyMaxMarks: 10, maxMarks: 100, applicableGrades: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12] },
            { school: schoolId, name: 'Science', code: 'SCI', description: 'General science', dailyMaxMarks: 10, maxMarks: 100, applicableGrades: [1, 2, 3, 4, 5, 6, 7] },
            { school: schoolId, name: 'Physics', code: 'PHY', description: 'Physics for senior grades', dailyMaxMarks: 10, maxMarks: 100, applicableGrades: [8, 9, 10, 11, 12] },
            { school: schoolId, name: 'Chemistry', code: 'CHEM', description: 'Chemistry for senior grades', dailyMaxMarks: 10, maxMarks: 100, applicableGrades: [8, 9, 10, 11, 12] },
            { school: schoolId, name: 'Biology', code: 'BIO', description: 'Life sciences', dailyMaxMarks: 10, maxMarks: 100, applicableGrades: [8, 9, 10, 11, 12] },
            { school: schoolId, name: 'History', code: 'HIST', description: 'History and social studies', dailyMaxMarks: 10, maxMarks: 100, applicableGrades: [4, 5, 6, 7, 8, 9, 10, 11, 12] },
            { school: schoolId, name: 'Geography', code: 'GEO', description: 'Geography', dailyMaxMarks: 10, maxMarks: 100, applicableGrades: [4, 5, 6, 7, 8, 9, 10, 11, 12] },
            { school: schoolId, name: 'Computer Science', code: 'CS', description: 'Information technology', dailyMaxMarks: 10, maxMarks: 100, applicableGrades: [6, 7, 8, 9, 10, 11, 12] },
            { school: schoolId, name: 'Physical Education', code: 'PE', description: 'Sports and fitness', dailyMaxMarks: 10, maxMarks: 50, type: 'extra', applicableGrades: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12] }
        ]);
        console.log('📚 Subjects created:', subjects.length);

        // Create Teacher Users and Profiles
        const teacherData = [
            { firstName: 'John', lastName: 'Smith', email: 'john.smith@gradebook.com', employeeId: 'TCH001', subjects: ['MATH', 'PHY'] },
            { firstName: 'Sarah', lastName: 'Johnson', email: 'sarah.johnson@gradebook.com', employeeId: 'TCH002', subjects: ['ENG', 'HIST'] },
            { firstName: 'Michael', lastName: 'Williams', email: 'michael.williams@gradebook.com', employeeId: 'TCH003', subjects: ['SCI', 'BIO', 'CHEM'] },
            { firstName: 'Emily', lastName: 'Brown', email: 'emily.brown@gradebook.com', employeeId: 'TCH004', subjects: ['MATH', 'CS'] },
            { firstName: 'David', lastName: 'Davis', email: 'david.davis@gradebook.com', employeeId: 'TCH005', subjects: ['GEO', 'HIST'] }
        ];

        const teachers = [];
        for (const t of teacherData) {
            const user = await User.create({
                email: t.email,
                password: 'Teacher@123',
                firstName: t.firstName,
                lastName: t.lastName,
                role: 'teacher',
                school: schoolId
            });

            const subjectIds = subjects.filter(s => t.subjects.includes(s.code)).map(s => s._id);

            const teacher = await Teacher.create({
                school: schoolId,
                user: user._id,
                employeeId: t.employeeId,
                department: 'General',
                qualification: 'B.Ed',
                subjects: subjectIds
            });
            teachers.push(teacher);
        }
        console.log('👨‍🏫 Teachers created:', teachers.length);

        // Create Classes
        const classes = await Class.insertMany([
            { school: schoolId, name: 'Grade 8-A', grade: 8, section: 'A', academicYear: '2025-2026', classTeacher: teachers[0]._id },
            { school: schoolId, name: 'Grade 8-B', grade: 8, section: 'B', academicYear: '2025-2026', classTeacher: teachers[1]._id },
            { school: schoolId, name: 'Grade 9-A', grade: 9, section: 'A', academicYear: '2025-2026', classTeacher: teachers[2]._id },
            { school: schoolId, name: 'Grade 10-A', grade: 10, section: 'A', academicYear: '2025-2026', classTeacher: teachers[3]._id },
            { school: schoolId, name: 'Grade 10-B', grade: 10, section: 'B', academicYear: '2025-2026', classTeacher: teachers[4]._id }
        ]);
        console.log('🏫 Classes created:', classes.length);

        // Assign subjects to classes
        const mathSubject = subjects.find(s => s.code === 'MATH');
        const engSubject = subjects.find(s => s.code === 'ENG');
        const phySubject = subjects.find(s => s.code === 'PHY');
        const chemSubject = subjects.find(s => s.code === 'CHEM');
        const bioSubject = subjects.find(s => s.code === 'BIO');

        for (const cls of classes) {
            cls.subjects = [
                { subject: mathSubject._id, teacher: teachers[0]._id },
                { subject: engSubject._id, teacher: teachers[1]._id },
                { subject: phySubject._id, teacher: teachers[0]._id },
                { subject: chemSubject._id, teacher: teachers[2]._id },
                { subject: bioSubject._id, teacher: teachers[2]._id }
            ];
            await cls.save();

            // Update teacher assignments
            teachers[0].assignedClasses.push({ class: cls._id, subject: mathSubject._id });
            teachers[0].assignedClasses.push({ class: cls._id, subject: phySubject._id });
            teachers[1].assignedClasses.push({ class: cls._id, subject: engSubject._id });
            teachers[2].assignedClasses.push({ class: cls._id, subject: chemSubject._id });
            teachers[2].assignedClasses.push({ class: cls._id, subject: bioSubject._id });
        }

        for (const teacher of teachers) {
            await teacher.save();
        }

        // Create Students
        const studentNames = [
            { firstName: 'Alice', lastName: 'Anderson', gender: 'female' },
            { firstName: 'Bob', lastName: 'Baker', gender: 'male' },
            { firstName: 'Charlie', lastName: 'Clark', gender: 'male' },
            { firstName: 'Diana', lastName: 'Davis', gender: 'female' },
            { firstName: 'Ethan', lastName: 'Evans', gender: 'male' },
            { firstName: 'Fiona', lastName: 'Fisher', gender: 'female' },
            { firstName: 'George', lastName: 'Garcia', gender: 'male' },
            { firstName: 'Hannah', lastName: 'Harris', gender: 'female' },
            { firstName: 'Ian', lastName: 'Irwin', gender: 'male' },
            { firstName: 'Julia', lastName: 'Jones', gender: 'female' }
        ];

        const students = [];
        let studentIndex = 1;

        for (const cls of classes) {
            for (let i = 0; i < 10; i++) {
                const nameData = studentNames[i];
                const student = await Student.create({
                    school: schoolId,
                    studentId: `STU2025${String(studentIndex).padStart(4, '0')}`,
                    firstName: nameData.firstName,
                    lastName: nameData.lastName,
                    dateOfBirth: new Date(2010 + (Math.floor(Math.random() * 4)), Math.floor(Math.random() * 12), Math.floor(Math.random() * 28) + 1),
                    gender: nameData.gender,
                    currentClass: cls._id,
                    academicYear: '2025-2026',
                    parentInfo: {
                        fatherName: `Mr. ${nameData.lastName}`,
                        fatherPhone: `+27${Math.floor(Math.random() * 900000000) + 100000000}`,
                        fatherEmail: `parent.${nameData.lastName.toLowerCase()}@email.com`,
                        motherName: `Mrs. ${nameData.lastName}`,
                        primaryContact: 'father'
                    },
                    address: {
                        city: 'Johannesburg',
                        state: 'Gauteng',
                        country: 'South Africa'
                    }
                });
                students.push(student);
                studentIndex++;
            }
        }
        console.log('🎓 Students created:', students.length);

        // Create Sample Grades (Daily classwork for current month)
        const grades = [];
        const today = new Date();
        const currentMonth = today.getMonth() + 1;

        for (const student of students.slice(0, 20)) { // First 20 students for demo
            const studentClass = classes.find(c => c._id.toString() === student.currentClass.toString());

            // Add daily grades for last 10 days
            for (let day = 1; day <= 10; day++) {
                const gradeDate = new Date(today.getFullYear(), today.getMonth(), day);

                // Math grades
                grades.push({
                    school: schoolId,
                    student: student._id,
                    subject: mathSubject._id,
                    class: studentClass._id,
                    teacher: teachers[0]._id,
                    academicYear: '2025-2026',
                    gradeType: 'daily',
                    date: gradeDate,
                    marks: Math.floor(Math.random() * 4) + 6, // 6-10
                    maxMarks: 10,
                    title: 'Classwork',
                    month: currentMonth,
                    semester: currentMonth >= 8 ? 1 : 2
                });

                // English grades
                grades.push({
                    school: schoolId,
                    student: student._id,
                    subject: engSubject._id,
                    class: studentClass._id,
                    teacher: teachers[1]._id,
                    academicYear: '2025-2026',
                    gradeType: 'daily',
                    date: gradeDate,
                    marks: Math.floor(Math.random() * 4) + 6,
                    maxMarks: 10,
                    title: 'Classwork',
                    month: currentMonth,
                    semester: currentMonth >= 8 ? 1 : 2
                });
            }
        }

        await Grade.insertMany(grades);
        console.log('📊 Sample grades created:', grades.length);

        console.log('\n✅ Seed data completed successfully!\n');
        console.log('📋 Login Credentials:');
        console.log('────────────────────────────────────────');
        console.log('Admin:   admin@gradebook.com / Admin@123');
        console.log('Teacher: john.smith@gradebook.com / Teacher@123');
        console.log('────────────────────────────────────────\n');

        process.exit(0);
    } catch (error) {
        console.error('❌ Seed error:', error);
        process.exit(1);
    }
};

seedData();
