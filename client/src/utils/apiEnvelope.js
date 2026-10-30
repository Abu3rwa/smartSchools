// Support endpoints answer with { success: true, data: {...} }; callers want the payload inside data.
export const unwrapEnvelope = (request) => request.then((response) => response.data.data);
