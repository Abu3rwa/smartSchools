import { useEffect, useRef, useState } from "react";
import { HiOutlineStop, HiOutlineVolumeUp } from "react-icons/hi";
import { useTranslation } from "react-i18next";
import toast from "react-hot-toast";
import readingService from "../../../services/readingService.js";
import "./ModelAudioPreview.css";

/** Lets a teacher hear each generated part before assigning the practice. */
export default function ModelAudioPreview({ textId, parts }) {
  const { t } = useTranslation(["reading"]);
  const [playingKey, setPlayingKey] = useState("");
  const [loadingKey, setLoadingKey] = useState("");
  const audioRef = useRef(null);
  const urlRef = useRef("");

  useEffect(() => () => {
    audioRef.current?.pause();
    if (urlRef.current) URL.revokeObjectURL(urlRef.current);
  }, []);

  const stop = () => {
    const audio = audioRef.current;
    if (audio) {
      audio.pause();
      audio.removeAttribute("src");
      audio.load();
    }
    if (urlRef.current) {
      URL.revokeObjectURL(urlRef.current);
      urlRef.current = "";
    }
    setPlayingKey("");
  };

  const play = async (part) => {
    const id = `${part.level ?? ""}|${part.key}|${part.textHash || ""}`;
    if (playingKey === id) {
      stop();
      return;
    }
    stop();
    setLoadingKey(id);
    try {
      // Always fetched fresh, so a regenerated clip is never played from cache.
      const response = await readingService.getFluencyModelAudio(
        textId,
        part.key,
        part.level,
        part.textHash,
      );
      urlRef.current = URL.createObjectURL(response.data);
      const audio = audioRef.current;
      audio.src = urlRef.current;
      await audio.play();
      setPlayingKey(id);
    } catch {
      toast.error(t("reading:fluency.previewFailed"));
    } finally {
      setLoadingKey("");
    }
  };

  if (!textId || !parts.length) return null;

  return (
    <div className="model-audio-preview">
      <audio
        ref={audioRef}
        preload="none"
        onEnded={() => setPlayingKey("")}
        onError={() => setPlayingKey("")}
      />
      <ul>
        {parts.map((part, index) => {
          const id = `${part.level ?? ""}|${part.key}|${part.textHash || ""}`;
          const playing = playingKey === id;
          return (
            <li key={id}>
              <span className="model-audio-preview-title">
                {part.title || t("reading:fluency.previewPart", { n: index + 1 })}
              </span>
              <button
                type="button"
                className="btn btn-secondary btn-sm"
                onClick={() => play(part)}
                disabled={loadingKey === id}
              >
                {playing ? (
                  <HiOutlineStop size={14} aria-hidden="true" />
                ) : (
                  <HiOutlineVolumeUp size={14} aria-hidden="true" />
                )}
                {playing
                  ? t("reading:fluency.previewStop")
                  : t("reading:fluency.previewPlay")}
              </button>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
