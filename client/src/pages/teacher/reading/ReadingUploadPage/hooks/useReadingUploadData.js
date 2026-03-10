import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { useDispatch, useSelector } from "react-redux";
import {
  uploadText,
  selectReadingUploading,
  selectReadingError,
} from "../../../../../store/slices/readingSlice.js";
import { fetchClasses, selectClasses } from "../../../../../store/slices/classSlice.js";
import { buildRequestedLanguages } from "../../../../../constants/aiLanguages.js";
import toast from "react-hot-toast";

export function useReadingUploadData() {
  const navigate = useNavigate();
  const dispatch = useDispatch();
  const uploading = useSelector(selectReadingUploading);
  const error = useSelector(selectReadingError);
  const classes = useSelector(selectClasses) || [];

  const [title, setTitle] = useState("");
  const [originalText, setOriginalText] = useState("");
  const [sourceDocument, setSourceDocument] = useState("");
  const [subjectArea, setSubjectArea] = useState("");
  const [topicTagsStr, setTopicTagsStr] = useState("");
  const [classId, setClassId] = useState("");
  const [generateVersions, setGenerateVersions] = useState(true);
  const [aiPrimaryLanguage, setAiPrimaryLanguage] = useState("en");
  const [aiSecondaryLanguage, setAiSecondaryLanguage] = useState("");

  useEffect(() => {
    dispatch(fetchClasses());
  }, [dispatch]);

  useEffect(() => {
    if (error) toast.error(error);
  }, [error]);

  const handleSubmit = (e) => {
    e.preventDefault();
    if (!title.trim()) {
      toast.error("Title is required");
      return;
    }
    if (!originalText.trim()) {
      toast.error("Please paste or enter the text to upload");
      return;
    }
    const topicTags = topicTagsStr
      .split(/[,;]/)
      .map((t) => t.trim())
      .filter(Boolean);
    const requestedLanguages = buildRequestedLanguages(
      aiPrimaryLanguage,
      aiSecondaryLanguage
    );
    const normalizedRequestedLanguages =
      requestedLanguages.length > 0 ? requestedLanguages : ["en"];
    dispatch(
      uploadText({
        title: title.trim(),
        originalText: originalText.trim(),
        sourceDocument: sourceDocument.trim() || undefined,
        subjectArea: subjectArea.trim() || undefined,
        topicTags: topicTags.length ? topicTags : undefined,
        classId: classId || undefined,
        generateVersions,
        requestedLanguages: normalizedRequestedLanguages,
        primaryLanguage: aiPrimaryLanguage || "en",
        secondaryLanguage: aiSecondaryLanguage || "",
      }),
    ).then((result) => {
      if (result.type === "reading/uploadText/fulfilled") {
        toast.success(
          "Text uploaded. Simplified versions and questions are being generated.",
        );
        navigate("/portal/reading/texts");
      }
    });
  };

  return {
    title,
    setTitle,
    originalText,
    setOriginalText,
    sourceDocument,
    setSourceDocument,
    subjectArea,
    setSubjectArea,
    topicTagsStr,
    setTopicTagsStr,
    classId,
    setClassId,
    generateVersions,
    setGenerateVersions,
    aiPrimaryLanguage,
    setAiPrimaryLanguage,
    aiSecondaryLanguage,
    setAiSecondaryLanguage,
    uploading,
    classes,
    handleSubmit,
    onCancel: () => navigate("/portal/reading/texts"),
  };
}
