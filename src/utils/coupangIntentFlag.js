// Module-level singleton — resets to false on every cold start (no persistence).
// Set to true immediately before opening a Coupang outbound URL.
// Read and reset by GlobalMagicNudge when app returns to foreground.

let _expecting = false;

export function setExpectingCoupangReturn() {
  _expecting = true;
}

export function consumeExpectingCoupangReturn() {
  const was = _expecting;
  _expecting = false;
  return was;
}
