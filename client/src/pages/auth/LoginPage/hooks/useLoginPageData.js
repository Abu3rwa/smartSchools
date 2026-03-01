import { useState, useEffect } from "react";
import { useParams, useNavigate } from "react-router-dom";
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
import toast from "react-hot-toast";

export const useLoginPageData = () => {
  const { schoolSlug } = useParams();
  const dispatch = useDispatch();
  const navigate = useNavigate();
  const isAuthenticated = useSelector(selectIsAuthenticated);
  const { loading, error } = useSelector(selectAuth);
  const school = useSelector(selectCurrentSchool);
  const schoolLoading = useSelector(selectSchoolLoading);
  const schoolError = useSelector(selectSchoolError);

  const [formData, setFormData] = useState({ email: "", password: "" });
  const [showPassword, setShowPassword] = useState(false);

  useEffect(() => {
    if (schoolSlug) {
      dispatch(fetchSchoolBySlug(schoolSlug));
    }
  }, [dispatch, schoolSlug]);

  const handleChange = (e) => {
    setFormData({ ...formData, [e.target.name]: e.target.value });
  };

  const handleGoogleLogin = () => {
    dispatch(googleLogin(schoolSlug || null));
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    const result = await dispatch(login(formData));
    if (login.fulfilled.match(result)) {
      toast.success("Welcome back!");
      navigate("/portal");
    } else {
      toast.error(result.payload || "Login failed");
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
  };
};
