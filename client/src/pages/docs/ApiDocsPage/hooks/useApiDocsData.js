import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { useSelector } from "react-redux";
import api from "../../../../config/api.js";
import toast from "react-hot-toast";

export function useApiDocsData() {
  const navigate = useNavigate();
  const user = useSelector((state) => state.auth.user);
  const [docs, setDocs] = useState(null);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState("");
  const [expandedCategories, setExpandedCategories] = useState({});
  const [copiedPath, setCopiedPath] = useState(null);

  useEffect(() => {
    if (!user || (user.role !== "admin" && user.role !== "super_admin")) {
      navigate("/portal/dashboard");
      return;
    }
    fetchDocs();
  }, [user, navigate]);

  useEffect(() => {
    const theme = localStorage.getItem("theme") || "dark";
    document.documentElement.setAttribute("data-theme", theme);
  }, []);

  const fetchDocs = async () => {
    setLoading(true);
    try {
      const response = await api.get("/docs");
      setDocs(response.data.data);
      const initialExpanded = {};
      response.data.data.categories.forEach((cat, index) => {
        initialExpanded[index] = index === 0;
      });
      setExpandedCategories(initialExpanded);
    } catch (error) {
      toast.error("Failed to load API documentation");
      console.error(error);
    } finally {
      setLoading(false);
    }
  };

  const toggleCategory = (index) => {
    setExpandedCategories((prev) => ({ ...prev, [index]: !prev[index] }));
  };

  const copyToClipboard = (text) => {
    navigator.clipboard.writeText(text);
    setCopiedPath(text);
    toast.success("Copied to clipboard!");
    setTimeout(() => setCopiedPath(null), 2000);
  };

  const filterEndpoints = (category) => {
    if (!searchTerm) return category.endpoints;
    const term = searchTerm.toLowerCase();
    return category.endpoints.filter(
      (endpoint) =>
        endpoint.path.toLowerCase().includes(term) ||
        endpoint.description.toLowerCase().includes(term) ||
        endpoint.method.toLowerCase().includes(term)
    );
  };

  const filteredCategories =
    docs?.categories.filter((category) => {
      if (!searchTerm) return true;
      return filterEndpoints(category).length > 0;
    }) || [];

  return {
    docs,
    loading,
    searchTerm,
    setSearchTerm,
    expandedCategories,
    copiedPath,
    toggleCategory,
    copyToClipboard,
    filterEndpoints,
    filteredCategories,
  };
}
