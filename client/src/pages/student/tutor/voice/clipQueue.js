/**
 * Plays one spoken turn clip by clip. Every clip is fetched in parallel, so the
 * first sentence starts as soon as its own bytes arrive; the rest wait their
 * turn. Blob URLs are kept for the last two turns, so replay never downloads
 * or decodes anything again.
 */
export const createClipQueue = ({
  createAudio = (url) => new Audio(url),
  createUrl = (blob) => URL.createObjectURL(blob),
  revokeUrl = (url) => URL.revokeObjectURL(url),
  gapMs = 260,
  maxTurns = 2,
  timers = { setTimeout, clearTimeout },
} = {}) => {
  let token = 0;
  let current = null;
  let turns = [];

  const revokeTurn = (turn) => {
    for (const item of turn.urls) {
      if (item?.url) revokeUrl(item.url);
    }
    turn.urls.length = 0;
  };

  const keepTurn = (turn) => {
    if (!turn.turnId) return;
    turns = turns.filter((row) => row.turnId !== turn.turnId);
    turns.push(turn);
    while (turns.length > maxTurns) revokeTurn(turns.shift());
  };

  const cancel = () => {
    token += 1;
    const state = current;
    current = null;
    if (!state) return;
    state.controller.abort();
    if (state.timer) timers.clearTimeout(state.timer);
    state.timer = null;
    if (state.audio) {
      state.audio.onended = null;
      state.audio.onerror = null;
      try {
        state.audio.pause();
      } catch {
        /* the element may already be detached */
      }
    }
    state.settleAudio?.();
    state.settleWait?.();
  };

  const play = async ({ turnId = "", clips = [], loadClip, onState } = {}) => {
    cancel();
    const my = token;
    const live = () => my === token;
    const state = {
      controller: new AbortController(),
      timer: null,
      audio: null,
      settleAudio: null,
      settleWait: null,
    };
    current = state;

    let entry = turnId
      ? turns.find((turn) => turn.turnId === turnId) || null
      : null;
    if (!entry) {
      entry = { turnId, urls: [] };
      keepTurn(entry);
    } else {
      // A replay makes this turn the most recent, so it is the last to go.
      keepTurn(entry);
    }

    const ready = new Map();
    const loaded = new Set();
    clips.forEach((clip, position) => {
      const item = entry.urls[position];
      if (item?.url) {
        loaded.add(position);
        ready.set(position, Promise.resolve(item.url));
        return;
      }
      entry.urls[position] = null;
      const index = Number.isInteger(clip?.index) ? clip.index : position;
      ready.set(
        position,
        Promise.resolve()
          .then(() => loadClip({ index, signal: state.controller.signal }))
          .then((blob) => {
            const url = createUrl(blob);
            entry.urls[position] = { url };
            loaded.add(position);
            return url;
          })
          .catch(() => null),
      );
    });

    let failed = false;
    let played = 0;
    for (let position = 0; position < clips.length; position += 1) {
      if (!live()) return { cancelled: true, failed, played };
      // The board part is shown while its clip is still downloading.
      if (!loaded.has(position))
        onState?.({ type: "waiting", index: position });
      const url = await ready.get(position);
      if (!live()) return { cancelled: true, failed, played };
      if (!url) {
        failed = true;
        onState?.({ type: "failed", index: position });
        continue;
      }

      const audio = createAudio(url);
      if (audio) {
        audio.preload = "auto";
        state.audio = audio;
        onState?.({ type: "playing", index: position });
        const ended = await new Promise((resolve) => {
          let done = false;
          const finish = (value) => {
            if (done) return;
            done = true;
            state.settleAudio = null;
            resolve(value);
          };
          state.settleAudio = () => finish(false);
          audio.onended = () => finish(true);
          audio.onerror = () => finish(false);
          let started;
          try {
            started = audio.play();
          } catch {
            finish(false);
          }
          if (started && typeof started.catch === "function") {
            started.catch(() => finish(false));
          }
        });
        state.audio = null;
        if (!live()) return { cancelled: true, failed, played };
        if (!ended) {
          failed = true;
          onState?.({ type: "failed", index: position });
          continue;
        }
        played += 1;
        // The pause only exists to separate two clips that are both ready; a
        // clip still downloading would be waited for anyway, so no gap there.
        const next = position + 1;
        if (next < clips.length && loaded.has(next)) {
          await new Promise((resolve) => {
            state.settleWait = resolve;
            state.timer = timers.setTimeout(() => {
              state.timer = null;
              state.settleWait = null;
              resolve();
            }, gapMs);
          });
          if (!live()) return { cancelled: true, failed, played };
        }
      }
    }

    if (current === state) current = null;
    onState?.({ type: "done", failed, played, cancelled: false });
    return { cancelled: false, failed, played };
  };

  const clear = () => {
    cancel();
    turns.forEach(revokeTurn);
    turns = [];
  };

  return { play, cancel, clear, stop: cancel };
};
