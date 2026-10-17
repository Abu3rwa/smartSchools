# Live Lesson Audio Feature Plan

**Status:** Detailed implementation plan; no feature code has been implemented. Audio-off-by-default, no recording/storage, and session-scoped blocking are confirmed. Provider selection and privacy/device details remain open.

**Product goal:** Let the teacher control a live voice channel during a Live Lesson, including whether audio is available, whether the teacher is transmitting, which student is invited to speak, and which students may remain in or rejoin the session.
**Storage constraint:** Do not store audio recordings, audio blobs, or transcripts in the application database.

## 1. Current feature baseline

The existing Live Lessons experience already has:

- A teacher-controlled live-session lifecycle and presentation controls.
- Authenticated WebSocket signaling at `/ws/live-lessons`.
- Session membership and student enrollment checks.
- A server-maintained roster and presence updates.
- A single WebSocket action handler that rejects student attempts to control lesson state.
- Session events and reports for lesson actions and presence.

The current Live Lessons feature does **not** include a text chat. Voice should not be described as an addition to an existing chat. A text chat, if desired, is a separate future feature with its own moderation and retention decisions.

Relevant code today:

- `server/realtime/liveLessonsGateway.js` — live session WebSocket, membership, presence, teacher authorization, and action handling.
- `server/services/liveLessonService.js` — session state, roster, and live-session helpers.
- `server/models/LiveSession.js` — persistent session configuration and lifecycle state.
- `server/models/LiveSessionEvent.js` — persisted, ordered session event history; it stores event metadata, not media.
- `server/client/src/pages/liveLessons/LiveLessonSessionPage.jsx` — teacher/student live presentation experience.
- `server/client/src/hooks/useLiveLessonSocket.js` — browser connection, state updates, and actions.

## 2. Product definition

Add an optional **Live Audio** capability to a Live Lesson:

- The teacher decides whether audio is available for the session.
- The teacher controls their own microphone and can stop transmission immediately.
- The teacher can remove a student from the live session and block that student from rejoining for the remainder of that session.
- The teacher can unblock a student.
- Students can listen when audio is available. The teacher may invite one selected student at a time to speak; that student must explicitly join and grant microphone permission in their browser.
- The teacher can immediately revoke a student's speaking permission. The teacher cannot silently bypass browser/device microphone permission.
- The teacher can see audio connection state and student session access state without assuming that a connected student is actively listening.
- No audio is recorded or persisted by the application.

“Block a student” means remove that student from the active session and deny subsequent session joins until the teacher unblocks them or the session ends. It does not disable the student's account or remove them from the class.

## 3. Goals and non-goals

### Goals

1. Make teacher authority explicit and enforce it on the server, not only in the interface.
2. Keep voice real-time and independent of database persistence.
3. Make audio easy to turn on/off during a session and safe to recover from disconnection.
4. Provide understandable states for teacher and student, including permission, network, and device failures.
5. Prevent a blocked student from returning through either the HTTP session-join path or WebSocket reconnect.
6. Keep lesson questions, answers, gradebook data, replay, and reporting behavior unchanged.
7. Provide a staged rollout, starting with teacher broadcast and a tightly controlled, one-student-at-a-time speaking turn.

### Non-goals for the first release

- Recording, replaying, downloading, or transcribing audio.
- Saving raw media, microphone input, or audio-derived personal data to MongoDB, Firebase, local files, or application logs.
- Open student microphones, unrestricted student publishing, or multiple simultaneous student speakers.
- A text chat or persistent direct messages.
- Using the lesson WebSocket to carry encoded audio or other media packets.
- Treating a connected client as proof of attention, participation, or learning.

## 4. Recommended technical approach

### Keep signaling and media separate

Continue using the existing authenticated WebSocket for low-volume control/signaling only, such as:

- Audio availability and session state.
- Room/token negotiation or provider room coordination.
- Teacher mute/unmute state.
- Student block/unblock state and roster refreshes.
- Connection and failure notifications.

Do **not** send voice data through the current lesson WebSocket. WebRTC media needs congestion control, packet loss handling, echo cancellation integration, and network traversal behavior that the existing application WebSocket does not provide.

### Audio transport options to evaluate

Choose one of the following in a short technical spike:

1. **Managed WebRTC SFU service (recommended starting point):** A provider forwards the teacher audio stream to student listeners and supports granting/revoking publish permission for one selected student. This is generally the most practical path for classroom networks, scaling, and TURN support, but requires vendor review, data-processing review, and ongoing service cost.
2. **Self-hosted SFU:** Gives more infrastructure control but requires the team to operate media servers, TURN, capacity, monitoring, upgrades, and incident response.
3. **Peer-to-peer WebRTC:** Appropriate only for a very small proof of concept. One-to-many mesh increases teacher upload bandwidth with each student and is not the recommended production design for class-sized sessions.

The application should own the session authorization and teacher controls regardless of the transport provider. The media provider should be treated as a transport layer, not as the source of truth for class membership or teacher permissions.

### No-audio-storage design

- Do not create an audio or recording collection/model.
- Do not upload audio tracks to object storage.
- Do not persist media chunks, waveforms, or transcripts.
- Keep provider room credentials short-lived and scoped to one session and one role.
- Persist only the minimum control/audit metadata needed by the product, for example `audio enabled`, `teacher muted`, `student speaking turn granted/revoked`, `student removed`, and `student unblocked`, with actor and timestamp. Avoid storing unnecessary provider payloads or connection tokens.
- Confirm with the selected provider that recording is disabled by default and that retention, diagnostics, and any transient processing meet school privacy requirements.
- Do not log access tokens, SDP, ICE candidates, audio packets, or raw provider callbacks.

## 5. Teacher and student experience

### Teacher controls

The teacher owns the session and should be able to:

- Enable Live Audio for the current session.
- Disable Live Audio for the current session; this must stop the teacher track and disconnect or mute listeners promptly.
- Mute/unmute their own microphone while leaving the audio room available.
- See whether microphone permission is denied, no device is found, the teacher is muted, or the teacher is disconnected.
- See a roster indicator for which students are connected to the lesson/audio room. The indicator must be labeled as connection status, not listening status.
- Remove/block a selected student from the session.
- Unblock a previously blocked student.
- End the session, which must close the audio room and invalidate credentials.

The teacher's student-speaking control should be an explicit **Invite to speak / Close speaking turn** action for one student, not a silent remote microphone switch. At most one student may have publish permission at a time. The teacher must be able to revoke that permission immediately.

### Student experience

- When the teacher has not enabled audio, show a clear “Audio is off” status; do not request microphone permission.
- When audio is enabled, students may join as listeners and hear the teacher.
- A student may publish only after the teacher invites that specific student. The student must then explicitly choose to join the speaking turn and accept the browser's microphone permission prompt.
- Never request microphone access from students before a teacher invitation and an explicit student action. Browser permission cannot be granted remotely by the teacher.
- Show the invited student when their speaking turn is active, when microphone permission is needed/denied, and when the teacher closes the turn. Stop the student's local track immediately on revocation, session end, block, or disconnect.
- If removed/blocked, show a clear explanation and stop audio immediately. Do not allow automatic reconnection to bypass the block.
- If the student loses network connectivity, show a reconnecting state. Retry only while the session is active and the student remains authorized.
- Preserve existing lesson controls, question submission, and presentation state. Audio failure must not prevent a student from answering questions or viewing slides.

### Teacher-owned classroom controls

Student controls are limited to local playback conveniences such as output-volume adjustment and muting their own device. Those controls must not alter the teacher's stream, another student's access, or the session's audio-enabled state.

## 6. Server-side behavior and data model

### Session-level state

Add a small set of session-scoped audio/access fields to `LiveSession` only if they are needed as the durable control source:

- `audioEnabled` — whether the teacher has made the audio room available.
- `blockedStudentIds` — student user IDs blocked for the current session, if the list is expected to remain small; otherwise use a separate session-access collection with an index and TTL/cleanup policy.
- Optional, minimal `audioStartedAt` / `audioStoppedAt` or event history only where product support/audit needs justify it.

Do not store provider access tokens on the session document. Generate short-lived credentials only after server authorization.

### Authorization invariants

Enforce the following on every relevant server entry point:

1. Only the authenticated owner teacher can enable/disable audio and alter student access. Any existing staff observer permissions remain read-only unless the product explicitly expands them.
2. A student must be enrolled in the session class and the audio feature must be enabled before receiving a listener credential.
3. Block state is checked on HTTP session/audio joins, WebSocket joins, reconnects, and token refreshes.
4. Blocking removes any current audio-provider participant and closes/rejects the student's lesson connection as appropriate.
5. An unblock takes effect on the next authorized join; it does not automatically reconnect the student.
6. Ending or deleting the session disables audio and revokes or expires all outstanding join credentials.
7. Audio control actions are idempotent where reasonable, and invalid transitions return explicit errors.

### Realtime events

Extend the current WebSocket protocol for control state only, using established request IDs and acknowledgements. Candidate actions/events:

- Teacher actions: `audio:enable`, `audio:disable`, `audio:mute`, `audio:unmute`, `student:speaker-grant`, `student:speaker-revoke`, `student:block`, `student:unblock`.
- State/update events: audio state, teacher microphone state, selected student's speaking permission/connection state, student block state, and a refreshed teacher roster.
- Provider callbacks may be translated into sanitized connection-state updates, but must not be trusted as authorization decisions.

Use names consistent with established project conventions during implementation. Validate IDs, role, session status, and payload type on each action.

### HTTP/control integration

Provide an authorized endpoint or provider-token service for requesting a scoped audio join credential if that is the selected provider's architecture. It must:

- Check school/session scope, user role, enrollment, block state, and `audioEnabled`.
- Return only a short-lived credential with least-privilege permissions.
- Never expose a teacher control credential to a student.
- Avoid allowing client-supplied provider room names or role claims to bypass server rules.

### Event/replay/report behavior

- Record only control events that are useful for audit/support, without media.
- Do not include provider secrets or detailed connection payloads in `LiveSessionEvent`.
- Do not imply that audio-room connection proves attention.
- Do not modify grade calculations or formal assessment results based on audio state.
- Decide separately whether audio control events appear in teacher replay/report views; default to excluding them from student-visible replay and grade reports.

## 7. Phased implementation

### Phase 0 — Product, privacy, and vendor decision

**Work**

- Confirm requirements in this plan, especially teacher authority, invited student speaking turns, and session-scoped block behavior.
- Confirm the student speaking-turn behavior: one invited student at a time, explicit student acceptance and browser permission, and teacher revocation.
- Decide class-size target, typical session duration, supported browsers/devices, and whether mobile web is in scope.
- Compare managed SFU and self-hosted options for cost, regions, TURN, data processing, recording defaults, availability, and operational support.
- Review school privacy/consent expectations and provider terms. Define any required notice before enabling audio.
- Specify retention for minimal audio-control audit events.

**Exit criteria**

- A transport approach and provider/operations owner are selected.
- Security/privacy review accepts the no-recording/no-audio-storage design.
- A cost estimate and expected per-session capacity are documented.

### Phase 1 — Technical spike and failure proof

**Work**

- Create an isolated proof of concept with a teacher sender, several listeners, and one student speaker invited by the teacher at a time.
- Verify dynamic provider publish grants/revocation, student opt-in, browser microphone permission behavior, and that a teacher cannot silently open a student's microphone.
- Verify Chrome/Edge/Safari targets required by the school, headphones/echo behavior, and device switching for both teacher and invited student.
- Verify TURN/network behavior on restrictive school Wi-Fi, mobile hotspots, and reconnects.
- Measure connection time, audio latency, teacher upload, and service capacity at the target classroom size.
- Test that application database records and logs contain no audio media, provider secrets, or SDP/ICE payloads.

**Exit criteria**

- A selected SFU/transport can deliver stable teacher-to-class audio and safely grant/revoke one student speaker at the target classroom size.
- Network and browser limitations are known and surfaced as UX states.
- No media is persisted by the application and no recording capability is enabled.

### Phase 2 — Teacher-controlled audio MVP

**Work**

- Add per-session `audioEnabled` control and teacher mic mute/unmute controls.
- Add server authorization and short-lived teacher/listener credentials.
- Add student listener join flow gated by teacher audio availability and an invited-speaker flow gated by a specific teacher grant plus explicit student consent.
- Require the invited student to explicitly accept the speaking turn and grant browser microphone permission; never attempt to open the student's microphone remotely.
- Ensure only the invited student can publish, and provider revocation stops publication immediately.
- Add accessible device permission, no microphone, connecting, reconnecting, disconnected, and audio-off states.
- Make audio loss independent of slide navigation, question answer submission, and session state.
- On audio disable, revoke any student speaking turn, stop all publishing, and disconnect or mute listeners promptly.
- On session end/delete, close audio and invalidate credentials.

**Exit criteria**

- Teacher can enable audio, speak, mute/unmute, and disable it during a live lesson.
- Uninvited students cannot publish; an invited student can publish only after explicit opt-in and browser permission, and the teacher can revoke that permission immediately.
- At most one student has publish permission at a time; revoked/stale credentials cannot restore publishing.
- No audio file, recording, or transcript is stored.
- A disconnected audio service does not break core live lesson controls.

### Phase 3 — Teacher moderation and access management

**Work**

- Add a teacher roster control to remove/block a student from this active session.
- Immediately disconnect the student's audio participant and lesson connection.
- Check block state on every session and provider reconnect/token refresh path.
- Add unblock control with confirmation/clear status. Unblock permits a future join but does not force one.
- Show block state and relevant connection state in the teacher roster.
- Add safeguards for accidental blocking and reliable behavior on teacher reconnect.

**Exit criteria**

- A blocked student cannot rejoin using a new browser tab, reconnect loop, stale token, or direct endpoint.
- An unblocked student can rejoin only after normal enrollment/session checks.
- Blocking one student does not affect other students or the class roster/enrollment records.
- Session end clears or expires session-scoped blocks according to the chosen persistence design.

### Phase 4 — Resilience, accessibility, and operational readiness

**Work**

- Add teacher-facing connectivity and microphone health diagnostics that avoid exposing sensitive media details.
- Add reconnect and stale-room cleanup behavior for browser close, server restart, session end, and provider interruption.
- Provide keyboard-accessible controls, visible states, screen-reader labels, and a non-audio fallback to lesson slides/questions.
- Add service health dashboards and alerts for join failures, latency, disconnect rates, and provider errors.
- Define support procedures for microphone permission, incorrect output device, browser compatibility, and school network blocking.
- Confirm rate limits and abuse controls for token generation and block/unblock actions.

**Exit criteria**

- Automated tests cover lifecycle and security invariants.
- Support staff can diagnose common failures without accessing audio content.
- Accessibility and fallback behavior are reviewed.
- Production monitoring and incident ownership are established.

### Phase 5 — Pilot, rollout, and follow-up decisions

**Work**

- Release behind a feature flag to a small teacher pilot.
- Monitor reliability and support reports, not student listening/attention.
- Collect feedback on controls, latency, device setup, and student access handling.
- Expand rollout gradually after operational and privacy acceptance.
- Revisit multiple simultaneous student speakers, student hand-raising/queueing, and any future text chat as separate proposals after the MVP is proven.

**Exit criteria**

- Pilot meets agreed reliability and support thresholds.
- No audio persistence or unauthorized access incidents are found.
- Product owner approves wider enablement and records any follow-up scope separately.

## 8. Testing plan

### Unit tests

- Role checks for every audio and student-access action.
- Session-state transitions: waiting/live/paused/ended and audio on/off.
- Block/unblock behavior, including idempotency and session scoping.
- Credential claims contain only the intended room, role, and expiry.
- Sanitization prevents provider tokens and media negotiation details from entering application events/logs.

### Integration tests

- Enrolled student listener can obtain a receive-only credential only while audio is enabled.
- Only the currently invited student can obtain a publish-capable credential, and only while the grant is active; revocation blocks renewal and removes their provider publication.
- Unenrolled and blocked students are denied at HTTP, WebSocket, and provider-token paths.
- Teacher can remove a connected student and the server rejects reconnect.
- Unblock restores future eligibility without auto-joining.
- Teacher audio disable and session end remove/stop all participants.
- Existing lesson start/pause/slide/question/answer/end operations continue when audio is disabled or the provider is unavailable.

### Browser/end-to-end tests

- Teacher enables audio and student hears it with teacher permission granted.
- Teacher denies/no microphone, student audio output unavailable, reconnect, and network interruption all show understandable states.
- Students never receive a microphone prompt before teacher invitation and their explicit join action; uninvited students never receive publish permission.
- Teacher mute, global audio disable, speaking-turn grant/revocation, block, unblock, and end-session controls update all clients.
- Accessibility, responsive layout, keyboard operation, and no-audio fallback.

### Operational/privacy checks

- Inspect application database and logs after test sessions: no audio, recording, transcript, token, SDP, or ICE candidate data persisted.
- Verify recording remains disabled at the provider level.
- Confirm provider data location, retention, subprocessors, incident reporting, and deletion terms.
- Load-test representative session sizes and reconnect bursts.

## 9. Risks and mitigations

| Risk | Mitigation |
|---|---|
| School networks block WebRTC traffic | Choose transport with TURN support; test on representative networks; keep lesson controls usable without audio. |
| Teacher microphone permission/device failures | Detect and explain browser permission/device states; allow retry and device selection where supported. |
| Audio echo or feedback | Keep student speaking turns one-at-a-time, recommend headphones, use browser echo cancellation, and let the teacher revoke a turn immediately. |
| Block is bypassed by reconnect or stale credential | Enforce server-side block checks at every join and use short-lived credentials; remove active provider participant immediately. |
| Provider records media unexpectedly | Disable recording, verify provider settings/contracts, test persistence, and monitor configuration drift. |
| Third-party service cost or outage | Pilot and model costs; monitor usage; keep audio optional and preserve lesson functionality during outages. |
| Teacher assumes a connected student is listening | Label only as connection status; do not report attention or learning based on connection. |
| Over-expansion into conferencing/chat | Keep student speaking to one teacher-invited speaker at a time; propose open discussion, multiple speakers, and text chat separately. |

## 10. Decisions to make before implementation

1. Which SFU/provider or self-hosted transport meets target class sizes and school privacy requirements?
2. What teacher/student browsers and devices are officially supported?
3. Is a school-level feature flag or subscription entitlement required?
4. What minimal audio control events should be retained, and for how long?
5. What teacher notice or student/parent consent language is required by school policy, including for invited student speakers?

Confirmed product defaults: audio is off for new sessions; blocking lasts until the teacher unblocks the student or the session ends; no recording, audio storage, or transcripts. Student speaking uses a teacher-controlled invitation and explicit student/browser permission. The one-student-at-a-time limit is the recommended MVP safeguard to validate in Phase 1.

## 11. MVP recommendation

Build **teacher-to-student audio with a moderated speaking turn**: teacher-controlled enable/disable and mute/unmute, plus an explicit invitation that lets one selected student speak after the student opts in and grants browser microphone permission. The teacher can close the turn immediately. Include session-scoped student removal/block/unblock. Use a dedicated SFU/WebRTC service selected after Phase 0 and Phase 1. Keep application storage limited to session control state and minimal audit metadata; never store voice recordings or transcripts.

This is a moderate feature rather than a small UI change. The teacher controls and roster integration fit the current Live Lessons architecture, but reliable audio delivery across school networks, provider authorization, privacy review, and moderation safeguards are the substantive work.

## 12. Detailed implementation blueprint

This section turns the phases above into sequenced engineering work. Paths refer to the current repository layout and are planning targets; implementation should re-check the live code before changing it. Provider-specific SDKs, endpoints, token claims, and callback formats must be chosen only after Phase 0.

### Architecture boundaries

Keep four responsibilities separate:

1. **Live Lesson application state:** `LiveSession`, existing HTTP routes/controllers, and the authenticated lesson WebSocket own whether audio is enabled, session membership, teacher controls, and the block list.
2. **Audio provider adapter:** a server-side service translates authorized application decisions into provider room/token/kick operations. Controllers and WebSocket handlers should not call provider SDK APIs directly.
3. **Browser audio client:** teacher and student UI use a provider-specific client behind a small frontend hook/component boundary. The teacher may publish one audio track; students receive audio, and only one teacher-invited student may publish after explicit consent and browser permission.
4. **Audit metadata:** existing `LiveSessionEvent` may record narrowly scoped control actions if approved. It must never become a media transport, negotiation dump, or audio archive.

Do not introduce a generic “chat/conference” abstraction in the MVP. Keep the feature explicitly teacher-controlled classroom audio with moderated speaking turns.

### Proposed server service contract

After selecting a provider, define a provider-neutral server adapter with operations equivalent to:

- `createOrEnsureRoom({ sessionId, schoolId })`
- `issueTeacherCredential({ session, teacherId, expiresAt })`
- `issueListenerCredential({ session, studentId, expiresAt })`
- `issueInvitedSpeakerCredential({ session, studentId, expiresAt })` or a provider-equivalent grant applied only to the currently invited student.
- `grantStudentSpeakingTurn({ sessionId, studentId })`
- `revokeStudentSpeakingTurn({ sessionId, studentId })`
- `removeParticipant({ sessionId, studentId })`
- `closeRoom({ sessionId })`
- `getSanitizedRoomHealth({ sessionId })` only if a supported diagnostic use case needs it.

The adapter must:

- Generate room identifiers server-side from opaque session identifiers; never accept an arbitrary room name from the browser.
- Grant teacher publish permission only to the session owner, listener permission only to authorized students, and student publish permission only to the currently invited student.
- Explicitly deny uninvited student publish, student subscribe administration, recording, room creation, and moderation privileges.
- Enforce at most one invited student speaker at a time in both application state and provider permissions.
- Use short expirations and least privilege. Renewal must re-run all authorization checks.
- Return sanitized errors and never log credentials, SDP, ICE candidates, or provider request bodies.
- Make close, remove, and revoke operations safe to retry.

Provider webhooks/callbacks, if required, must authenticate the provider signature, validate the event and room against a known session, ignore stale/unknown events safely, and never grant application access. Do not persist raw callback bodies.

### Proposed session state and lifecycle

Prefer session-scoped persisted state on `LiveSession` for this MVP because the roster is already captured on the session and the block must survive reconnects and application restarts:

- `audioEnabled: Boolean`, default `false`.
- `blockedStudentIds: [ObjectId]`, default `[]`, storing user IDs (not Student profile IDs) and constrained to students in that session roster.
- `activeSpeakerStudentId: ObjectId | null`, default `null`, storing the invited student's user ID. Treat this as an authorization grant, not proof that the student is transmitting.
- Optional `teacherAudioMuted: Boolean`, default `true`, only if the application needs the state to survive teacher reconnect; otherwise make it transient and derive it from a sanitized provider/client event.

Do not store any provider token, room secret, media URL, recording location, or audio content in these fields. Consider an indexed separate access collection only if observed roster sizes make an array unsuitable; do not add that complexity without evidence.

Lifecycle requirements:

- New scheduled or immediate session: audio is off; no provider room or credential is created.
- Waiting session: teacher may configure audio availability only if product confirms that behavior; recommended default is allow setting it up but do not transmit until the session is live.
- Live session: teacher may enable/disable audio, mute/unmute their microphone, and grant/revoke the speaking turn for one enrolled roster student.
- Audio disabled: no student speaking grant is valid; disabling audio clears the active grant and stops all publishing.
- Granting a turn does not capture audio by itself. The student must accept and satisfy the browser's microphone permission prompt before a track is published.
- Blocking the active student speaker first invalidates their publish grant and removes their provider publication, then removes/blocks their session access.
- Paused session: audio policy must be explicit. Recommended default: pause presentation does not silently change microphone state; retain the teacher's chosen mute state and make the pause visible. If privacy review wants pause to force mute, define that as an explicit invariant before implementation.
- Ended/deleted session: set audio unavailable, revoke any speaking grant, close the provider room, reject new credentials, and clear session-scoped blocks on deletion/end according to the finalized retention policy.
- Stale room cleanup: a scheduled cleanup or provider TTL closes rooms for sessions already ended or deleted if an application shutdown interrupted cleanup.

Avoid depending on a frontend page unmount to stop microphone capture. Server-side end/disable and the provider room must also stop delivery. When a teacher leaves unexpectedly but the session stays live, the client must stop its local capture on page teardown; the server/provider must apply the agreed stale-publisher timeout.

### Proposed HTTP surface

Confirm exact routes and role middleware during implementation. A small surface could be:

- `POST /live/sessions/:id/audio/credential` — issue a short-lived credential for the authenticated teacher or eligible student. The server derives listener versus invited-speaker permissions from persisted session state; the client cannot request a role or permission.
- Existing `GET /live/sessions/:id` and both student join paths — reject blocked users and include sanitized `audioEnabled` / block state as appropriate.
- Existing `POST /live/sessions/:id/end` and `DELETE /live/sessions/:id` — ensure provider close and credential invalidation are performed.

Teacher audio enable/disable, mute/unmute, student speaker grant/revoke, and student block/unblock should use the existing authenticated WebSocket action/ack/state pattern where suitable. Do not create duplicate HTTP controls and WebSocket controls for the same transition unless there is a documented recovery need.

HTTP credential endpoint rules:

1. Validate session ID format and tenant/school ownership.
2. Verify session exists and is not ended.
3. For teacher credential, require the exact session owner and a live session (or an explicitly approved waiting-state setup).
4. For a listener credential, require a student account, current class enrollment, membership in the session roster where applicable, `audioEnabled === true`, and not blocked; grant subscribe-only permissions.
5. For a publish-capable student credential, additionally require that `activeSpeakerStudentId` matches the authenticated student's user ID and that the student is not blocked. The browser still requires the student to accept and grant microphone permission.
6. Return a short-lived provider credential and the minimum client configuration. Do not return any secret that grants room administration.
7. Rate-limit credential issue/renewal requests and return explicit errors for audio-off, blocked, ended, no-active-invitation, or unauthorized states.

### Proposed WebSocket protocol changes

Extend `server/realtime/liveLessonsGateway.js` through small action helpers rather than adding media-specific complexity to the general action branch.

Teacher actions (exact names may follow repository naming conventions):

- `audio:enable` / `audio:disable`
- `audio:mute` / `audio:unmute`
- `student:speaker-grant` / `student:speaker-revoke` with a validated roster student ID
- `student:block` / `student:unblock` with a validated `studentId`

Server handling:

- Confirm socket is the session owner teacher; observer roles remain read-only.
- Allow only one active student speaking grant. Granting another turn must either fail until the current turn is revoked or explicitly revoke the previous turn before granting the new one; choose and test one deterministic behavior.
- Persist the speaker grant before issuing or refreshing a publish-capable student credential. On revoke, invalidate credentials/publication and clear the grant before acknowledging success.
- Students cannot grant themselves a turn. A grant only makes the student eligible to opt in; it does not bypass browser permission.
- Confirm session state is valid for the action and persist state before acknowledging success.
- Make repeated enable/disable/mute/unmute requests predictable and idempotent.
- On audio disable, revoke any active student speaking turn, stop provider publishing/delivery or close the room, then broadcast state.
- On block, persist the block first, remove the provider participant, close every matching student lesson socket in `sessionSockets` (including multiple tabs), update teacher roster, and broadcast the blocked outcome.
- If the blocked student has the speaking turn, revoke publishing as part of blocking and do not report block success until access is denied and provider removal is confirmed or an explicit reconciliation state is returned.
- On unblock, clear the block and update roster; do not create a credential or auto-join the student.
- On every subsequent WebSocket `join`, re-check block state before adding the socket to `sessionSockets` or emitting lesson state.
- On failures, return an actionable negative `ack`; never send a success-shaped response when provider removal/room closure failed. Define retry/reconciliation behavior for a state where persisted state changed but the provider operation failed.

State broadcast must not expose the blocked list to other students. A blocked student should receive only their own denied/removed explanation. The teacher may receive the roster with a blocked status.

### Membership and ban enforcement inventory

During implementation, trace and protect every path that could restore access:

- `POST /live/sessions/:id/join`
- `POST /live/sessions/join` by join code
- `GET /live/sessions/:id`
- WebSocket `join` in `liveLessonsGateway.js`
- WebSocket reconnect/rejoin after transport interruption
- Audio credential issuance and renewal
- Any session list/available-session endpoint that offers a join action
- Provider participant reconnect, if the provider supports it

Do not treat hiding a student from a list or closing one socket as a block. The database block state is authoritative, and every path must consult it. Blocking is session-scoped: it must not mutate `Student.currentClass`, `Student.enrolledClasses`, account status, or class enrollment.

### Frontend work breakdown

Teacher and student surfaces share `server/client/src/pages/liveLessons/LiveLessonSessionPage.jsx`; keep role-specific controls explicit and avoid rendering teacher controls for observers.

Suggested frontend units after provider selection:

- `server/client/src/hooks/useLiveLessonAudio.js` — provider connection lifecycle, local media cleanup, track state, listener attach/detach, retry, and sanitized UI errors.
- `server/client/src/components/liveLessons/LiveLessonAudioControls.jsx` — teacher enable/disable, mic mute/unmute, permission/device messages, and connection state.
- `server/client/src/components/liveLessons/LiveLessonAudioPlayer.jsx` — student output, local volume/mute control, and explicit accept/leave speaking-turn controls when invited.
- Teacher roster action component or the existing roster area — invite/revoke speaking turn and block/unblock confirmation with accessible status.

Implementation requirements:

- Load/initialize the provider client only when authorized audio is enabled; no early microphone prompt.
- Request teacher microphone permission only after the teacher explicitly enables audio. For students, request microphone permission only after the teacher grants a speaking turn and the student explicitly accepts it. Never request it for listeners or observers.
- Do not assume a teacher action succeeded until the WebSocket acknowledgement/server state confirms it. If provider capture fails after audio is enabled, keep the failure visible and allow retry/disable.
- Always stop all local `MediaStreamTrack`s on mute/disable, session end, component teardown, logout, or session switch as appropriate. Distinguish “muted” (track exists but not transmitted) from “disabled” (audio unavailable).
- A student audio attachment failure must leave slide rendering and answer submission operational.
- When the teacher revokes a speaking turn, the student client must stop every local microphone track and disconnect/rejoin with listener-only permissions. Stale credentials or reconnects must not restore publishing.
- Teacher block action should confirm the affected student and explain that access is blocked only for this session. Expose unblock for the same roster entry.
- Show connection states (“not connected”, “connecting”, “connected”, “reconnecting”, “blocked”), not “listening”, “attentive”, or “present” based on provider presence alone.
- Prevent stale asynchronous provider callbacks from updating a different session after navigation.
- Keep keyboard access, visible focus, accessible labels, screen-reader announcements for meaningful state changes, and mobile layout.

### Suggested engineering work packages and dependencies

| ID | Package | Main targets | Depends on | Completion evidence |
|---|---|---|---|---|
| A0 | Product/privacy/provider decision | This document; provider/legal/security decision record | None | Owner, capacity, supported devices, consent, retention, feature entitlement, and provider selected |
| A1 | Media transport spike | Isolated POC; no production session state | A0 | Teacher-to-many plus one invited student speaker test, TURN/network results, browser permission/revocation matrix, cost and capacity evidence |
| B1 | Feature configuration and session model | Feature-gate configuration; `LiveSession.js`; session create/read/end/delete paths | A0 | Audio defaults off; no credentials/media in database; lifecycle tests pass |
| B2 | Provider adapter and credential issuance | New server provider service; credential controller/routes; secrets/config management | A1, B1 | Role-scoped short-lived credentials; no secrets in logs; provider mocked in unit tests |
| B3 | Server audio state actions | `liveLessonsGateway.js`; live session service; `LiveSessionEvent.js` only if approved | B1, B2 | Owner-only audio transitions and single-student speaking grants persist and broadcast; invalid roles/states rejected |
| B4 | Student block enforcement | Session join controller paths; gateway joins/reconnects; provider adapter; roster state | B1, B2 | Block survives reconnect/restart and blocks all join/credential paths; unblock permits later manual rejoin |
| C1 | Teacher audio UI | `LiveLessonSessionPage.jsx`; audio controls; `useLiveLessonAudio.js` | B2, B3 | Teacher enable/mute/disable states work, including permission and device failures |
| C2 | Student listener/speaker UI | `LiveLessonSessionPage.jsx`; audio player; `useLiveLessonAudio.js` | B2, B3, C1 | Students listen when enabled; only an invited student may opt in and publish; revocation stops their track; failure does not break lesson |
| C3 | Speaking-turn and moderation UI | Teacher roster UI in session page | B3, B4 | Teacher can invite/revoke one speaker and block/unblock; roster/audio update and failures are surfaced |
| D1 | Security and integration tests | Server tests for controller, socket, credentials, provider adapter | B2, B3, B4 | Authorization matrix and stale credential/reconnect cases pass |
| D2 | Browser/accessibility/resilience tests | Client unit/E2E, real-device/manual browser matrix | C1, C2, C3 | Permission, reconnect, cleanup, accessibility, mobile and fallback checks pass |
| D3 | Operations and pilot | Monitoring, feature flag, support runbook, staged rollout | D1, D2 | Alerting and rollback tested; pilot exit thresholds met |

Do not start B2 before provider selection, and do not start student blocking UI before B4 server enforcement exists. Frontend work may prototype against a mocked adapter after the provider interface is settled, but must not ship controls that imply server enforcement before it is available.

## 13. Authorization and state-transition matrix

| Actor | Audio off/on | Teacher mic mute/unmute | Issue teacher credential | Listener credential | Student speaker credential | Grant/revoke speaking turn | Block/unblock student | Join lesson while blocked |
|---|---|---|---|---|---|---|---|---|
| Session owner teacher | Allowed only in permitted session state | Allowed | Allowed, publish-only, short-lived | Not needed | Not needed | Allowed for one roster student | Allowed for roster students | Not applicable |
| Other teacher/admin/principal observer | Read-only state only unless owner | Denied | Denied | Denied | Denied | Denied | Denied | Not applicable |
| Enrolled, unblocked student without active invitation | Read-only audio state | Denied | Denied | Allowed only when audio enabled; subscribe-only | Denied | Denied | Denied | Not applicable |
| Enrolled student with active teacher invitation | Read-only audio state; may accept invitation | Denied | Denied | Allowed only when audio enabled; subscribe-only | Allowed only for this student and active grant; publish-only after browser permission | Cannot grant/revoke; may leave voluntarily | Denied | Not applicable |
| Blocked student | May receive denial/status only | Denied | Denied | Denied | Denied | Denied | Denied | Denied across HTTP, WebSocket, provider token, and reconnect |
| Unenrolled student | Denied | Denied | Denied | Denied | Denied | Denied | Denied | Denied by existing enrollment checks |

All operations also require school/tenant scope. “Admin” does not automatically mean session owner for live controls; preserve the current owner-only socket rule unless product explicitly changes it.

## 14. Failure handling and reconciliation

Define outcomes before implementation so provider outages do not create misleading states:

- **Provider unavailable before enable:** fail the enable request, leave `audioEnabled` false, show a retryable teacher error.
- **Provider unavailable after session audio was enabled:** retain an explicit degraded/unavailable state or disable audio using a documented reconciliation rule; do not display “connected” based only on persisted `audioEnabled`.
- **Teacher permission denied/no device:** the server may allow audio availability but the teacher client reports it cannot publish. Clearly distinguish “audio available” from “teacher transmitting.”
- **Invited student denies permission or cannot access a microphone:** keep them a listener, show a clear state to that student and the teacher, and leave lesson controls unaffected. Do not silently grant or retry microphone permission.
- **Speaking turn revoked while student is connected:** revoke provider publish permission, stop the local track, and ensure reconnect/token refresh returns listener-only credentials.
- **Teacher loses network:** stop local tracks immediately on client close/unmount; use provider participant timeout to stop stale publishing. Reconnect requires a fresh authorized credential.
- **Disable succeeds in app but provider close fails:** mark cleanup pending or retry server-side; do not claim the room is fully closed. A scheduled reconciliation should close rooms for sessions with audio disabled or ended.
- **Block persists but provider kick fails:** deny future app credentials and joins immediately, report the kick failure to the teacher, and retry removal/reconciliation. The student must not be able to regain access by reconnecting.
- **App server restarts:** provider rooms must not outlive session authorization indefinitely. Use short-lived credentials, room TTL, and cleanup reconciliation.
- **WebSocket disconnects:** provider audio should not grant lesson access on its own. Rejoining the application lesson and refreshing a token re-runs all membership and block checks.

Log only session ID, event category, provider request/correlation ID if non-sensitive, status, and sanitized error code. Do not log tokens, provider credentials, raw signaling payloads, audio, or transcripts.

## 15. Phase-specific definition of done

### Phase 0 is done when

- Product confirms teacher owner authority, session-scoped block semantics, teacher broadcast, and teacher-invited one-student speaking turns with explicit student/browser permission.
- Privacy/security confirms no recording and approves the provider evaluation.
- Capacity targets, supported browsers, tenant feature entitlement, data processing, and retention are written down.
- A provider and accountable operations owner are selected.

### Phase 1 is done when

- POC proves teacher-to-listener audio and a teacher-invited, student-consented speaking turn at the agreed target size over representative restrictive networks.
- TURN/fallback behavior, latency, reconnect, teacher and student device permission, speaking-turn revocation, and mobile constraints are measured.
- Provider recording is verified disabled and application persistence/logging inspection shows no media or credentials.
- A rollback and service cost estimate are accepted.

### Phases 2–3 are done when

- All server state transitions and authorization matrix tests pass.
- Audio is disabled by default and cannot be enabled by a student or observer.
- Uninvited student publishing is denied by both provider credential claims and provider-side room settings; the invited student can publish only for the active grant and after browser permission.
- Block enforcement works over HTTP, WebSocket, repeated reconnect, multiple tabs, and token renewal.
- Provider close/kick cleanup is retried and observable; no silent success on failed cleanup.
- Existing slide, question, response, report, gradebook, and replay tests remain green.

### Phases 4–5 are done when

- Supported browser/device and accessibility checks pass with clear no-audio fallback.
- Operational dashboards show sanitized reliability metrics, with alert and escalation owners.
- Pilot cohort and expansion/rollback thresholds are approved before feature flag rollout.
- Privacy/security checks confirm no recording and no audio/transcript persistence in application data.
- Pilot feedback is reviewed before student speaking, text chat, transcription, or recording is considered.
