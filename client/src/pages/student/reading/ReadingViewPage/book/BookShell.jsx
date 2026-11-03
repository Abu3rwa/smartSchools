import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useSelector } from "react-redux";
import { useTranslation } from "react-i18next";
import { Popover } from "@mui/material";
import {
  HiOutlineArrowLeft,
  HiOutlineVolumeUp,
  HiOutlineX,
} from "react-icons/hi";
import toast from "react-hot-toast";
import { selectUser } from "../../../../../store/slices/authSlice";
import { useReadingViewData } from "../hooks/useReadingViewData";
import {
  planAudio,
  playChain,
  hasRecording,
} from "../../../../../utils/vocabAudio.js";
import { readStoredVoice } from "../../../../../utils/voicePlayback.js";
import {
  buildReadingLevels,
  findLevelIndex,
  mergeVocabulary,
  readingBlocksFor,
} from "../readingPresentation.js";
import { requiredReadSeconds } from "../readingGate.js";
import {
  canSpeak,
  chunkForSpeech,
  speechLang,
  speakChunks,
} from "../readAloud.js";
import { buildBookPages } from "./bookPages.js";
import { paginateBlocks } from "./bookPagination.js";
import { bookDirection, isArabicLanguage } from "./bookDirection.js";
import {
  bookGutter,
  layoutCssVars,
  layoutForWidth,
  passageTextHeight,
} from "./bookLayout.js";
import { readLastPage, writeLastPage } from "./readingBookStorage.js";
import { useReadingBookData } from "./useReadingBookData.js";
import { useBookModelAudio } from "./useBookModelAudio.js";
import PageFlipBook from "./PageFlipBook.jsx";
import CoverPage from "./pages/CoverPage.jsx";
import ContentsPage from "./pages/ContentsPage.jsx";
import ChapterTitlePage from "./pages/ChapterTitlePage.jsx";
import PassagePage from "./pages/PassagePage.jsx";
import GatePage from "./pages/GatePage.jsx";
import QuizPage from "./pages/QuizPage.jsx";
import ResultsPage from "./pages/ResultsPage.jsx";
import LockedPage from "./pages/LockedPage.jsx";
import EndPage from "./pages/EndPage.jsx";
import {
  ChapterLoadingPage,
  ChapterErrorPage,
} from "./pages/ChapterStatePage.jsx";
import "../ReadingViewPage.css";
import "./ReadingBook.css";

const isOptionAnswered = (question, quizAnswers) => {
  const raw = quizAnswers[String(question._id)];
  const index = Number(raw);
  return (
    String(raw ?? "") !== "" &&
    Number.isInteger(index) &&
    index >= 0 &&
    index < (question.options?.length || 0)
  );
};

// Pagination only moves sentence and word breaks, so spacing is the one difference
// between a page's slice of a block and the block the model clip was recorded from.
const sameSpacing = (a, b) =>
  String(a || "")
    .replace(/\s+/g, " ")
    .trim() ===
  String(b || "")
    .replace(/\s+/g, " ")
    .trim();

const BookShell = ({
  startAssignmentId = null,
  startTextId = null,
  showBack = false,
}) => {
  const { t, i18n } = useTranslation(["reading"]);
  const navigate = useNavigate();
  const user = useSelector(selectUser);
  const [unlockedFlashId, setUnlockedFlashId] = useState(null);
  const [highlightChapterId, setHighlightChapterId] = useState(null);

  const {
    chapters,
    academicYear,
    loading: bookLoading,
    error: bookError,
    refresh,
  } = useReadingBookData({
    onChapterUnlocked: (ids) => {
      const chapter = chapters.find((item) => ids.includes(item._id));
      toast.success(
        chapter
          ? t("reading:book.unlockedToast", { number: chapter.chapterNumber })
          : t("reading:book.unlockedToastGeneric"),
      );
      setUnlockedFlashId(ids[0] || null);
    },
  });

  useEffect(() => {
    if (!unlockedFlashId) return undefined;
    const timer = setTimeout(() => setUnlockedFlashId(null), 2600);
    return () => clearTimeout(timer);
  }, [unlockedFlashId]);

  const [activeChapterId, setActiveChapterId] = useState(null);
  const activeChapter = useMemo(
    () => chapters.find((chapter) => chapter._id === activeChapterId) || null,
    [chapters, activeChapterId],
  );
  const activeTextId =
    activeChapter && !activeChapter.locked
      ? activeChapter.text?._id || null
      : null;
  const chapterData = useReadingViewData({
    textId: activeTextId,
    assignmentId: activeChapterId,
    enabled: Boolean(activeTextId),
  });

  const contentMatches =
    String(chapterData.content?.text?._id || "") === String(activeTextId || "");
  const chapterContent = contentMatches ? chapterData.content : null;

  const levels = useMemo(
    () => buildReadingLevels(chapterContent),
    [chapterContent],
  );
  const recommendedIndex = findLevelIndex(levels, chapterContent?.targetLevel);
  const textKey = String(chapterContent?.text?._id || "");
  const [levelSelection, setLevelSelection] = useState({
    textKey: null,
    index: 0,
  });
  const activeLevelIndex =
    levelSelection.textKey === textKey
      ? Math.min(levelSelection.index, levels.length - 1)
      : recommendedIndex;
  const activeLevel = levels[activeLevelIndex];

  const blocks = useMemo(
    () => (activeLevel ? readingBlocksFor(activeLevel) : []),
    [activeLevel],
  );
  const vocabulary = useMemo(
    () =>
      mergeVocabulary(
        chapterContent?.vocabularySubstitutions,
        activeLevel?.vocabularySubstitutions,
      ),
    [chapterContent?.vocabularySubstitutions, activeLevel],
  );
  const passageText = useMemo(
    () =>
      blocks.map((block) => block.text).join("\n\n") ||
      String(chapterContent?.simplifiedContent || ""),
    [blocks, chapterContent?.simplifiedContent],
  );

  const languageCode =
    chapterContent?.text?.language ||
    activeChapter?.text?.language ||
    (i18n.dir() === "rtl" ? "ar" : "en");
  const direction = bookDirection({
    uiLanguage: i18n.language,
    textLanguage: languageCode,
  });
  const textDirection = isArabicLanguage(languageCode) ? "rtl" : "ltr";
  const audioSupported = canSpeak();
  const {
    parts: modelParts,
    play: playModelAudio,
    stop: stopModelAudio,
    preload: preloadModelAudio,
    ready: modelAudioReady,
  } = useBookModelAudio({
    assignmentId: activeChapterId,
    textId: activeTextId,
    enabled: Boolean(activeTextId && activeChapter?.fluency?.enabled),
  });
  const listenAvailable = audioSupported || modelParts.length > 0;
  const listenRequest = useRef(0);

  const [vocab, setVocab] = useState({ anchorEl: null, item: null });
  const [speakingKey, setSpeakingKey] = useState(null);
  const vocabularyPlayback = useRef(null);
  const speechRef = useRef(null);

  const closeVocabulary = useCallback(() => {
    vocabularyPlayback.current?.cancel();
    vocabularyPlayback.current = null;
    setVocab({ anchorEl: null, item: null });
  }, []);

  const stopReadingAloud = useCallback(() => {
    listenRequest.current += 1;
    speechRef.current?.cancel();
    speechRef.current = null;
    stopModelAudio();
    setSpeakingKey(null);
  }, [stopModelAudio]);

  const finishSpeaking = useCallback((pageId) => {
    setSpeakingKey((current) => (current === pageId ? null : current));
  }, []);

  useEffect(
    () => () => {
      listenRequest.current += 1;
      vocabularyPlayback.current?.cancel();
      speechRef.current?.cancel();
      stopModelAudio();
    },
    [stopModelAudio],
  );

  const playVocabularyWord = (item, term) => {
    vocabularyPlayback.current?.cancel();
    vocabularyPlayback.current = playChain({
      urls: planAudio(item?.audio, readStoredVoice()),
      text: item?.original || term,
    });
  };

  const openVocabulary = (event, item, term) => {
    playVocabularyWord(item, term);
    setVocab({ anchorEl: event.currentTarget, item });
  };

  // Model audio is recorded per block, so a page only uses it when it holds those
  // blocks whole; a page split mid-block stays with browser speech.
  const clipsForPage = useCallback(
    (page, parts) => {
      if (!activeLevel || !parts.length) return null;
      const groups = [];
      page.paragraphs.forEach((paragraph) => {
        if (paragraph.instruction) return;
        const blockKey = paragraph.blockKey || paragraph.key;
        const previous = groups[groups.length - 1];
        if (previous && previous.blockKey === blockKey) {
          previous.text = `${previous.text} ${paragraph.text}`;
        } else {
          groups.push({ blockKey, text: paragraph.text });
        }
      });
      if (!groups.length) return null;
      const clips = [];
      for (const group of groups) {
        const block = blocks.find((item) => item.key === group.blockKey);
        if (!block || !sameSpacing(block.text, group.text)) return null;
        const part = parts.find(
          (item) =>
            item.key === group.blockKey &&
            sameSpacing(item.text, block.text) &&
            (item.level === null ||
              item.level === undefined ||
              Number(item.level) === Number(activeLevel.targetLevel)),
        );
        if (!part) return null;
        clips.push(part);
      }
      return clips;
    },
    [activeLevel, blocks],
  );

  const speakPage = useCallback(
    (page, request) => {
      if (!audioSupported) {
        finishSpeaking(page.id);
        return;
      }
      const text = page.paragraphs
        .filter((paragraph) => !paragraph.instruction)
        .map((paragraph) => paragraph.text)
        .join(" ");
      speechRef.current = speakChunks(chunkForSpeech(text), {
        lang: speechLang(languageCode),
        onEnd: () => {
          speechRef.current = null;
          if (request === listenRequest.current) finishSpeaking(page.id);
        },
      });
    },
    [audioSupported, finishSpeaking, languageCode],
  );

  const toggleReadAloud = (page) => {
    if (speakingKey === page.id) {
      stopReadingAloud();
      return;
    }
    closeVocabulary();
    stopReadingAloud();
    const request = listenRequest.current;
    setSpeakingKey(page.id);
    modelAudioReady()
      .then((parts) => {
        if (request !== listenRequest.current) return true;
        const clips = clipsForPage(page, parts);
        if (!clips) return false;
        return playModelAudio(clips, { onEnd: () => finishSpeaking(page.id) });
      })
      .catch(() => false)
      .then((handled) => {
        if (request !== listenRequest.current || handled) return;
        speakPage(page, request);
      });
  };

  const switchLevel = (index) => {
    if (index === activeLevelIndex) return;
    stopReadingAloud();
    closeVocabulary();
    setLevelSelection({ textKey, index });
  };

  // Page sizing and an off-screen sheet with the exact passage typography.
  // The host only mounts once the book has loaded, so a callback ref re-runs the
  // observer setup in that later render instead of missing it on mount.
  const [bookHost, setBookHost] = useState(null);
  const measureRef = useRef(null);
  const [metrics, setMetrics] = useState(() => {
    const layout = layoutForWidth(0);
    return {
      width: 0,
      gutter: bookGutter(0),
      layout,
      pageHeight: 560,
      textWidth: 620,
      textHeight: passageTextHeight(560, layout),
      ready: false,
    };
  });

  useEffect(() => {
    if (!bookHost) return undefined;
    const update = () => {
      const hostWidth = bookHost.clientWidth;
      if (!hostWidth) return;
      const gutter = bookGutter(hostWidth);
      const width = hostWidth - gutter * 2;
      const layout = layoutForWidth(width);
      const pageWidth = layout.wide ? (width - 14) / 2 : width;
      // The page runs from the top of the book to the bottom of the window, less the slim page counter.
      const top = Math.max(0, bookHost.getBoundingClientRect().top);
      const pageHeight = Math.max(
        380,
        Math.min(1100, Math.round(window.innerHeight - top - 40)),
      );
      const next = {
        width,
        gutter,
        layout,
        pageHeight,
        textWidth: Math.max(180, Math.round(pageWidth - layout.padInline * 2)),
        textHeight: passageTextHeight(pageHeight, layout),
        ready: true,
      };
      setMetrics((previous) =>
        previous.width === next.width &&
        previous.gutter === next.gutter &&
        previous.layout.size === next.layout.size &&
        previous.pageHeight === next.pageHeight &&
        previous.textWidth === next.textWidth &&
        previous.textHeight === next.textHeight &&
        previous.ready
          ? previous
          : next,
      );
    };
    update();
    const observer = new ResizeObserver(update);
    observer.observe(bookHost);
    window.addEventListener("resize", update);
    // Fonts settle after first paint and can change measured line heights.
    document.fonts?.ready
      .then(() => {
        if (bookHost.isConnected) update();
      })
      .catch(() => {});
    return () => {
      observer.disconnect();
      window.removeEventListener("resize", update);
    };
  }, [bookHost]);

  const passageBlocks = useMemo(() => {
    if (!activeLevel || !chapterContent) return [];
    return [
      {
        key: "book-instruction",
        instruction: true,
        text: t("reading:book.vocabInstruction"),
      },
      ...readingBlocksFor(activeLevel),
    ];
  }, [activeLevel, chapterContent, t]);

  // Pagination must run after the measuring sheet is in the DOM.
  const [passagePages, setPassagePages] = useState([]);
  const passageSignature = useRef("");

  useEffect(() => {
    if (!passageBlocks.length || !metrics.ready) {
      passageSignature.current = "";
      setPassagePages([]);
      return;
    }
    const host = measureRef.current;
    const measure = (paragraph) => {
      if (!host) {
        const perLine = Math.max(
          20,
          Math.floor(metrics.textWidth / (metrics.layout.textSize * 0.55)),
        );
        const lines = Math.ceil(String(paragraph.text || "").length / perLine);
        return (
          lines * metrics.layout.textLine + 18 + (paragraph.title ? 30 : 0)
        );
      }
      const nodes = [];
      if (paragraph.title) {
        const heading = document.createElement("div");
        heading.className = "book-measure-title";
        heading.textContent = paragraph.title;
        nodes.push(heading);
      }
      const body = document.createElement("p");
      body.className = paragraph.instruction
        ? "book-measure-instruction"
        : "book-measure-paragraph";
      body.textContent = paragraph.text;
      nodes.push(body);
      host.replaceChildren(...nodes);
      return (
        Math.ceil(host.getBoundingClientRect().height) +
        Math.round(metrics.layout.textSize * 0.8)
      );
    };
    const next = paginateBlocks(passageBlocks, measure, {
      pageHeight: metrics.textHeight,
    });
    const signature = JSON.stringify(next);
    if (signature === passageSignature.current) return;
    passageSignature.current = signature;
    setPassagePages(next);
  }, [
    passageBlocks,
    metrics.ready,
    metrics.layout,
    metrics.textWidth,
    metrics.textHeight,
  ]);

  const thinking = useMemo(
    () =>
      [...chapterData.criticalThinkingQuestions].sort(
        (a, b) => (a.order || 0) - (b.order || 0),
      ),
    [chapterData.criticalThinkingQuestions],
  );
  const quiz = useMemo(
    () =>
      [...chapterData.comprehensionQuestions].sort(
        (a, b) => (a.order || 0) - (b.order || 0),
      ),
    [chapterData.comprehensionQuestions],
  );
  const answeredQuiz = quiz.filter((question) =>
    isOptionAnswered(question, chapterData.quizAnswers),
  ).length;
  const answeredThinking = thinking.filter((question) =>
    (chapterData.ctAnswers[String(question._id)] || "").trim(),
  ).length;

  const gateEnabled = Boolean(
    chapterData.readingGate?.enabled && !chapterData.readingGate?.unlocked,
  );
  // The server picks the level; the chip only changes what is displayed.
  const gateRequired = gateEnabled
    ? (chapterData.gateRequiredSeconds ??
      requiredReadSeconds(
        chapterData.readingGate,
        levels[recommendedIndex]?.wordCount,
      ))
    : 0;
  const [reachedEnd, setReachedEnd] = useState(false);

  useEffect(() => {
    setReachedEnd(false);
    stopReadingAloud();
    closeVocabulary();
  }, [activeChapterId, stopReadingAloud, closeVocabulary]);

  const gateElapsed = gateEnabled ? chapterData.gateElapsedSeconds : 0;
  const gateRemaining = Math.max(0, Math.ceil(gateRequired - gateElapsed));
  const gateCanFinish = gateEnabled && gateRemaining <= 0 && reachedEnd;

  const result =
    chapterData.quizSubmitted && chapterData.score?.totalCount > 0
      ? chapterData.score
      : null;

  const status = !activeChapter
    ? "idle"
    : activeChapter.locked
      ? "idle"
      : chapterContent
        ? "ready"
        : chapterData.error
          ? "error"
          : "loading";

  const gate = useMemo(
    () => ({
      enabled: gateEnabled,
      locked: gateEnabled,
      lockScope: chapterData.readingGate?.lockScope || "quiz_and_thinking",
      requiredSeconds: gateRequired,
      elapsedSeconds: gateElapsed,
      remainingSeconds: gateRemaining,
      canFinish: gateCanFinish,
      reachedEnd,
      finishing: chapterData.gateFinishing,
    }),
    [
      gateEnabled,
      chapterData.readingGate?.lockScope,
      gateRequired,
      gateElapsed,
      gateRemaining,
      gateCanFinish,
      reachedEnd,
      chapterData.gateFinishing,
    ],
  );

  const pages = useMemo(
    () =>
      buildBookPages({
        chapters,
        activeChapterId,
        content: {
          status,
          error: chapterData.error,
          pages: passagePages,
          thinking,
          quiz,
          gate,
          result,
        },
      }),
    [
      chapters,
      activeChapterId,
      status,
      chapterData.error,
      passagePages,
      thinking,
      quiz,
      gate,
      result,
    ],
  );

  const [pageIndex, setPageIndex] = useState(0);
  const [visibleIndexes, setVisibleIndexes] = useState([]);
  const currentChapterId = pages[pageIndex]?.chapterId || activeChapterId;
  // The spread start is reported by the book; until it lands, fall back to the page
  // the reader is on so a chapter switch never uses the previous chapter's spread.
  const spreadPage = pages[visibleIndexes[0]];
  const anchorIndex =
    spreadPage && spreadPage.chapterId === currentChapterId
      ? visibleIndexes[0]
      : pageIndex;
  const restoreTarget = useRef(null);
  const deepLinkHandled = useRef(false);
  const pendingResultsJump = useRef(false);

  const contentsIndex = useMemo(() => {
    const index = pages.findIndex((page) => page.kind === "contents");
    return index < 0 ? 0 : index;
  }, [pages]);

  const titleIndexFor = useCallback(
    (chapterId) => {
      const index = pages.findIndex(
        (page) => page.kind === "chapter-title" && page.chapterId === chapterId,
      );
      return index < 0 ? 0 : index;
    },
    [pages],
  );

  const goToContents = useCallback(() => {
    stopReadingAloud();
    closeVocabulary();
    setPageIndex(contentsIndex);
  }, [contentsIndex, stopReadingAloud, closeVocabulary]);

  const openChapter = useCallback(
    (chapter) => {
      if (!chapter) return;
      stopReadingAloud();
      closeVocabulary();
      setActiveChapterId(chapter._id);
      if (chapter.locked) {
        const lockedIndex = pages.findIndex(
          (page) => page.kind === "locked" && page.chapterId === chapter._id,
        );
        setPageIndex(lockedIndex >= 0 ? lockedIndex : contentsIndex);
        setHighlightChapterId(chapter._id);
        return;
      }
      const stored = readLastPage(chapter._id);
      if (stored !== null)
        restoreTarget.current = { chapterId: chapter._id, page: stored };
      setPageIndex(titleIndexFor(chapter._id));
    },
    [pages, contentsIndex, stopReadingAloud, closeVocabulary, titleIndexFor],
  );

  useEffect(() => {
    if (deepLinkHandled.current || !chapters.length) return;
    deepLinkHandled.current = true;
    if (!startAssignmentId && !startTextId) return;
    const chapter = chapters.find((item) =>
      startAssignmentId
        ? String(item._id) === String(startAssignmentId)
        : String(item.text?._id) === String(startTextId),
    );
    if (!chapter) {
      setPageIndex(contentsIndex);
      toast.error(t("reading:book.chapterMissing"));
      return;
    }
    if (chapter.locked) {
      setPageIndex(contentsIndex);
      setHighlightChapterId(chapter._id);
      const date = chapter.publishAt
        ? new Date(chapter.publishAt).toLocaleDateString(i18n.language, {
            month: "short",
            day: "numeric",
          })
        : null;
      toast(
        date
          ? t("reading:book.lockedToastDated", { date })
          : t("reading:book.lockedToastNoDate"),
      );
      return;
    }
    openChapter(chapter);
  }, [
    chapters,
    startAssignmentId,
    startTextId,
    contentsIndex,
    openChapter,
    t,
    i18n.language,
  ]);

  useEffect(() => {
    const target = restoreTarget.current;
    if (!target || target.chapterId !== activeChapterId || !chapterContent)
      return;
    const chapterPageIndexes = pages
      .map((page, index) => ({ page, index }))
      .filter(({ page }) => page.chapterId === target.chapterId)
      .map(({ index }) => index);
    if (!chapterPageIndexes.length) return;
    const first = chapterPageIndexes[0];
    const last = chapterPageIndexes[chapterPageIndexes.length - 1];
    restoreTarget.current = null;
    setPageIndex(Math.max(first, Math.min(last, first + target.page)));
  }, [activeChapterId, chapterContent, pages]);

  useEffect(() => {
    const page = pages[pageIndex];
    if (
      page?.kind === "chapter-title" &&
      page.chapterId &&
      page.chapterId !== activeChapterId
    ) {
      setActiveChapterId(page.chapterId);
    }
  }, [pages, pageIndex, activeChapterId]);

  useEffect(() => {
    const reached = visibleIndexes.some((index) => {
      const page = pages[index];
      return (
        page?.kind === "passage" &&
        page.isLast &&
        page.chapterId === currentChapterId
      );
    });
    if (reached) setReachedEnd(true);
  }, [pages, visibleIndexes, currentChapterId]);

  useEffect(() => {
    if (!restoreTarget.current) {
      const page = pages[anchorIndex];
      if (page?.chapterId) {
        const first = pages.findIndex(
          (item) => item.chapterId === page.chapterId,
        );
        writeLastPage(page.chapterId, Math.max(0, anchorIndex - first));
      }
    }
  }, [pages, anchorIndex]);

  useEffect(() => {
    if (pageIndex > pages.length - 1)
      setPageIndex(Math.max(0, pages.length - 1));
  }, [pages.length, pageIndex]);

  useEffect(() => {
    pendingResultsJump.current = false;
  }, [activeChapterId]);

  const passageKey = `${activeChapterId}|${activeLevel?.targetLevel ?? ""}|${passagePages.length}|${metrics.textHeight}`;
  const previousPassageKey = useRef(passageKey);
  useEffect(() => {
    if (previousPassageKey.current === passageKey) return;
    previousPassageKey.current = passageKey;
    const page = pages[anchorIndex];
    if (page?.kind !== "passage") return;
    const ratio =
      page.pageCount > 1 ? (page.pageNumber - 1) / (page.pageCount - 1) : 0;
    const reflowed = pages.filter(
      (item) => item.kind === "passage" && item.chapterId === page.chapterId,
    );
    const target =
      reflowed[
        Math.min(
          reflowed.length - 1,
          Math.round(ratio * Math.max(0, reflowed.length - 1)),
        )
      ];
    const index = target
      ? pages.findIndex((item) => item.id === target.id)
      : -1;
    if (index >= 0) setPageIndex(index);
  }, [passageKey, pages, anchorIndex]);

  useEffect(() => {
    if (!pendingResultsJump.current || !chapterData.quizSubmitted) return;
    pendingResultsJump.current = false;
    const destination = pages.find(
      (page) =>
        (page.kind === "results" || page.kind === "end") &&
        page.chapterId === activeChapterId,
    );
    if (!destination) return;
    setPageIndex(pages.findIndex((page) => page.id === destination.id));
  }, [chapterData.quizSubmitted, pages, activeChapterId]);

  useEffect(() => {
    stopReadingAloud();
    closeVocabulary();
  }, [anchorIndex, stopReadingAloud, closeVocabulary]);

  // Warm the visible page's clips so a tap plays without a network wait.
  useEffect(() => {
    if (!modelParts.length) return;
    const page = pages[pageIndex];
    if (page?.kind !== "passage") return;
    const clips = clipsForPage(page, modelParts);
    if (clips) preloadModelAudio(clips);
  }, [modelParts, pages, pageIndex, clipsForPage, preloadModelAudio]);

  const handleSubmit = async () => {
    const saved = await chapterData.handleQuizSubmit();
    if (saved) pendingResultsJump.current = true;
  };

  const handleComplete = async () => {
    await chapterData.handleQuizSubmit();
  };

  const questionPages = pages.filter(
    (page) => page.kind === "thinking" || page.kind === "quiz",
  );
  const lastQuestionPageId =
    questionPages[questionPages.length - 1]?.id || null;
  const studentName =
    [user?.firstName, user?.lastName].filter(Boolean).join(" ") ||
    user?.fullName ||
    "";

  const renderPage = (page) => {
    switch (page.kind) {
      case "cover":
        return (
          <CoverPage
            studentName={studentName}
            academicYear={academicYear}
            chapterCount={page.chapterCount}
            completedCount={page.completedCount}
            empty={page.empty}
          />
        );
      case "contents":
        return (
          <ContentsPage
            chapters={chapters}
            onOpen={openChapter}
            highlightChapterId={highlightChapterId}
            unlockedChapterId={unlockedFlashId}
          />
        );
      case "locked":
        return (
          <LockedPage
            chapterNumber={page.chapterNumber}
            publishAt={page.publishAt}
            onContents={goToContents}
          />
        );
      case "chapter-title":
        return (
          <ChapterTitlePage
            chapter={page.chapter}
            loading={chapterContent === null && !chapterData.error}
            levels={page.chapterId === activeChapterId ? levels : []}
            activeLevelIndex={activeLevelIndex}
            recommendedIndex={recommendedIndex}
            levelIsRecommended={chapterContent?.levelIsRecommended}
            onLevelChange={switchLevel}
            onStartFluency={() =>
              navigate(`/portal/reading/${page.chapterId}/practice`)
            }
            onContents={goToContents}
            unlockedFlash={unlockedFlashId === page.chapterId}
          />
        );
      case "chapter-loading":
        return <ChapterLoadingPage chapterNumber={page.chapterNumber} />;
      case "chapter-error":
        return (
          <ChapterErrorPage
            chapterNumber={page.chapterNumber}
            onRetry={chapterData.reload}
            onContents={goToContents}
          />
        );
      case "passage":
        return (
          <PassagePage
            page={page}
            chapterTitle={activeChapter?.text?.title}
            vocabulary={vocabulary}
            onWordClick={openVocabulary}
            onListen={toggleReadAloud}
            onFinish={() => chapterData.handleFinishReading()}
            gate={page.isLast && gateEnabled ? gate : null}
            speaking={speakingKey === page.id}
            listenAvailable={listenAvailable}
            textDirection={textDirection}
            languageCode={languageCode}
          />
        );
      case "gate":
        return (
          <GatePage
            gate={{ ...page.gate, chapterNumber: page.chapterNumber }}
            onFinish={() => chapterData.handleFinishReading()}
            onContents={goToContents}
          />
        );
      case "thinking":
        return (
          <QuizPage
            kind="thinking"
            chapterNumber={page.chapterNumber}
            questions={page.questions}
            startIndex={page.startIndex}
            total={thinking.length}
            answeredCount={answeredThinking}
            answers={chapterData.ctAnswers}
            feedback={chapterData.ctFeedback}
            submitted={chapterData.quizSubmitted}
            submitting={chapterData.progressSubmitting}
            showSubmit={page.id === lastQuestionPageId}
            canSubmit
            onAnswerChange={(key, value) =>
              chapterData.setCtAnswers((prev) => ({ ...prev, [key]: value }))
            }
            onGetFeedback={chapterData.handleGetFeedback}
            onSubmit={handleSubmit}
            onContents={goToContents}
            passageText={passageText}
          />
        );
      case "quiz":
        return (
          <QuizPage
            kind="quiz"
            chapterNumber={page.chapterNumber}
            questions={page.questions}
            startIndex={page.startIndex}
            total={quiz.length}
            answeredCount={answeredQuiz}
            answers={chapterData.quizAnswers}
            submitted={chapterData.quizSubmitted}
            submitting={chapterData.progressSubmitting}
            showSubmit={page.id === lastQuestionPageId}
            canSubmit={answeredQuiz >= quiz.length}
            onAnswerChange={(key, value) =>
              chapterData.setQuizAnswers((prev) => ({ ...prev, [key]: value }))
            }
            onSubmit={handleSubmit}
            onContents={goToContents}
            passageText={passageText}
          />
        );
      case "results":
        return (
          <ResultsPage
            chapterNumber={page.chapterNumber}
            result={page.result}
            onContents={goToContents}
          />
        );
      case "end":
        return (
          <EndPage
            chapterNumber={page.chapterNumber}
            title={activeChapter?.text?.title}
            submitted={chapterData.quizSubmitted}
            submitting={chapterData.progressSubmitting}
            canComplete={!chapterData.quizSubmitted && !chapterData.error}
            onComplete={handleComplete}
            onContents={goToContents}
          />
        );
      default:
        return null;
    }
  };

  const pageLabel = ({ from, to, total }) =>
    from === to
      ? t("reading:book.pageProgress", { page: from, total })
      : t("reading:book.spreadProgress", { from, to, total });

  if (bookLoading && !chapters.length) {
    return (
      <div className="reading-view-page reading-book">
        <div className="reading-column reading-book-column">
          <div className="book-book-loading" aria-busy="true">
            <span className="spinner" />
          </div>
        </div>
      </div>
    );
  }

  if (bookError) {
    return (
      <div className="reading-view-page reading-book" dir={direction}>
        <div className="reading-column reading-book-column">
          <div className="book-book-error" role="alert">
            <h2>{t("reading:book.loadFailed")}</h2>
            <button type="button" className="btn btn-primary" onClick={refresh}>
              {t("reading:book.retry")}
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="reading-view-page reading-book" dir={direction}>
      <div className="reading-column reading-book-column">
        {showBack && (
          <button
            type="button"
            className="btn btn-ghost back-btn"
            onClick={() => navigate("/portal/reading")}
          >
            <HiOutlineArrowLeft size={18} />
            {t("reading:common.back")}
          </button>
        )}

        <div className="reading-book-host" ref={setBookHost}>
          <PageFlipBook
            pages={pages}
            pageIndex={pageIndex}
            onPageChange={setPageIndex}
            onVisiblePagesChange={setVisibleIndexes}
            renderPage={renderPage}
            direction={direction}
            pageLabel={pageLabel}
            announceLabel={pageLabel}
            previousLabel={t("reading:book.previousPage")}
            nextLabel={t("reading:book.nextPage")}
            ariaLabel={(page, number, totalNumber) =>
              page.kind === "cover"
                ? t("reading:book.title")
                : page.kind === "contents"
                  ? t("reading:book.contentsTitle")
                  : t("reading:book.pageProgress", {
                      page: number,
                      total: totalNumber,
                    })
            }
            pageHeight={metrics.pageHeight}
            layout={metrics.layout}
            gutter={metrics.gutter}
          />
        </div>

        <div
          className="book-measure"
          ref={measureRef}
          data-layout={metrics.layout.size}
          style={{
            width: `${metrics.textWidth}px`,
            ...layoutCssVars(metrics.layout),
          }}
          aria-hidden="true"
        />

        <Popover
          open={Boolean(vocab.item && vocab.anchorEl)}
          anchorEl={vocab.anchorEl}
          onClose={closeVocabulary}
          anchorOrigin={{ vertical: "bottom", horizontal: "center" }}
          transformOrigin={{ vertical: "top", horizontal: "center" }}
          slotProps={{
            paper: {
              className: "vocab-pop",
              sx: { width: 300, maxWidth: "calc(100vw - 32px)" },
            },
          }}
        >
          {vocab.item && (
            <>
              <div className="vocab-pop-head">
                <div className="vocab-pop-term">
                  <span className="vocab-pop-word">{vocab.item.original}</span>
                  {vocab.item.simple &&
                    vocab.item.simple !== vocab.item.original && (
                      <span className="vocab-pop-simple">
                        {vocab.item.simple}
                      </span>
                    )}
                </div>
                <button
                  type="button"
                  className="vocab-pop-close"
                  onClick={closeVocabulary}
                  aria-label={t("reading:common.close")}
                >
                  <HiOutlineX size={18} />
                </button>
              </div>
              {(vocab.item.definition || vocab.item.meaning) && (
                <p className="vocab-pop-def">
                  {vocab.item.definition || vocab.item.meaning}
                </p>
              )}
              {vocab.item.arabicMeaning && (
                <p className="vocab-pop-def" lang="ar" dir="rtl">
                  {vocab.item.arabicMeaning}
                </p>
              )}
              <div className="vocab-pop-actions">
                {(audioSupported || hasRecording(vocab.item.audio)) && (
                  <button
                    type="button"
                    className="btn btn-secondary btn-sm"
                    onClick={() =>
                      playVocabularyWord(vocab.item, vocab.item.original)
                    }
                  >
                    <HiOutlineVolumeUp size={16} />
                    {t("reading:view.listen")}
                  </button>
                )}
              </div>
            </>
          )}
        </Popover>
      </div>
    </div>
  );
};

export default BookShell;
