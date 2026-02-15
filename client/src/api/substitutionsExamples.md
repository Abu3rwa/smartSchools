# Substitution API - Example Thunk Payloads and Responses

## fetchSubCandidates

**Payload:**
```js
dispatch(fetchSubCandidates({
  absentTeacherId: "507f1f77bcf86cd799439011",  // User._id
  date: "2025-02-17"  // YYYY-MM-DD
}));
```

**Expected response (fulfilled):**
```js
{
  date: "2025-02-17",
  absentTeacherId: "507f1f77bcf86cd799439011",
  targetPeriods: [
    { periodId: "...", startTime: "08:00", endTime: "08:45", classId: "...", roomId: "..." }
  ],
  candidatesAllPeriods: [
    { _id: "...", name: "John Doe", firstName: "John", lastName: "Doe", departmentId: null }
  ],
  candidatesByPeriod: {
    "periodId1": [{ _id: "...", name: "Jane Smith", ... }]
  }
}
```

---

## createSubRequestThunk

**Payload (SINGLE_TEACHER_ALL_PERIODS):**
```js
dispatch(createSubRequestThunk({
  absentTeacherId: "507f1f77bcf86cd799439011",
  date: "2025-02-17",
  coverageType: "SINGLE_TEACHER_ALL_PERIODS",
  periods: ["507f1f77bcf86cd799439033", "507f1f77bcf86cd799439044"],
  selections: { substituteTeacherId: "507f1f77bcf86cd799439022" },
  principalNote: "Please cover Math sections."
}));
```

**Payload (PER_PERIOD):**
```js
dispatch(createSubRequestThunk({
  absentTeacherId: "507f1f77bcf86cd799439011",
  date: "2025-02-17",
  coverageType: "PER_PERIOD",
  periods: ["507f1f77bcf86cd799439033", "507f1f77bcf86cd799439044"],
  selections: {
    perPeriod: [
      { periodId: "507f1f77bcf86cd799439033", substituteTeacherId: "507f1f77bcf86cd799439022" },
      { periodId: "507f1f77bcf86cd799439044", substituteTeacherId: "507f1f77bcf86cd799439055" }
    ]
  },
  principalNote: "Cover periods 1 and 2."
}));
```

**Expected response (fulfilled):**
```js
{
  _id: "507f1f77bcf86cd799439066",
  status: "SUBMITTED",
  date: "2025-02-17T00:00:00.000Z",
  absentTeacherId: { _id: "...", firstName: "Alice", lastName: "Smith" },
  coverageType: "SINGLE_TEACHER_ALL_PERIODS",
  periods: [...],
  assignments: [...],
  principalNote: "...",
  expiresAt: "...",
  timeline: [...],
  createdBy: { ... }
}
```

---

## fetchSubRequestsThunk

**Payload:**
```js
dispatch(fetchSubRequestsThunk({
  status: "SUBMITTED",
  startDate: "2025-02-01",
  endDate: "2025-02-28",
  absentTeacherId: "507f1f77bcf86cd799439011",
  substituteTeacherId: "507f1f77bcf86cd799439022",
  page: 1,
  limit: 20
}));
```

**Expected response (fulfilled):**
```js
{
  requests: [
    { _id: "...", date: "...", status: "SUBMITTED", absentTeacherId: {...}, ... }
  ],
  pagination: { page: 1, limit: 20, total: 5, pages: 1 }
}
```

---

## fetchSubRequestByIdThunk

**Payload:**
```js
dispatch(fetchSubRequestByIdThunk("507f1f77bcf86cd799439066"));
```

**Expected response (fulfilled):** Full request object with populated fields.

---

## cancelSubRequestThunk

**Payload:**
```js
dispatch(cancelSubRequestThunk({
  id: "507f1f77bcf86cd799439066",
  note: "Cancelled - teacher returned early"
}));
```

**Expected response (fulfilled):** Updated request object with status "CANCELLED".

---

## respondToSubRequestThunk

**Payload:**
```js
dispatch(respondToSubRequestThunk({
  token: "abc123...raw-token-from-email",
  action: "CONFIRM",
  note: "I can cover."
}));
```

**Expected response (fulfilled):**
```js
{
  success: true,
  message: "Substitution confirmed",
  data: { ... request with populated fields ... }
}
```
