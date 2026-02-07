import fetch from 'node-fetch';

const BASE_URL = 'http://localhost:5000/api';

async function testAIEndpoint() {
    try {
        console.log('1. Logging in as Teacher...');
        const loginRes = await fetch(`${BASE_URL}/auth/login`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                email: 'john.smith@gradebook.com',
                password: 'Teacher@123'
            })
        });

        const loginData = await loginRes.json();
        if (!loginData.success) {
            throw new Error('Login failed: ' + loginData.message);
        }
        const token = loginData.token;
        console.log('✅ Login successful. Token received.');

        console.log('2. Fetching a student...');
        const studentsRes = await fetch(`${BASE_URL}/students`, {
            method: 'GET',
            headers: { 'Authorization': `Bearer ${token}` }
        });
        const studentsData = await studentsRes.json();
        const student = studentsData.data[0];

        if (!student) {
            throw new Error('No students found to test with.');
        }
        console.log(`✅ Found student: ${student.firstName} ${student.lastName} (${student.id})`);

        console.log('3. Generating AI Report...');
        const reportRes = await fetch(`${BASE_URL}/reports/generate-ai`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${token}`
            },
            body: JSON.stringify({
                studentId: student.id
            })
        });

        const reportData = await reportRes.json();

        if (reportData.success) {
            console.log('\n✅ Report Generated Successfully!');
            console.log('-----------------------------------');
            console.log(reportData.data.report);
            console.log('-----------------------------------');
        } else {
            console.error('❌ Report Generation Failed:', reportData.message);
        }

    } catch (error) {
        console.error('Test failed:', error.message);
    }
}

testAIEndpoint();
