import { useCallback, useEffect, useRef, useState } from 'react';
import readingService from '../../../../../services/readingService.js';

const usableParts = (parts) => (Array.isArray(parts) ? parts : []).filter((part) => (
  part?.available && part?.modelAudio && String(part?.text || '').trim()
));

const cacheKeyFor = (textId, part) => (
  `${textId}|${part.key}|${part.modelAudioHash || part.level || ''}`
);

/**
 * The model voice the teacher generated lives on the fluency parts, so the book
 * asks the fluency view for them. Clips are cached as blob URLs per chapter; the
 * caller decides what to do when a page has no model audio (browser speech).
 */
export const useBookModelAudio = ({ assignmentId, textId, enabled }) => {
  const [parts, setParts] = useState([]);
  const cacheRef = useRef(new Map());
  const readyRef = useRef(Promise.resolve([]));
  const audioRef = useRef(null);
  const chainRef = useRef(null);

  const stop = useCallback(() => {
    const chain = chainRef.current;
    chainRef.current = null;
    if (chain) {
      chain.cancelled = true;
      chain.abort?.();
    }
    const audio = audioRef.current;
    if (!audio) return;
    audio.pause();
    audio.removeAttribute('src');
    audio.load();
  }, []);

  useEffect(() => {
    let active = true;
    stop();
    for (const url of cacheRef.current.values()) URL.revokeObjectURL(url);
    cacheRef.current.clear();
    setParts([]);
    if (!enabled || !assignmentId) {
      readyRef.current = Promise.resolve([]);
      return () => { active = false; };
    }
    readyRef.current = readingService.getFluencyAssignment(assignmentId)
      .then((response) => usableParts(response.data?.data?.parts))
      .catch(() => [])
      .then((list) => {
        if (!active) return [];
        setParts(list);
        return list;
      });
    return () => { active = false; };
  }, [assignmentId, enabled, stop]);

  useEffect(() => () => {
    stop();
    for (const url of cacheRef.current.values()) URL.revokeObjectURL(url);
    cacheRef.current.clear();
  }, [stop]);

  // Resolves with this chapter's clips, waiting for the one fluency request.
  const ready = useCallback(() => readyRef.current, []);

  const ensureUrl = useCallback(async (part) => {
    const key = cacheKeyFor(textId, part);
    const cached = cacheRef.current.get(key);
    if (cached) return cached;
    const response = await readingService.getFluencyModelAudio(
      textId,
      part.key,
      part.level,
      part.modelAudioHash,
    );
    const url = URL.createObjectURL(response.data);
    const existing = cacheRef.current.get(key);
    if (existing) {
      URL.revokeObjectURL(url);
      return existing;
    }
    cacheRef.current.set(key, url);
    return url;
  }, [textId]);

  const preload = useCallback((clips) => {
    (clips || []).forEach((clip) => { ensureUrl(clip).catch(() => {}); });
  }, [ensureUrl]);

  const play = useCallback(async (clips, { onEnd } = {}) => {
    if (!textId || !clips?.length) return false;
    stop();
    if (!audioRef.current) {
      audioRef.current = new Audio();
      audioRef.current.preload = 'auto';
    }
    const audio = audioRef.current;
    const chain = { cancelled: false, abort: null };
    chainRef.current = chain;
    const release = () => {
      if (chainRef.current === chain) chainRef.current = null;
    };
    let played = false;

    for (const clip of clips) {
      if (chain.cancelled) return true;
      let url;
      try {
        url = await ensureUrl(clip);
      } catch {
        if (!played) {
          release();
          return false;
        }
        break;
      }
      if (chain.cancelled) return true;
      const finished = await new Promise((resolve) => {
        const cleanup = () => {
          audio.removeEventListener('ended', done);
          audio.removeEventListener('error', failed);
          chain.abort = null;
        };
        const done = () => { cleanup(); resolve(true); };
        const failed = () => { cleanup(); resolve(false); };
        chain.abort = () => { cleanup(); resolve(false); };
        audio.addEventListener('ended', done);
        audio.addEventListener('error', failed);
        audio.src = url;
        const started = audio.play();
        if (started?.catch) started.catch(failed);
      });
      if (!finished) {
        if (!played) {
          release();
          return false;
        }
        break;
      }
      played = true;
    }

    release();
    if (!chain.cancelled) onEnd?.();
    return true;
  }, [ensureUrl, stop, textId]);

  return { parts, play, stop, preload, ready };
};

export default useBookModelAudio;
