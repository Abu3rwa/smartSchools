import { useState, useEffect } from "react";
import { useParams, useNavigate, useSearchParams } from "react-router-dom";
import { useDispatch, useSelector } from "react-redux";
import {
  login,
  googleLogin,
  selectIsAuthenticated,
  selectAuth,
} from "../../../../store/slices/authSlice";
import {
  fetchSchoolBySlug,
  selectCurrentSchool,
  selectSchoolLoading,
  selectSchoolError,
} from "../../../../store/slices/schoolSlice";
import { API_URL } from "../../../../config/api";
import toast from "react-hot-toast";
import { useTranslation } from "react-i18next";
import {
  normalizeLoginRole,
  normalizeLoginErrorCode,
  readStoredLoginRole,
  storeLoginRole,
} from "../utils/loginPagePresentation";

export const useLoginPageData = () => {
  const { t } = useTranslation(["auth"]);
  const { schoolSlug } = useParams();
  const [searchParams, setSearchParams] = useSearchParams();
  const dispatch = useDispatch();
  const navigate = useNavigate();
  const isAuthenticated = useSelector(selectIsAuthenticated);
  const { loading, error } = useSelector(selectAuth);
  const school = useSelector(selectCurrentSchool);
  const schoolLoading = useSelector(selectSchoolLoading);
  const schoolError = useSelector(selectSchoolError);

  const [formData, setFormData] = useState({ email: "", password: "" });
  const [showPassword, setShowPassword] = useState(false);
  const [role, setRole] = useState(() => (
    normalizeLoginRole(searchParams.get('role')) || readStoredLoginRole()
  ));
  // null = not known yet, so the door is offered rather than wrongly disabled.
  const [googleConfigured, setGoogleConfigured] = useState(null);
  const [errorCode, setErrorCode] = useState(() => (
    normalizeLoginErrorCode(searchParams.get('error'))
  ));

  useEffect(() => {
    if (schoolSlug) {
      dispatch(fetchSchoolBySlug(schoolSlug));
    }
  }, [dispatch, schoolSlug]);

  useEffect(() => {
    const urlRole = normalizeLoginRole(searchParams.get('role'));
    if (urlRole && urlRole !== role) {
      setRole(urlRole);
      storeLoginRole(urlRole);
    }
    if (searchParams.has('role') || searchParams.has('error')) {
      const next = new URLSearchParams(searchParams);
      next.delete('role');
      next.delete('error');
      setSearchParams(next, { replace: true });
    }
    // Runs once on mount: the query parameters only seed the stored choice.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    let cancelled = false;
    // Plain fetch: this probe is silent on purpose, so an unreachable API must
    // not raise the global "cannot reach the server" toast on the login page.
    fetch(`${API_URL}/auth/google/status`, { headers: { Accept: 'application/json' } })
      .then((response) => (response.ok ? response.json() : null))
      .then((payload) => {
        if (cancelled || !payload) return;
        setGoogleConfigured(Boolean(payload.data?.configured));
      })
      .catch(() => {
        // Unknown is not the same as "not set up"; let the door try and let the
        // server report a real failure.
      });
    return () => { cancelled = true; };
  }, []);

  const chooseRole = (nextRole) => {
    const normalized = normalizeLoginRole(nextRole);
    if (!normalized) return;
    setRole(normalized);
    setErrorCode(null);
    storeLoginRole(normalized);
  };

  const switchRole = () => {
    setRole(null);
    setErrorCode(null);
    storeLoginRole(null);
  };

  const handleChange = (e) => {
    setFormData({ ...formData, [e.target.name]: e.target.value });
  };

  const handleGoogleLogin = () => {
    dispatch(googleLogin({ schoolSlug: schoolSlug || null, role }));
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    const result = await dispatch(login(formData));
    if (login.fulfilled.match(result)) {
      toast.success(t("auth:login.toast.welcomeBack"));
      navigate("/portal");
    } else if (result.payload?.code === "TEACHER_GOOGLE_ONLY") {
      // The account is a teacher's: open the door that can actually sign it in.
      chooseRole("teacher");
      setFormData({ email: "", password: "" });
      toast.error(t("auth:login.errors.teacher_google_only"));
    } else {
      toast.error(result.payload?.message || t("auth:login.toast.loginFailed"));
    }
  };

  const isSchoolContext = !!(schoolSlug && school);

  return {
    schoolSlug,
    navigate,
    isAuthenticated,
    loading,
    error,
    school,
    schoolLoading,
    schoolError,
    formData,
    showPassword,
    setShowPassword,
    handleChange,
    handleGoogleLogin,
    handleSubmit,
    isSchoolContext,
    role,
    chooseRole,
    switchRole,
    googleConfigured,
    errorCode,
    dismissError: () => setErrorCode(null),
  };
};
