# Substitution API - Example Payloads

## POST /api/substitutions/candidates

Get available substitute teachers for an absent teacher on a date.

**Request:**
```json
{
  "absentTeacherId": "507f1f77bcf86cd799439011",
  "date": "2025-02-17"
}
```

**Response:**
```json
{
  "success": true,
  "data": {
    "date": "2025-02-17",
    "absentTeacherId": "507f1f77bcf86cd799439011",
    "targetPeriods": [
      { "periodId": "...", "startTime": "08:00", "endTime": "08:45", "classId": "...", "roomId": "..." }
    ],
    "candidatesAllPeriods": [
      { "_id": "...", "name": "John Doe", "firstName": "John", "lastName": "Doe", "departmentId": null }
    ],
    "candidatesByPeriod": {
      "periodId1": [{ "_id": "...", "name": "Jane Smith", "departmentId": "..." }]
    }
  }
}
```

---

## POST /api/substitutions

Create a substitution request.

### Single teacher for all periods

**Request:**
```json
{
  "absentTeacherId": "507f1f77bcf86cd799439011",
  "date": "2025-02-17",
  "coverageType": "SINGLE_TEACHER_ALL_PERIODS",
  "selections": {
    "substituteTeacherId": "507f1f77bcf86cd799439022"
  },
  "principalNote": "Please cover Math sections. Materials in the desk.",
  "expiresInHours": 48
}
```

### Per-period (different teachers per period)

**Request:**
```json
{
  "absentTeacherId": "507f1f77bcf86cd799439011",
  "date": "2025-02-17",
  "coverageType": "PER_PERIOD",
  "selections": {
    "perPeriod": [
      { "periodId": "507f1f77bcf86cd799439033", "substituteTeacherId": "507f1f77bcf86cd799439022" },
      { "periodId": "507f1f77bcf86cd799439044", "substituteTeacherId": "507f1f77bcf86cd799439055" }
    ]
  },
  "principalNote": "Cover periods 1 and 2.",
  "expiresInHours": 48
}
```

**Response:**
```json
{
  "success": true,
  "message": "Substitution request created. Substitute teacher(s) have been notified.",
  "data": {
    "_id": "...",
    "status": "SUBMITTED",
    "date": "2025-02-17T00:00:00.000Z",
    "absentTeacherId": { "_id": "...", "firstName": "Alice", "lastName": "Smith", "email": "..." },
    "coverageType": "SINGLE_TEACHER_ALL_PERIODS",
    "periods": [...],
    "assignments": [...],
    "principalNote": "...",
    "expiresAt": "2025-02-19T12:00:00.000Z",
    "timeline": [{ "action": "SUBMITTED", "by": "...", "at": "...", "meta": {} }],
    "createdBy": { "_id": "...", "firstName": "Principal", "lastName": "Name" }
  }
}
```

---

## GET /api/substitutions

List requests (filters optional).

**Query params:** `startDate`, `endDate`, `status`, `absentTeacherId`, `substituteTeacherId`, `page`, `limit`

**Response:**
```json
{
  "success": true,
  "data": {
    "requests": [...],
    "pagination": { "page": 1, "limit": 20, "total": 5, "pages": 1 }
  }
}
```

---

## GET /api/substitutions/:id

Get one request by ID.

---

## POST /api/substitutions/:id/cancel

Cancel a SUBMITTED request.

**Request:**
```json
{
  "note": "Cancelled - teacher returned early"
}
```

---

## POST /api/substitutions/respond

Confirm or decline (token-based, no auth).

**Request:**
```json
{
  "token": "abc123...raw-token-from-email",
  "action": "CONFIRM",
  "note": "I can cover. Will arrive 10 min early."
}
```

Or for decline:
```json
{
  "token": "abc123...",
  "action": "DECLINE",
  "note": "Sorry, I have a conflict."
}
```

**GET alternative (safe redirect for email links):**  
`GET /api/substitutions/respond?token=...`  
Redirects to frontend response page where the teacher explicitly confirms or declines.

**Response:**
```json
{
  "success": true,
  "message": "Substitution confirmed",
  "data": { ... request with populated fields ... }
}
```
