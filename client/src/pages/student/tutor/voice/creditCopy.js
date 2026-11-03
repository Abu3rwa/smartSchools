const whole = (value) => {
  const number = Math.floor(Number(value));
  return Number.isFinite(number) && number > 0 ? number : 0;
};

/** Credits are cents; a message costs a fixed number of them. */
export const messagesLeft = (credits, price) => {
  const cost = whole(price);
  if (!cost) return 0;
  return Math.floor(whole(credits) / cost);
};

/** ok: two or more messages left; last: exactly one; empty: cannot pay now. */
export const walletState = ({ credits = 0, price = 0 } = {}) => {
  const cost = whole(price);
  const balance = whole(credits);
  if (!cost) return "ok";
  if (balance < cost) return "empty";
  return balance - cost < cost ? "last" : "ok";
};

/** A student who never had enough is told differently from one who ran out. */
export const emptyReason = ({ creditsSpent = 0 } = {}) =>
  whole(creditsSpent) > 0 ? "ranOut" : "noCredit";

export const creditCopy = ({
  credits = 0,
  price = 0,
  creditsSpent = 0,
} = {}) => {
  const state = walletState({ credits, price });
  return {
    credits: whole(credits),
    price: whole(price),
    messages: messagesLeft(credits, price),
    state,
    canAsk: state !== "empty",
    reason: state === "empty" ? emptyReason({ creditsSpent }) : "",
  };
};
