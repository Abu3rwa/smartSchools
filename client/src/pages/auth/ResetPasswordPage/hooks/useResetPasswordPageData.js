import { useState, useEffect } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import api from "../../../../config/api.js";
import toast from "react-hot-toast";

/**
 * Data and actions for Reset Password page.
 * Handles token validation, form state, and password reset submit.
 */
export function useResetPasswordPageData() {
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
      toast.error("Invalid reset link");
    }
  }, [token]);

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!token) {
      toast.error("Invalid reset link");
      return;
    }
    if (!password || !confirmPassword) {
      toast.error("Please fill in all fields");
      return;
    }
    if (password.length < 6) {
      toast.error("Password must be at least 6 characters long");
      return;
    }
    if (password !== confirmPassword) {
      toast.error("Passwords do not match");
      return;
    }
    setLoading(true);
    try {
      const response = await api.post("/auth/reset-password", {
        token,
        password,
      });
      if (response.data.success) {
        toast.success("Password reset successful!");
        setTimeout(() => navigate("/login"), 2000);
      }
    } catch (error) {
      toast.error(
        error.response?.data?.message || "Failed to reset password",
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
