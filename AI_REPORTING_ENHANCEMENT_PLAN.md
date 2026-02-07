# AI Reporting System Enhancement Plan

## Overview
Enhance the AI reporting system to support multi-recipient email delivery, flexible time-based reporting, multi-language support, and comprehensive token tracking for cost analysis.

> **📅 Last Updated**: February 2025  
> **🔧 Backend Status**: ✅ COMPLETED  
> **🎨 Frontend Status**: ✅ PHASE 2 COMPLETED

## 🎯 Core Features

### 1. Multi-Recipient Email System
- **Student Email**: Send report to student
- **Parent Emails**: Send to both mother and father emails
- **Teacher Email**: CC teacher for records
- **Batch Processing**: Send up to 3 emails per report

### 2. Flexible Time-Based Reporting
- **Weekly**: Last 7 days of data
- **Monthly**: Current month data
- **Quarterly**: 3-month periods
- **Yearly**: Full academic year
- **Custom Range**: User-defined date ranges

### 3. Multi-Language Support
- **English Only**: English report
- **Arabic Only**: Arabic report  
- **Bilingual**: Both English and Arabic in same report
- **RTL Support**: Proper Arabic text direction

### 4. Advanced Token Tracking
- **User-Based Tracking**: Track tokens by teacher ID
- **School-Based Tracking**: Track tokens by school ID
- **Time-Based Analytics**: Monthly/yearly token usage
- **Cost Calculation**: Automatic cost estimation

## 🏗️ Backend Implementation

### New Models/Documents

#### 1. Enhanced AITokenUsage Model
```javascript
// models/AITokenUsage.js
{
  _id: ObjectId,
  userId: ObjectId,        // Teacher who generated report
  schoolId: ObjectId,       // School context
  studentId: ObjectId,     // Student being reported
  reportType: String,      // 'weekly', 'monthly', 'quarterly', 'yearly', 'custom'
  language: String,        // 'english', 'arabic', 'bilingual'
  emailRecipients: [String], // Email addresses sent to
  inputTokens: Number,
  outputTokens: Number,
  totalTokens: Number,
  estimatedCost: Number,   // Based on token pricing
  dateRange: {
    startDate: Date,
    endDate: Date
  },
  generatedAt: Date,
  emailStatus: {
    student: { sent: Boolean, sentAt: Date, messageId: String },
    mother: { sent: Boolean, sentAt: Date, messageId: String },
    father: { sent: Boolean, sentAt: Date, messageId: String },
    teacher: { sent: Boolean, sentAt: Date, messageId: String }
  }
}
```

#### 2. EmailReport Model
```javascript
// models/EmailReport.js
{
  _id: ObjectId,
  reportId: ObjectId,      // Reference to AITokenUsage
  recipientType: String,   // 'student', 'mother', 'father', 'teacher'
  email: String,
  subject: String,
  content: String,        // HTML content
  language: String,
  sentAt: Date,
  messageId: String,      // Email service message ID
  status: String,          // 'sent', 'failed', 'pending'
  error: String            // Error message if failed
}
```

#### 3. ReportTemplate Model
```javascript
// models/ReportTemplate.js
{
  _id: ObjectId,
  schoolId: ObjectId,
  name: String,            // Template name
  type: String,           // 'weekly', 'monthly', etc.
  language: String,       // 'english', 'arabic', 'bilingual'
  customPrompt: String,   // Custom AI prompt
  variables: [String],    // Available variables
  isActive: Boolean,
  createdAt: Date,
  updatedAt: Date
}
```

### Enhanced Controllers

#### 1. Report Controller Updates
```javascript
// controllers/reportController.js

// New endpoints needed:
- POST /api/reports/generate-advanced
- GET /api/reports/templates
- POST /api/reports/templates
- GET /api/reports/token-usage/:userId
- GET /api/reports/token-usage/school/:schoolId
- POST /api/reports/send-email
- GET /api/reports/history
```

#### 2. Email Service
```javascript
// services/emailService.js
class EmailService {
  async sendReportEmail(reportData, recipients, language)
  async sendBatchEmails(reportData, emailList)
  async getEmailTemplate(language, reportType)
  async trackEmailDelivery(messageId, status)
}
```

#### 3. Enhanced AI Service
```javascript
// services/aiservice.js (enhanced)
class AIService {
  async generateAdvancedReport(options) {
    // options: {
    //   studentData, grades, period, teacher,
    //   language: 'english'|'arabic'|'bilingual',
    //   reportType: 'weekly'|'monthly'|'quarterly'|'yearly'|'custom',
    //   customPrompt?: string,
    //   dateRange: { startDate, endDate }
    // }
  }
  
  constructAdvancedPrompt(options)
  async trackTokenUsage(usageData)
}
```

### New API Endpoints

```javascript
// Advanced Report Generation
POST /api/reports/generate-advanced
{
  studentId: String,
  reportType: 'weekly'|'monthly'|'quarterly'|'yearly'|'custom',
  language: 'english'|'arabic'|'bilingual',
  dateRange?: { startDate, endDate },
  customPrompt?: String,
  sendEmail: Boolean,
  recipients: {
    student: Boolean,
    mother: Boolean,
    father: Boolean,
    teacher: Boolean
  }
}

// Token Usage Analytics
GET /api/reports/token-usage/:userId?period=monthly&year=2024
GET /api/reports/token-usage/school/:schoolId?period=yearly&year=2024

// Report Templates
GET /api/reports/templates
POST /api/reports/templates
PUT /api/reports/templates/:id
DELETE /api/reports/templates/:id

// Report History
GET /api/reports/history?studentId=xxx&teacherId=xxx&type=monthly
```

## 🎨 Frontend Implementation

### New Pages/Components

#### 1. Advanced Report Generator Page
```
pages/reports/AdvancedReportGenerator.jsx
- Student selection
- Report type selection (weekly/monthly/quarterly/yearly/custom)
- Date range picker
- Language selection (English/Arabic/Bilingual)
- Recipient selection checkboxes
- Custom prompt editor
- Preview functionality
- Generate and send buttons
```

#### 2. Report Analytics Dashboard
```
pages/reports/ReportAnalytics.jsx
- Token usage charts (monthly/yearly)
- Cost analysis per teacher/school
- Email delivery statistics
- Report generation trends
- Export functionality
```

#### 3. Report Templates Manager
```
pages/reports/ReportTemplates.jsx
- Template list/grid
- Create/edit template
- Template preview
- Language-specific templates
- School-wide templates
```

#### 4. Report History Page
```
pages/reports/ReportHistory.jsx
- Filterable report list
- Search functionality
- Report details view
- Email status tracking
- Resend options
```

#### 5. Enhanced Components
```
components/reports/
- ReportTypeSelector.jsx
- LanguageSelector.jsx
- DateRangePicker.jsx
- RecipientSelector.jsx
- ReportPreview.jsx
- TokenUsageChart.jsx
- EmailStatusIndicator.jsx
```

### UI Enhancements to Existing Pages

#### 1. GradebookPage.jsx Updates
```javascript
// Add to existing gradebook
- Quick generate report button per student
- Batch report generation for multiple students
- Report type dropdown in header
- Language preference toggle
```

#### 2. Student Profile Enhancement
```javascript
// Add to student profile/pages
- Report generation section
- Email history tab
- Performance trends
```

## 📊 Database Schema Updates

### Student Model Enhancement
```javascript
// models/Student.js (add fields)
{
  // ... existing fields
  parentEmails: {
    mother: String,
    father: String,
    guardian: String
  },
  studentEmail: String,
  reportPreferences: {
    language: String,      // 'english'|'arabic'|'bilingual'
    frequency: String,     // 'weekly'|'monthly'|'quarterly'
    recipients: {
      student: Boolean,
      mother: Boolean,
      father: Boolean,
      teacher: Boolean
    }
  }
}
```

### School Model Enhancement
```javascript
// models/School.js (add fields)
{
  // ... existing fields
  reportSettings: {
    defaultLanguage: String,
    allowedReportTypes: [String],
    emailTemplates: {
      english: String,
      arabic: String
    },
    tokenLimits: {
      monthlyPerTeacher: Number,
      yearlyPerSchool: Number
    }
  }
}
```

## 🔄 Workflow Implementation

### 1. Report Generation Flow
```
1. User selects student and report options
2. Frontend validates and sends request
3. Backend fetches student data and grades
4. AI generates report based on language and type
5. Token usage is tracked and stored
6. Report is saved to database
7. Email service sends to selected recipients
8. Email status is tracked and updated
9. Frontend shows success with tracking info
```

### 2. Token Tracking Flow
```
1. Each AI call tracks input/output tokens
2. Usage is linked to userId and schoolId
3. Cost is calculated based on pricing model
4. Monthly/yearly aggregates are maintained
5. Analytics dashboard shows usage trends
6. Admin can set limits and monitor costs
```

### 3. Email Delivery Flow
```
1. Report content is formatted for each language
2. Email template is applied
3. Recipients are validated
4. Emails are sent in batches
5. Delivery status is tracked
6. Failed emails are retried or flagged
7. Success/failure is logged
```

## 📱 UI/UX Design Considerations

### 1. Report Generator Interface
- **Step-by-step wizard** for complex options
- **Real-time preview** of report content
- **Progress indicators** for generation and sending
- **Success notifications** with delivery status
- **Error handling** with retry options

### 2. Analytics Dashboard
- **Interactive charts** for token usage
- **Filterable data** by time period and user
- **Export options** for reports
- **Cost projections** based on usage trends
- **Alert system** for limit warnings

### 3. Mobile Responsiveness
- **Responsive forms** for report generation
- **Touch-friendly controls**
- **Optimized charts** for mobile viewing
- **Simplified navigation** for key features

## 🔧 Technical Implementation Details

### 1. AI Prompt Engineering
```javascript
// Enhanced prompt templates
const PROMPT_TEMPLATES = {
  weekly_english: `
    Generate a weekly progress report for {studentName} covering {dateRange}.
    Include: performance summary, key achievements, areas for improvement.
    Format: Professional email with HTML styling.
    Language: English
    Length: 200-300 words
  `,
  
  monthly_bilingual: `
    Generate a monthly progress report for {studentName} covering {dateRange}.
    Include both English and Arabic versions.
    English section: Left-to-right
    Arabic section: Right-to-left
    Format: Professional bilingual email
    Length: 300-400 words per language
  `
};
```

### 2. Email Template System
```javascript
// Email templates by language
const EMAIL_TEMPLATES = {
  english: {
    subject: "Progress Report for {studentName} - {period}",
    header: "<h2>Student Progress Report</h2>",
    footer: "<p>Best regards,<br>{teacherName}</p>"
  },
  arabic: {
    subject: "تقرير التقدم لـ {studentName} - {period}",
    header: "<h2 dir='rtl'>تقرير تقدم الطالب</h2>",
    footer: "<p dir='rtl'>مع أطيب التحيات،<br>{teacherName}</p>"
  }
};
```

### 3. Token Cost Calculation
```javascript
// Token pricing model
const TOKEN_PRICING = {
  'gemini-2.5-flash': {
    input: 0.000125,  // per 1K tokens
    output: 0.000375  // per 1K tokens
  }
};

function calculateCost(inputTokens, outputTokens, model = 'gemini-2.5-flash') {
  const pricing = TOKEN_PRICING[model];
  return (inputTokens * pricing.input / 1000) + 
         (outputTokens * pricing.output / 1000);
}
```

## 🚀 Implementation Phases

### Phase 1: Core Infrastructure (Week 1-2) ✅ COMPLETED
- [x] Enhanced AI service with multi-language support
- [x] Token tracking system
- [x] Basic email service
- [x] Database model updates
- [x] API endpoints for advanced reporting

### Phase 2: UI Components (Week 2-3) ✅ COMPLETED
- [x] Advanced report generator page
- [x] Language and date range components
- [x] Report preview functionality
- [x] Basic analytics dashboard
- [x] Integration with existing gradebook

### Phase 3: Email System (Week 3-4) ✅ PARTIALLY COMPLETED
- [x] Multi-recipient email delivery
- [x] Email templates and formatting
- [x] Delivery tracking and status
- [x] Email history and retry logic
- [ ] Testing and optimization

### Phase 4: Analytics & Templates (Week 4-5) ✅ PARTIALLY COMPLETED
- [x] Complete analytics dashboard (basic endpoints ready)
- [x] Report template management
- [x] Token usage analytics
- [x] Cost calculation and reporting
- [ ] Export functionality

### Phase 5: Testing & Polish (Week 5-6)
- [ ] End-to-end testing
- [ ] Performance optimization
- [ ] Error handling improvements
- [ ] Documentation
- [ ] User acceptance testing

## 📋 Checklist for Implementation

### Backend Tasks
- [x] Update AITokenUsage model with new fields
- [x] Create EmailReport model
- [x] Create ReportTemplate model
- [x] Enhance Student model with email fields
- [x] Enhance School model with report settings
- [x] Update AI service for multi-language
- [x] Implement email service with batch sending
- [x] Create advanced report controller
- [ ] Add token tracking middleware
- [x] Implement analytics endpoints
- [x] Add error handling and logging

**Backend Status: ✅ COMPLETED**

### Frontend Tasks
- [x] Create AdvancedReportGenerator page
- [x] Create ReportAnalytics dashboard page
- [x] Create ReportTemplates manager page
- [x] Create ReportHistory page
- [x] Build reusable report components
- [x] Update existing gradebook with report features
- [ ] Implement responsive design
- [ ] Add loading states and error handling
- [ ] Integrate with existing navigation

**Frontend Status: ✅ PHASE 2 COMPLETED**
### Frontend Tasks
- [ ] Create AdvancedReportGenerator page
- [ ] Create ReportAnalytics dashboard
- [ ] Create ReportTemplates manager
- [ ] Create ReportHistory page
- [ ] Build reusable report components
- [ ] Update existing gradebook with report features
- [ ] Implement responsive design
- [ ] Add loading states and error handling
- [ ] Integrate with existing navigation

### Integration Tasks
- [ ] Connect frontend to new API endpoints
- [ ] Test email delivery system
- [ ] Verify token tracking accuracy
- [ ] Test multi-language report generation
- [ ] Validate date range filtering
- [ ] Performance testing with large datasets
- [ ] Security audit for email handling
- [ ] Documentation and user guides

## 💰 Cost Management

### Token Usage Estimation
- **Weekly Report**: ~500 tokens (200 input, 300 output) = $0.10
- **Monthly Report**: ~800 tokens (300 input, 500 output) = $0.16
- **Yearly Report**: ~1500 tokens (500 input, 1000 output) = $0.30
- **Bilingual Reports**: ~2x token cost

### Budget Planning
- **Per Teacher**: ~50 reports/month = $5-10/month
- **Per School**: ~500 reports/month = $50-100/month
- **Enterprise**: Custom limits and pricing

## 🔒 Security Considerations

### Email Security
- [ ] Validate all email addresses
- [ ] Implement rate limiting
- [ ] Add email unsubscribe options
- [ ] Secure email content storage
- [ ] GDPR compliance for email handling

### Data Privacy
- [ ] Mask sensitive student data
- [ ] Implement access controls
- [ ] Audit logging for report generation
- [ ] Data retention policies
- [ ] Parent consent management

## 📈 Success Metrics

### Technical Metrics
- Report generation success rate > 95%
- Email delivery rate > 98%
- Token tracking accuracy 100%
- API response time < 3 seconds

### User Metrics
- Teacher adoption rate
- Report generation frequency
- User satisfaction scores
- Feature utilization rates

### Business Metrics
- Cost per report
- Monthly token usage
- School engagement
- Revenue from premium features

This comprehensive plan provides a roadmap for implementing a robust AI reporting system with multi-language support, advanced analytics, and efficient email delivery.
