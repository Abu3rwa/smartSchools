const ShareInvitations = ({
  incomingShares,
  outgoingShares,
  selectedIncomingShareIds,
  bulkRespondingToShares,
  onToggleAllIncoming,
  onToggleIncoming,
  onRespondToSelectedShares,
  onRespondToShare,
  onRevokeShare,
  getTeacherName,
}) => (
  <section
    className="live-share-invitations"
    aria-label="Lesson sharing invitations"
  >
    {incomingShares.length > 0 && (
      <div>
        <div className="live-share-bulk-heading">
          <h2>Lessons shared with you</h2>
          <label>
            <input
              type="checkbox"
              aria-label="Select all incoming lesson invitations"
              checked={
                incomingShares.length > 0 &&
                incomingShares.every((invitation) =>
                  selectedIncomingShareIds.includes(
                    String(invitation._id),
                  ),
                )
              }
              onChange={(event) => onToggleAllIncoming(event.target.checked)}
            />
            Select all
          </label>
        </div>
        <div className="live-share-bulk-actions">
          <button
            className="live-primary-button"
            disabled={bulkRespondingToShares}
            onClick={() =>
              onRespondToSelectedShares(
                "accept",
                incomingShares.map((invitation) =>
                  String(invitation._id),
                ),
              )
            }
          >
            {bulkRespondingToShares ? "Processing…" : "Accept all"}
          </button>
          <button
            className="live-secondary-button"
            disabled={bulkRespondingToShares}
            onClick={() =>
              onRespondToSelectedShares(
                "decline",
                incomingShares.map((invitation) =>
                  String(invitation._id),
                ),
              )
            }
          >
            Decline all
          </button>
          {selectedIncomingShareIds.length > 0 && (
            <>
              <button
                className="live-primary-button"
                disabled={bulkRespondingToShares}
                onClick={() => onRespondToSelectedShares("accept")}
              >
                Accept selected ({selectedIncomingShareIds.length})
              </button>
              <button
                className="live-secondary-button"
                disabled={bulkRespondingToShares}
                onClick={() => onRespondToSelectedShares("decline")}
              >
                Decline selected ({selectedIncomingShareIds.length})
              </button>
            </>
          )}
        </div>
        <ul>
          {incomingShares.map((invitation) => (
            <li key={invitation._id}>
              <input
                type="checkbox"
                aria-label={`Select invitation for ${invitation.lesson?.title || "shared lesson"}`}
                checked={selectedIncomingShareIds.includes(
                  String(invitation._id),
                )}
                disabled={bulkRespondingToShares}
                onChange={(event) =>
                  onToggleIncoming(
                    String(invitation._id),
                    event.target.checked,
                  )
                }
              />
              <div>
                <strong>
                  {invitation.lesson?.title || "Shared lesson"}
                </strong>
                <span>
                  From{" "}
                  {[
                    invitation.sender?.firstName,
                    invitation.sender?.lastName,
                  ]
                    .filter(Boolean)
                    .join(" ") || "a teacher"}
                  {invitation.lesson?.subject
                    ? ` · ${invitation.lesson.subject}`
                    : ""}
                </span>
              </div>
              <div className="live-share-actions">
                <button
                  className="live-primary-button"
                  disabled={bulkRespondingToShares}
                  onClick={() =>
                    onRespondToShare(invitation._id, "accept")
                  }
                >
                  Accept and add
                </button>
                <button
                  className="live-secondary-button"
                  disabled={bulkRespondingToShares}
                  onClick={() =>
                    onRespondToShare(invitation._id, "decline")
                  }
                >
                  Decline
                </button>
              </div>
            </li>
          ))}
        </ul>
      </div>
    )}
    {outgoingShares.length > 0 && (
      <div>
        <h2>Pending shares</h2>
        <ul>
          {outgoingShares.map((invitation) => (
            <li key={invitation._id}>
              <div>
                <strong>
                  {invitation.lesson?.title || "Shared lesson"}
                </strong>
                <span>
                  Shared with {getTeacherName(invitation.recipient)}
                </span>
              </div>
              <button
                className="live-delete-session"
                onClick={() => onRevokeShare(invitation._id)}
              >
                Revoke
              </button>
            </li>
          ))}
        </ul>
      </div>
    )}
  </section>
);

export default ShareInvitations;
