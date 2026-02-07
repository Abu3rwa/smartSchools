# SaaS Transformation Plan: Gradebook Pro

To monetize this application and scale it to multiple schools (Multi-tenancy), you need to shift the architecture from a "Single Instance" model to a "Platform" model. This plan outlines the technical and business steps to achieve that.

## 1. Executive Summary
**Goal:** Transform the current Gradebook MVP into a SaaS (Software as a Service) platform where schools can sign up, manage their own data in isolation, and pay a subscription fee.
**Monetization Strategy:** Tiered subscription model (Free Tier, Pro Tier per student/month) managed via Stripe.

---

## 2. Current State vs. Target State

| Feature | Current State (What we have) | Target SaaS State (What we need) |
| :--- | :--- | :--- |
| **Tenant Scope** | Single School (Hardcoded logic) | Multi-School (Dynamic Tenant Resolution) |
| **Database** | Global Collections (Users, Classes) | Tenant-Partitioned Collections (`school_id` on records) |
| **User Roles** | Admin, Teacher | **Super Admin** (You), School Admin, Teacher, Parent |
| **Onboarding** | Manual Seed / Admin Creation | Self-Service Signup flow (School Creation) |
| **Billing** | None | Stripe Integration (Recurrings Payments) |

---

## 3. Technical Architecture: Multi-tenancy Strategy

We will use a **Shared Database, Discriminator-based Multi-tenancy**. This is the most cost-effective and scalable approach for this size of application.

### A. The Data Layer Changes
Every major data model must belong to a `School`.

1.  **Create `School` Model:**
    ```javascript
    const SchoolSchema = new Schema({
        name: String,
        domain: { type: String, unique: true }, // e.g. "stmarys" -> stmarys.app.com
        subscriptionStatus: { type: String, enum: ['active', 'past_due', 'trial'] },
        subscriptionPlan: String, // 'pro', 'basic'
        settings: {
            gradingScale: Object, // Custom settings per school
            logoUrl: String
        }
    });
    ```

2.  **Update Existing Models:**
    Add `school: { type: ObjectdId, ref: 'School', index: true }` to:
    -   `User` (Users belong to a school)
    -   `Student`
    -   `Class`
    -   `Grade`
    -   `Subject`
    -   `Notification`
    -   `Teacher` (Profile)

### B. Request Isolation (Middleware)
We cannot rely on developers remembering to add `.find({ school: id })`. We need automated security.

1.  **Auth Middleware Update:**
    When a user logs in, their JWT token must contain their `schoolId`.
    ```javascript
    req.user.schoolId // Available on every request
    ```

2.  **Global Query Middleware (Mongoose Plugin):**
    Create a plugin that automatically injects `schoolId` into every `find`, `findOne`, `update`, etc.
    ```javascript
    // schema.pre('find', function() {
    //   this.where({ school: currentContext.schoolId });
    // });
    ```

---

## 4. Monetization & Business Plan

### Pricing Tiers
1.  **Starter (Free)**
    - Up to 50 Students.
    - Basic Grading.
    - No Parent Portal.
2.  **Growth ($99/month or $2/student)**
    - Unlimited Students.
    - Parent Email Notifications.
    - Advanced Analytics.
    - Priority Support.

### Implementation: Stripe Connect
-   Use **Stripe Checkout** for handling credit cards.
-   Create a "Billing Portal" in the Admin Settings so schools can manage their own subscription.
-   **Webhook Handler:** Listen for `invoice.payment_failed` to automatically lock school access.

---

## 5. Roadmap: What Should Be Done

### Phase 1: Foundation (Architecture)
1.  [ ] **Create School Model**: Set up the container for tenants.
2.  [ ] **Seed Data Migration**: Create a "Default School" and assign all current data (users, grades) to it so nothing breaks.
3.  [ ] **Update Auth**: Modify Login to return `school` context.
4.  [ ] **Protect Routes**: Ensure `schoolId` is required for all data routes.

### Phase 2: Onboarding Flow
1.  [ ] **Landing Page**: Create a public home page (e.g., `www.gradebook-app.com`) selling the product.
2.  [ ] **Signup Form**: "Create your School" form.
    -   Inputs: School Name, Admin Email, Password.
    -   Action: Creates `School`, Creates `User` (School Admin).
3.  [ ] **Super Admin Dashboard**: A special view for YOU to see all registered schools and their stats.

### Phase 3: Billing (The "Get Paid" Part)
1.  [ ] **Stripe Account Setup**.
2.  [ ] **Subscription Logic**: Gate features based on `school.plan`.
3.  [ ] **Payment Routes**: `/api/subscription/create`, `/api/subscription/webhook`.

### Phase 4: Refinement
1.  [ ] **Custom Branding**: Allow schools to upload their logo.
2.  [ ] **Subdomains**: Allow accessing `schoolname.yourapp.com` (Advanced, requires DNS wildcarding).

---

## 6. What We Have Done (Summary)
We have built a **robust internal engine** for a single school:
-   **Role-Based Access Control (RBAC):** Teachers only see their classes; Admins see all. *This is a prerequisite for multi-tenancy.*
-   **Deep Grading System:** Weighted grades, subjects, and analytics are ready.
-   **Email Integration:** Notification infrastructure is in place.
-   **Frontend UI:** A clean React interface that can easily be "white-labeled" (themed) for different schools.

**Verdict:** The core product is solid. The next step is strictly **wrapping** this core in a multi-tenant isolation layer.
