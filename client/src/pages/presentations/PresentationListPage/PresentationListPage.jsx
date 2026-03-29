import { useEffect, useState, useCallback } from "react";
import { useDispatch, useSelector } from "react-redux";
import { useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
import toast from "react-hot-toast";
import {
  HiOutlinePlus,
  HiOutlineTrash,
  HiOutlinePencilSquare,
  HiOutlineDocumentArrowDown,
  HiOutlinePresentationChartBar,
} from "react-icons/hi2";

import {
  fetchPresentations,
  deletePresentation,
} from "../../../store/slices/presentationSlice";
import presentationService from "../../../services/presentationService";
import NewPresentationModal from "./NewPresentationModal";
import "./PresentationListPage.css";

const PresentationListPage = () => {
  const { t } = useTranslation(["presentations", "common"]);
  const dispatch = useDispatch();
  const navigate = useNavigate();
  const { list, pagination, loading, error } = useSelector(
    (s) => s.presentations
  );
  const presentations = Array.isArray(list) ? list : [];

  const [showModal, setShowModal] = useState(false);
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);

  useEffect(() => {
    dispatch(fetchPresentations({ page, search, limit: 20 }));
  }, [dispatch, page, search]);

  const handleDelete = useCallback(
    async (id, title) => {
      if (!window.confirm(`Delete "${title}"?`)) return;
      const res = await dispatch(deletePresentation(id));
      if (!res.error) {
        toast.success("Presentation deleted");
      } else {
        toast.error(res.payload || "Delete failed");
      }
    },
    [dispatch]
  );

  const handleExportPdf = useCallback(async (id, title) => {
    try {
      const blob = await presentationService.exportPdf(id);
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `${(title || "presentation").replace(/[^a-zA-Z0-9 ]/g, "")}.pdf`;
      a.click();
      URL.revokeObjectURL(url);
      toast.success("PDF downloaded");
    } catch {
      toast.error("Export failed");
    }
  }, []);

  const statusColors = {
    draft: "#ff9800",
    published: "#4caf50",
    archived: "#9e9e9e",
  };

  return (
    <div className="presentation-list-page">
      <div className="presentation-list-header">
        <div className="presentation-list-header-left">
          <HiOutlinePresentationChartBar size={28} />
          <h1>{t("presentations:title", "Presentations")}</h1>
        </div>
        <button
          className="btn-primary"
          onClick={() => setShowModal(true)}
        >
          <HiOutlinePlus size={18} />
          {t("presentations:newPresentation", "New Presentation")}
        </button>
      </div>

      <div className="presentation-list-toolbar">
        <input
          type="text"
          className="search-input"
          placeholder={t("common:search", "Search...")}
          value={search}
          onChange={(e) => {
            setSearch(e.target.value);
            setPage(1);
          }}
        />
      </div>

      {error && <div className="error-banner">{error}</div>}

      {loading ? (
        <div className="loading-spinner-container">
          <div className="spinner" />
        </div>
      ) : presentations.length === 0 ? (
        <div className="empty-state">
          <HiOutlinePresentationChartBar size={48} />
          <h3>{t("presentations:noPresentations", "No presentations yet")}</h3>
          <p>
            {t(
              "presentations:noPresentationsDesc",
              "Create your first AI-powered classroom presentation."
            )}
          </p>
          <button
            className="btn-primary"
            onClick={() => setShowModal(true)}
          >
            <HiOutlinePlus size={18} />
            {t("presentations:createFirst", "Create Presentation")}
          </button>
        </div>
      ) : (
        <>
          <div className="presentation-grid">
            {presentations.map((p) => (
              <div
                key={p._id}
                className="presentation-card"
                onClick={() => navigate(`/portal/presentations/${p._id}`)}
              >
                <div className="presentation-card-header">
                  <span
                    className="status-badge"
                    style={{ background: statusColors[p.status] || "#ccc" }}
                  >
                    {p.status}
                  </span>
                  <span className="slide-count">
                    {p.slideCount || 0} slides
                  </span>
                </div>
                <h3 className="presentation-card-title">{p.title}</h3>
                {p.description && (
                  <p className="presentation-card-desc">{p.description}</p>
                )}
                <div className="presentation-card-meta">
                  {p.class?.name && (
                    <span className="meta-tag">{p.class.name}</span>
                  )}
                  {p.subject?.name && (
                    <span className="meta-tag">{p.subject.name}</span>
                  )}
                </div>
                <div className="presentation-card-footer">
                  <span className="card-date">
                    {new Date(p.updatedAt).toLocaleDateString()}
                  </span>
                  <div className="card-actions" onClick={(e) => e.stopPropagation()}>
                    <button
                      className="icon-btn"
                      title="Edit"
                      onClick={() =>
                        navigate(`/portal/presentations/${p._id}`)
                      }
                    >
                      <HiOutlinePencilSquare size={16} />
                    </button>
                    <button
                      className="icon-btn"
                      title="Export PDF"
                      onClick={() => handleExportPdf(p._id, p.title)}
                    >
                      <HiOutlineDocumentArrowDown size={16} />
                    </button>
                    <button
                      className="icon-btn icon-btn-danger"
                      title="Delete"
                      onClick={() => handleDelete(p._id, p.title)}
                    >
                      <HiOutlineTrash size={16} />
                    </button>
                  </div>
                </div>
              </div>
            ))}
          </div>

          {pagination && pagination.pages > 1 && (
            <div className="pagination">
              {Array.from({ length: pagination.pages }, (_, i) => (
                <button
                  key={i + 1}
                  className={`page-btn ${page === i + 1 ? "active" : ""}`}
                  onClick={() => setPage(i + 1)}
                >
                  {i + 1}
                </button>
              ))}
            </div>
          )}
        </>
      )}

      {showModal && (
        <NewPresentationModal onClose={() => setShowModal(false)} />
      )}
    </div>
  );
};

export default PresentationListPage;
