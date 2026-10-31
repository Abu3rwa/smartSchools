const RETURNING_KEY = "gb_returning_visitor";

export const markReturning = () => {
  try {
    localStorage.setItem(RETURNING_KEY, "1");
  } catch {
    /* storage can be blocked; the login screen is still reachable by URL */
  }
};

export const isReturning = () => {
  try {
    return localStorage.getItem(RETURNING_KEY) === "1";
  } catch {
    return false;
  }
};
