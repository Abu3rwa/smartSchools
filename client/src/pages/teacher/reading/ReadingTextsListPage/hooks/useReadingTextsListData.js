import { useState, useEffect, useRef, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { useDispatch, useSelector } from "react-redux";
import {
  fetchTexts,
  fetchTeacherAssignments,
  createAssignment,
  selectReadingTexts,
  selectReadingAssignments,
  selectReadingLoading,
  selectReadingError,
} from "../../../../../store/slices/readingSlice.js";
import { selectClasses } from "../../../../../store/slices/classSlice.js";
import { selectCurrentAcademicYear } from "../../../../../store/slices/uiSlice.js";
import readingService from "../../../../../services/readingService.js";
import toast from "react-hot-toast";
import { useTranslation } from "react-i18next";

const isEnglishText = (text) => {
  const language = String(text?.language || "").trim().toLowerCase();
  return !language || language === "en" || language === "english";
};

const defaultFluency = (parts = []) => ({
  parts,
  minReadings: 3,
  maxReadingsPerPart: 6,
  targetAccuracy: 95,
  targetWpm: "",
  showPace: true,
  requireListenFirst: false,
});

/** Parts as the teacher sees them, one row per key even across levels. */
const partsFromCoverage = (coverage) => {
  if (!coverage) return [];
  const byKey = new Map();
  for (const level of coverage.levels || []) {
    for (const block of level.blocks || []) {
      const current = byKey.get(block.key);
      if (!current) {
        byKey.set(block.key, {
          key: block.key,
          title: block.title || "",
          wordCountMin: block.wordCount,
          wordCountMax: block.wordCount,
          isList: Boolean(block.isList),
          blocks: 1,
          generated: block.generated ? 1 : 0,
        });
        continue;
      }
      current.wordCountMin = Math.min(current.wordCountMin, block.wordCount);
      current.wordCountMax = Math.max(current.wordCountMax, block.wordCount);
      current.isList = current.isList || Boolean(block.isList);
      current.blocks += 1;
      if (block.generated) current.generated += 1;
    }
  }
  return [...byKey.values()];
};

export function useReadingTextsListData() {
  const { t } = useTranslation(["reading"]);
  const navigate = useNavigate();
  const dispatch = useDispatch();
  const texts = useSelector(selectReadingTexts) || [];
  const assignments = useSelector(selectReadingAssignments) || [];
  const classes = useSelector(selectClasses) || [];
  const academicYear = useSelector(selectCurrentAcademicYear);
  const loading = useSelector(selectReadingLoading);
  const error = useSelector(selectReadingError);

  const [assignModal, setAssignModal] = useState(null);
  const [assignClassId, setAssignClassId] = useState("");
  const [assignDueDate, setAssignDueDate] = useState("");
  const [assignInstructions, setAssignInstructions] = useState("");
  const [assignPublished, setAssignPublished] = useState(true);
  const [assignPublishAt, setAssignPublishAt] = useState("");
  const [assignSubmitting, setAssignSubmitting] = useState(false);
  const [readingGate, setReadingGate] = useState(null);
  const [fluency, setFluency] = useState(null);
  const [coverage, setCoverage] = useState(null);
  const [coverageLoading, setCoverageLoading] = useState(false);
  const [coverageError, setCoverageError] = useState("");
  const [generatingAudio, setGeneratingAudio] = useState(false);
  const [audioProgress, setAudioProgress] = useState(null);
  const audioCancelled = useRef(false);
  const coverageRequest = useRef(0);
  const partsChosen = useRef(false);

  useEffect(() => {
    dispatch(fetchTexts());
    dispatch(fetchTeacherAssignments({ academicYear }));
  }, [dispatch, academicYear]);

  useEffect(() => {
    if (error) toast.error(error);
  }, [error]);

  const coverageParts = useMemo(() => partsFromCoverage(coverage), [coverage]);

  useEffect(() => {
    if (!fluency || partsChosen.current || fluency.parts.length > 0) return;
    const suggested = coverageParts.filter((part) => !part.isList).map((part) => part.key);
    if (suggested.length === 0) return;
    partsChosen.current = true;
    setFluency((current) => (
      current && current.parts.length === 0
        ? { ...current, parts: suggested }
        : current
    ));
  }, [coverageParts, fluency]);

  const openAssignModal = (text) => {
    setAssignModal(text);
    setAssignClassId("");
    setAssignDueDate("");
    setAssignInstructions("");
    setAssignPublished(true);
    setAssignPublishAt("");
    setReadingGate(null);
    setFluency(null);
    partsChosen.current = false;
    setCoverage(null);
    setCoverageError("");
    const request = coverageRequest.current + 1;
    coverageRequest.current = request;
    if (!isEnglishText(text)) {
      setCoverageLoading(false);
      return;
    }
    setCoverageLoading(true);
    readingService.getModelAudioCoverage(text._id)
      .then((response) => {
        if (coverageRequest.current !== request) return;
        setCoverage(response.data?.data || null);
      })
      .catch((requestError) => {
        if (coverageRequest.current !== request) return;
        setCoverageError(
          requestError.response?.data?.message || t("reading:texts.fluency.coverageFailed"),
        );
      })
      .finally(() => {
        if (coverageRequest.current === request) setCoverageLoading(false);
      });
  };

  const closeAssignModal = () => {
    coverageRequest.current += 1;
    setAssignModal(null);
    setAssignPublished(true);
    setAssignPublishAt("");
    setFluency(null);
    setCoverage(null);
    setCoverageError("");
    setCoverageLoading(false);
  };

  const enableFluency = () => {
    if (!isEnglishText(assignModal)) return;
    partsChosen.current = false;
    setFluency(defaultFluency());
  };

  const enableReadingGate = () => setReadingGate({
    lockScope: "quiz_and_thinking",
    minReadSeconds: "",
  });

  const setReadingGateField = (field, value) => setReadingGate(
    (current) => (current ? { ...current, [field]: value } : current)
  );

  const disableFluency = () => {
    partsChosen.current = false;
    setFluency(null);
  };

  const toggleFluencyPart = (key) => {
    partsChosen.current = true;
    setFluency((current) => {
      if (!current) return current;
      const selected = current.parts.includes(key);
      return {
        ...current,
        parts: selected
          ? current.parts.filter((partKey) => partKey !== key)
          : [...current.parts, key],
      };
    });
  };

  const setFluencyField = (field, value) => {
    setFluency((current) => (current ? { ...current, [field]: value } : current));
  };

  const selectedCoverage = useMemo(() => {
    if (!coverage || !fluency) {
      return { blocks: 0, missing: 0, cents: 0, ready: false };
    }
    const selected = new Set(fluency.parts);
    const blocks = (coverage.levels || []).flatMap((level) => (level.blocks || [])
      .filter((block) => selected.has(block.key))
      .map((block) => ({ ...block, level: level.level })));
    const missing = blocks.filter((block) => !block.generated);
    return {
      blocks: blocks.length,
      missing: missing.length,
      cents: Math.round(missing.reduce((sum, block) => sum + block.estimatedCents, 0) * 100) / 100,
      ready: blocks.filter((block) => block.generated),
    };
  }, [coverage, fluency]);

  const generateSelectedAudio = async () => {
    if (!assignModal || !coverage || !fluency || selectedCoverage.missing === 0) return;
    const selected = new Set(fluency.parts);
    const blocks = (coverage.levels || []).flatMap((level) => (level.blocks || [])
      .filter((block) => selected.has(block.key) && !block.generated)
      .map((block) => ({ key: block.key, level: level.level })));
    const total = blocks.length;
    audioCancelled.current = false;
    setGeneratingAudio(true);
    setAudioProgress({ done: 0, total });
    let generated = 0;
    let failed = 0;
    try {
      // Each request generates one batch; the server reports what is still missing.
      while (!audioCancelled.current) {
        const response = await readingService.generateModelAudio(assignModal._id, blocks);
        const result = response.data?.data || {};
        setCoverage(result.coverage || null);
        generated += Number(result.generated) || 0;
        failed += Number(result.failed) || 0;
        setAudioProgress({ done: generated, total });
        if (!(Number(result.remaining) > 0)) break;
        // No progress means the next call cannot move, so stop instead of looping.
        if (!(Number(result.generated) > 0) || failed > 0) break;
      }
      if (failed > 0) {
        toast.error(t("reading:texts.fluency.generatedPartial", {
          generated,
          failed,
        }));
      } else if (generated > 0) {
        toast.success(t("reading:texts.fluency.generated", { n: generated }));
      } else if (!audioCancelled.current) {
        toast.success(t("reading:texts.fluency.alreadyGenerated"));
      }
    } catch (generateError) {
      toast.error(
        generateError.response?.data?.message || t("reading:texts.fluency.generateFailed"),
      );
    } finally {
      setGeneratingAudio(false);
      setAudioProgress(null);
      audioCancelled.current = false;
    }
  };

  const cancelAudioGeneration = () => {
    audioCancelled.current = true;
  };

  const handleAssignSubmit = (e) => {
    e.preventDefault();
    if (!assignModal || !assignClassId) {
      toast.error(t("reading:texts.toasts.selectClass"));
      return;
    }
    if (generatingAudio) {
      toast.error(t("reading:texts.fluency.waitForAudio"));
      return;
    }

    const publishDate = assignPublished && assignPublishAt
      ? new Date(assignPublishAt)
      : null;
    if (publishDate && !Number.isFinite(publishDate.getTime())) {
      toast.error(t("reading:texts.publish.dateInvalid"));
      return;
    }
    if (publishDate && publishDate.getTime() <= Date.now()) {
      toast.error(t("reading:texts.publish.pastDate"));
      return;
    }

    const payload = {
      textId: assignModal._id,
      classId: assignClassId,
      dueDate: assignDueDate || undefined,
      instructions: assignInstructions.trim() || undefined,
      isPublished: assignPublished,
      publishAt: publishDate ? publishDate.toISOString() : null,
    };

    if (fluency) {
      const minReadings = Number(fluency.minReadings);
      const maxReadingsPerPart = Number(fluency.maxReadingsPerPart);
      const targetAccuracy = Number(fluency.targetAccuracy);
      const targetWpm = fluency.targetWpm === "" ? null : Number(fluency.targetWpm);
      if (fluency.parts.length === 0) {
        toast.error(t("reading:texts.fluency.selectParts"));
        return;
      }
      if (
        !Number.isInteger(minReadings)
        || minReadings < 1
        || minReadings > 10
        || !Number.isInteger(maxReadingsPerPart)
        || maxReadingsPerPart < 1
        || maxReadingsPerPart > 20
        || maxReadingsPerPart < minReadings
      ) {
        toast.error(t("reading:texts.fluency.readingsInvalid"));
        return;
      }
      if (!Number.isInteger(targetAccuracy) || targetAccuracy < 0 || targetAccuracy > 100) {
        toast.error(t("reading:texts.fluency.accuracyInvalid"));
        return;
      }
      if (targetWpm !== null && (!Number.isInteger(targetWpm) || targetWpm < 0 || targetWpm > 400)) {
        toast.error(t("reading:texts.fluency.paceInvalid"));
        return;
      }
      payload.fluency = {
        enabled: true,
        parts: fluency.parts.map((key) => ({ key, level: null })),
        minReadings,
        maxReadingsPerPart,
        targetAccuracy,
        targetWpm,
        showPace: fluency.showPace,
        requireListenFirst: fluency.requireListenFirst,
      };
    }

    if (readingGate) {
      const rawSeconds = String(readingGate.minReadSeconds ?? "").trim();
      let minReadSeconds = null;
      if (rawSeconds !== "") {
        minReadSeconds = Number(rawSeconds);
        if (
          !Number.isInteger(minReadSeconds)
          || minReadSeconds < 0
          || minReadSeconds > 1800
        ) {
          toast.error(t("reading:texts.gate.secondsInvalid"));
          return;
        }
      }
      payload.readingGate = {
        enabled: true,
        lockScope: readingGate.lockScope,
        minReadSeconds,
      };
    }

    setAssignSubmitting(true);
    dispatch(createAssignment(payload))
      .then((result) => {
        if (result.type === "reading/createAssignment/fulfilled") {
          toast.success(t("reading:texts.toasts.assignmentCreated"));
          closeAssignModal();
          dispatch(fetchTeacherAssignments({ academicYear }));
        } else if (result.type === "reading/createAssignment/rejected") {
          toast.error(result.payload || t("reading:texts.toasts.assignmentCreateFailed"));
        }
      })
      .finally(() => setAssignSubmitting(false));
  };

  const assignmentCountByText = (textId) =>
    assignments.filter((a) => a.text?._id === textId).length;

  return {
    texts,
    classes,
    academicYear,
    loading,
    assignModal,
    setAssignModal,
    closeAssignModal,
    assignClassId,
    setAssignClassId,
    assignDueDate,
    setAssignDueDate,
    assignInstructions,
    setAssignInstructions,
    assignPublished,
    setAssignPublished,
    assignPublishAt,
    setAssignPublishAt,
    assignSubmitting,
    openAssignModal,
    handleAssignSubmit,
    assignmentCountByText,
    readingGate,
    enableReadingGate,
    disableReadingGate: () => setReadingGate(null),
    setReadingGateField,
    fluency,
    fluencyAvailable: isEnglishText(assignModal),
    enableFluency,
    disableFluency,
    toggleFluencyPart,
    setFluencyField,
    coverage,
    coverageParts,
    coverageLoading,
    coverageError,
    selectedCoverage,
    generatingAudio,
    audioProgress,
    cancelAudioGeneration,
    generateSelectedAudio,
    onBack: () => navigate("/portal/dashboard"),
    onUpload: () => navigate("/portal/reading/upload"),
    onResults: (textId) =>
      navigate(
        textId
          ? `/portal/reading/assignments?text=${encodeURIComponent(textId)}`
          : "/portal/reading/assignments",
      ),
  };
}
