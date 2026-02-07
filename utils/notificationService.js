import mongoose from 'mongoose';
import User from '../models/User.js';
import Student from '../models/Student.js';

import Notification from '../models/Notification.js';

// AI-powered message generation
const generateAIMessage = (type, context) => {
    const templates = {
        parent_notification: {
            absent: `Dear Parent, We noticed that ${context.studentName} was marked absent from ${context.subjectName} class today. We hope everything is alright. Please check on your child and ensure they're doing well. If there are any concerns or if your child is unwell, please let us know so we can support them appropriately.`,
            late: `Dear Parent, ${context.studentName} arrived late to ${context.subjectName} class today. We understand that sometimes delays happen, but we wanted to keep you informed. If there are any ongoing issues with punctuality, please let us know how we can help.`,
            excused: `Dear Parent, ${context.studentName} was marked as excused from ${context.subjectName} class today. Thank you for keeping us informed. We hope ${context.studentName} is feeling better and will return to class soon.`
        },
        missed_attendance_reminder: {
            teacher: `Hi ${context.teacherName}, this is a friendly reminder that you haven't recorded attendance for ${context.className} - ${context.subjectName} period today. The class was scheduled for ${context.startTime} in ${context.room}. Please take a moment to record the attendance as soon as possible. This helps us maintain accurate records and ensure student safety. Thank you for your attention to this important task!`
        },
        schedule_update: {
            created: `Hi ${context.teacherName}, a new schedule has been created for you: ${context.title} on ${context.date} at ${context.time}. Please make sure you're prepared for this class. Any questions about the schedule can be directed to the school administration.`,
            updated: `Hi ${context.teacherName}, your schedule has been updated: ${context.title}. ${context.changes.timeChanged ? 'The time has been changed.' : ''}${context.changes.teacherChanged ? 'The teacher assignment has been changed.' : ''}${context.changes.roomChanged ? 'The room has been changed.' : ''} Please review the updated schedule details.`,
            cancelled: `Hi ${context.teacherName}, your schedule has been cancelled: ${context.title} on ${context.date}. This class will no longer take place. Please update your calendar accordingly.`
        },
        substitute_assignment: {
            substitute: `Hi ${context.teacherName}, you have been assigned as a substitute teacher for ${context.title} on ${context.date} at ${context.time}. Reason: ${context.reason}. Please review the class details and prepare accordingly. Thank you for your flexibility!`,
            original: `Hi ${context.teacherName}, a substitute teacher has been assigned for your ${context.title} class on ${context.date} at ${context.time}. The substitute will cover your class while you're away. Please provide any necessary materials or instructions to the substitute if possible.`
        }
    };
    
    const category = templates[type];
    if (!category) return context.message || 'Notification';
    
    const subcategory = context.status || context.type || 'default';
    return category[subcategory] || category.default || context.message || 'Notification';
};

// Main notification generation function
export const generateNotification = async ({
    type,
    recipient,
    message,
    title,
    metadata = {},
    priority = 'normal',
    channels = ['email']
}) => {
    try {
        // Get recipient details
        const recipientUser = await User.findById(recipient);
        if (!recipientUser) {
            throw new Error('Recipient not found');
        }
        
        // Generate AI-powered message if needed
        let finalMessage = message;
        let finalTitle = title;
        
        if (type === 'parent_notification' || type === 'missed_attendance_reminder') {
            finalMessage = generateAIMessage(type, { ...metadata, message });
            finalTitle = title || generateTitleFromMessage(finalMessage);
        }
        
        // Map notification types to existing schema
        const notificationTypeMap = {
            'parent_notification': 'attendance',
            'missed_attendance_reminder': 'attendance',
            'schedule_update': 'announcement',
            'schedule_cancellation': 'announcement',
            'substitute_assignment': 'announcement',
            'attendance_deadline_reminder': 'attendance'
        };
        
        const mappedType = notificationTypeMap[type] || 'custom';
        
        // Create notification using existing schema
        const notification = new Notification({
            school: metadata.school || recipientUser.school,
            recipient: recipient,
            recipientEmail: recipientUser.email,
            recipientPhone: recipientUser.phone,
            student: metadata.studentId,
            type: mappedType,
            subject: finalTitle,
            message: finalMessage,
            channels: channels.filter(c => c !== 'in_app'), // Remove in_app as it's not supported
            priority: priority === 'medium' ? 'normal' : priority,
            metadata,
            createdBy: metadata.createdBy
        });
        
        await notification.save();
        
        // Send notification through appropriate channels
        await sendNotification(notification, recipientUser);
        
        return notification;
    } catch (error) {
        console.error('Error generating notification:', error);
        throw error;
    }
};

// Send notification through channels
const sendNotification = async (notification, recipient) => {
    const { channels } = notification;
    
    for (const channel of channels) {
        try {
            switch (channel) {
                case 'in_app':
                    await sendInAppNotification(notification, recipient);
                    break;
                case 'email':
                    await sendEmailNotification(notification, recipient);
                    break;
                case 'sms':
                    await sendSMSNotification(notification, recipient);
                    break;
                case 'push':
                    await sendPushNotification(notification, recipient);
                    break;
            }
        } catch (error) {
            console.error(`Error sending ${channel} notification:`, error);
            notification.lastError = error.message;
            notification.retryCount += 1;
        }
    }
    
    // Update notification status using existing schema methods
    if (notification.retryCount >= 3) {
        notification.status = 'failed';
    } else {
        await notification.markAsSent('email'); // Use existing method
    }
};

// In-app notification (not supported in existing schema)
const sendInAppNotification = async (notification, recipient) => {
    // In-app notifications are not supported in the existing schema
    // We'll mark as delivered for email/SMS channels
    console.log('In-app notification not supported, using email/SMS instead');
};

// Email notification
const sendEmailNotification = async (notification, recipient) => {
    // This would integrate with an email service like SendGrid, Nodemailer, etc.
    // For now, we'll just log it
    console.log(`Email to ${recipient.email}: ${notification.title}`);
    console.log(`Message: ${notification.message}`);
    
    // In a real implementation, you would:
    // 1. Use an email service provider
    // 2. Create an email template
    // 3. Send the email
    // 4. Handle delivery status
};

// SMS notification
const sendSMSNotification = async (notification, recipient) => {
    // This would integrate with an SMS service like Twilio
    // For now, we'll just log it
    if (recipient.phone) {
        console.log(`SMS to ${recipient.phone}: ${notification.message}`);
        
        // In a real implementation, you would:
        // 1. Use an SMS service provider
        // 2. Send the SMS
        // 3. Handle delivery status
    }
};

// Push notification
const sendPushNotification = async (notification, recipient) => {
    // This would integrate with a push notification service
    // For now, we'll just log it
    console.log(`Push notification to ${recipient._id}: ${notification.title}`);
    
    // In a real implementation, you would:
    // 1. Use a push notification service (Firebase, OneSignal, etc.)
    // 2. Send to the user's device tokens
    // 3. Handle delivery status
};

// Get notifications for a user
export const getUserNotifications = async (userId, options = {}) => {
    const {
        page = 1,
        limit = 20,
        status,
        type,
        unreadOnly = false
    } = options;
    
    const query = { recipient: userId };
    
    if (status) query.status = status;
    if (type) query.type = type;
    if (unreadOnly) query.readAt = { $exists: false };
    
    const notifications = await Notification.find(query)
        .sort({ createdAt: -1 })
        .limit(limit * 1)
        .skip((page - 1) * limit)
        .populate('student')
        .populate('createdBy');
    
    const total = await Notification.countDocuments(query);
    
    return {
        notifications,
        pagination: {
            page,
            limit,
            total,
            pages: Math.ceil(total / limit)
        }
    };
};

// Mark notification as read
export const markNotificationAsRead = async (notificationId, userId) => {
    const notification = await Notification.findOne({
        _id: notificationId,
        recipient: userId
    });
    
    if (!notification) {
        throw new Error('Notification not found');
    }
    
    notification.readAt = new Date();
    notification.status = 'read';
    await notification.save();
    
    return notification;
};

// Mark all notifications as read for a user
export const markAllNotificationsAsRead = async (userId) => {
    await Notification.updateMany(
        { recipient: userId, readAt: { $exists: false } },
        { readAt: new Date(), status: 'read' }
    );
    
    return { message: 'All notifications marked as read' };
};

// Get notification statistics
export const getNotificationStats = async (userId) => {
    const stats = await Notification.aggregate([
        { $match: { recipient: new mongoose.Types.ObjectId(userId) } },
        {
            $group: {
                _id: '$status',
                count: { $sum: 1 }
            }
        }
    ]);
    
    const unreadCount = await Notification.countDocuments({
        recipient: userId,
        readAt: { $exists: false }
    });
    
    return {
        byStatus: stats.reduce((acc, stat) => {
            acc[stat._id] = stat.count;
            return acc;
        }, {}),
        unreadCount
    };
};

// Delete notification
export const deleteNotification = async (notificationId, userId) => {
    const notification = await Notification.findOneAndDelete({
        _id: notificationId,
        recipient: userId
    });
    
    if (!notification) {
        throw new Error('Notification not found');
    }
    
    return notification;
};

// Utility function to generate title from message
const generateTitleFromMessage = (message) => {
    const words = message.split(' ');
    const title = words.slice(0, 8).join(' ');
    return title.length > 50 ? title.substring(0, 47) + '...' : title;
};

// Batch notification for missed attendance
export const sendMissedAttendanceNotifications = async (schoolId, date) => {
    try {
        // Get all missed attendance for the date
        const Attendance = mongoose.model('Attendance');
        const missedAttendance = await Attendance.findMissedAttendance(schoolId, date);
        
        for (const missed of missedAttendance) {
            const teacher = await User.findById(missed._id);
            
            for (const missedClass of missed.missedClasses) {
                await generateNotification({
                    type: 'missed_attendance_reminder',
                    recipient: missed._id,
                    message: `You missed taking attendance for ${missedClass.subjectName} - ${missedClass.className} at ${new Date(missedClass.startTime).toLocaleTimeString()}. Please record it as soon as possible.`,
                    metadata: {
                        school: schoolId,
                        scheduleId: missedClass.scheduleId,
                        className: missedClass.className,
                        subjectName: missedClass.subjectName,
                        startTime: missedClass.startTime,
                        room: missedClass.room,
                        teacherName: `${teacher.firstName} ${teacher.lastName}`
                    },
                    priority: 'high',
                    channels: ['in_app', 'email']
                });
            }
        }
        
        return { message: 'Missed attendance notifications sent successfully' };
    } catch (error) {
        console.error('Error sending missed attendance notifications:', error);
        throw error;
    }
};

// Schedule periodic notifications
export const schedulePeriodicNotifications = () => {
    // Check for missed attendance every hour
    setInterval(async () => {
        try {
            const schools = await mongoose.model('School').find({ isActive: true });
            
            for (const school of schools) {
                await sendMissedAttendanceNotifications(school._id, new Date());
            }
        } catch (error) {
            console.error('Error in periodic notification check:', error);
        }
    }, 60 * 60 * 1000); // Every hour
};

export default Notification;
