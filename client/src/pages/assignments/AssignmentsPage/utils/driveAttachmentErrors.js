/**
 * Turns a Drive upload failure into the most specific sentence we can stand
 * behind: Google's own reason when it gave one, the server's message next,
 * and the generic copy only when we know nothing else.
 */
export const driveUploadErrorMessage = (t, error) => {
  const data = error?.response?.data;
  if (data?.code === "DRIVE_FILE_API_FAILED" && data.reason) {
    const key =
      data.step === "share"
        ? "assignments:driveAttachments.testShareBlocked"
        : "assignments:driveAttachments.testUploadBlocked";
    return t(key, { reason: data.reason });
  }
  return (
    data?.message || t("assignments:driveAttachments.uploadFailed")
  );
};
