import { useState, useEffect } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import api from "../../../../config/api.js";
import toast from "react-hot-toast";
import { useTranslation } from "react-i18next";

/**
 * Data and actions for Reset Password page.
 * Handles token validation, form state, and password reset submit.
 */
export function useResetPasswordPageData() {
  const { t } = useTranslation(["auth"]);
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const token = searchParams.get("token");

  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [tokenValid, setTokenValid] = useState(true);

  useEffect(() => {
    if (!token) {
      setTokenValid(false);
      toast.error(t("auth:resetPassword.messages.invalidLink"));
    }
  }, [token, t]);

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!token) {
      toast.error(t("auth:resetPassword.messages.invalidLink"));
      return;
    }
    if (!password || !confirmPassword) {
      toast.error(t("auth:resetPassword.messages.fillAllFields"));
      return;
    }
    if (password.length < 6) {
      toast.error(t("auth:resetPassword.messages.passwordMin"));
      return;
    }
    if (password !== confirmPassword) {
      toast.error(t("auth:resetPassword.messages.passwordsDoNotMatch"));
      return;
    }
    setLoading(true);
    try {
      const response = await api.post("/auth/reset-password", {
        token,
        password,
      });
      if (response.data.success) {
        toast.success(t("auth:resetPassword.messages.success"));
        setTimeout(() => navigate("/login"), 2000);
      }
    } catch (error) {
      toast.error(
        error.response?.data?.message || t("auth:resetPassword.messages.submitError"),
      );
    } finally {
      setLoading(false);
    }
  };

  return {
    tokenValid,
    password,
    setPassword,
    confirmPassword,
    setConfirmPassword,
    loading,
    handleSubmit,
  };
}
