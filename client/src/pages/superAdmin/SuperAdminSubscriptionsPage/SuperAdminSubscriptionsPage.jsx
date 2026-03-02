import { useEffect, useMemo, useState } from "react";
import { useDispatch, useSelector } from "react-redux";
import { useNavigate } from "react-router-dom";
import {
  fetchSubscriptions,
  fetchSubscriptionAnalytics,
  createSubscription,
  updateSubscription,
  cancelSubscription,
  clearError,
  clearSuccess,
  selectSubscriptions,
  selectSubscriptionAnalytics,
  selectSubscriptionStatistics,
  selectSubscriptionPlanDistribution,
  selectSubscriptionLoading,
  selectSubscriptionError,
  selectSubscriptionSuccess,
} from "../../../store/slices/subscriptionSlice";
import api from "../../../config/api";
import toast from "react-hot-toast";
import {
  HiOutlineChartBar,
  HiOutlineCreditCard,
  HiOutlineUsers,
  HiOutlineCurrencyDollar,
  HiOutlineSearch,
  HiOutlineFilter,
  HiOutlinePlus,
  HiOutlineEye,
  HiOutlinePencil,
  HiOutlineX,
  HiOutlineCheckCircle,
  HiOutlineXCircle,
  HiOutlineClock,
  HiOutlineArrowUp,
  HiOutlineArrowDown,
  HiOutlineCalendar,
  HiOutlineDocumentText,
  HiOutlineCash,
  HiOutlineSparkles,
  HiOutlineCog,
} from "react-icons/hi";
import "../../../components/superAdmin/SuperAdminBase.css";
import "./SuperAdminSubscriptionsPage.css";

const SuperAdminSubscriptionsPage = () => {
  const dispatch = useDispatch();
  const navigate = useNavigate();

  // Redux state
  const subscriptions = useSelector(selectSubscriptions);
  const analytics = useSelector(selectSubscriptionAnalytics);
  const statistics = useSelector(selectSubscriptionStatistics);
  const planDistribution = useSelector(selectSubscriptionPlanDistribution);
  const loading = useSelector(selectSubscriptionLoading);
  const error = useSelector(selectSubscriptionError);
  const success = useSelector(selectSubscriptionSuccess);

  // Local state
  const [searchTerm, setSearchTerm] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const [planFilter, setPlanFilter] = useState("");
  const [showFilters, setShowFilters] = useState(false);
  const [selectedSubscription, setSelectedSubscription] = useState(null);
  const [showEditModal, setShowEditModal] = useState(false);
  const [showCancelModal, setShowCancelModal] = useState(false);
  const [showAnalyticsModal, setShowAnalyticsModal] = useState(false);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [showPlansModal, setShowPlansModal] = useState(false);
  const [analyticsPeriod, setAnalyticsPeriod] = useState("month");
  const [createForm, setCreateForm] = useState({
    schoolId: "",
    plan: "starter",
    status: "trial",
    trialDays: 14,
    notes: "",
  });
  const [plans, setPlans] = useState([]);
  const [featureDefinitions, setFeatureDefinitions] = useState({});
  const [editingPlanId, setEditingPlanId] = useState(null);
  const [savingPlan, setSavingPlan] = useState(false);
  const [planForm, setPlanForm] = useState({
    key: "",
    name: "",
    description: "",
    billing: { amount: 0, currency: "USD", interval: "month" },
    limits: {
      maxStudents: 50,
      maxTeachers: 10,
      maxClasses: 20,
      maxStorage: 1000,
    },
    features: {},
    isActive: true,
    sortOrder: 0,
  });

  // Schools for create modal
  const [schools, setSchools] = useState([]);

  const createEmptyPlanForm = (definitions = {}) => ({
    key: "",
    name: "",
    description: "",
    billing: { amount: 0, currency: "USD", interval: "month" },
    limits: {
      maxStudents: 50,
      maxTeachers: 10,
      maxClasses: 20,
      maxStorage: 1000,
    },
    features: Object.keys(definitions).reduce((acc, featureKey) => {
      acc[featureKey] = false;
      return acc;
    }, {}),
    isActive: true,
    sortOrder: 0,
  });

  const activePlans = useMemo(
    () => plans.filter((plan) => plan.isActive !== false),
    [plans],
  );
  const planNameByKey = useMemo(
    () =>
      plans.reduce((acc, plan) => {
        acc[plan.key] = plan.name || plan.key;
        return acc;
      }, {}),
    [plans],
  );

  const formatPlanLabel = (planKey = "") =>
    String(planKey || "")
      .replace(/[_-]+/g, " ")
      .replace(/\b\w/g, (char) => char.toUpperCase())
      .trim();

  const getPlanDisplayName = (planKey) => {
    const normalizedKey = String(planKey || "").toLowerCase();
    return planNameByKey[normalizedKey] || formatPlanLabel(normalizedKey);
  };

  const loadPlans = async () => {
    try {
      const response = await api.get(
        "/subscriptions/plans?includeInactive=true",
      );
      const serverPlans = response.data?.data?.plans || [];
      const definitions = response.data?.data?.featureDefinitions || {};
      setPlans(serverPlans);
      setFeatureDefinitions(definitions);
      setPlanForm((prev) => ({
        ...createEmptyPlanForm(definitions),
        key: prev.key,
        name: prev.name,
        description: prev.description,
        billing: prev.billing || {
          amount: 0,
          currency: "USD",
          interval: "month",
        },
        limits: prev.limits || {
          maxStudents: 50,
          maxTeachers: 10,
          maxClasses: 20,
          maxStorage: 1000,
        },
        features: {
          ...createEmptyPlanForm(definitions).features,
          ...(prev.features || {}),
        },
        isActive: prev.isActive ?? true,
        sortOrder: prev.sortOrder ?? 0,
      }));
    } catch (requestError) {
      toast.error(
        requestError.response?.data?.message ||
          "Failed to load subscription plans",
      );
    }
  };

  useEffect(() => {
    dispatch(fetchSubscriptions());
    dispatch(fetchSubscriptionAnalytics(analyticsPeriod));
    loadPlans();
    // Fetch all schools for admin create modal
    api
      .get("/schools?limit=1000")
      .then((res) => {
        setSchools(res.data.data?.schools || []);
      })
      .catch(() => {});
  }, [dispatch, analyticsPeriod]);

  useEffect(() => {
    if (activePlans.length === 0) return;
    setCreateForm((prev) => {
      if (prev.plan && activePlans.some((plan) => plan.key === prev.plan)) {
        return prev;
      }
      return {
        ...prev,
        plan: activePlans[0].key,
      };
    });
  }, [activePlans]);

  useEffect(() => {
    if (error) {
      toast.error(error);
      dispatch(clearError());
    }
    if (success) {
      toast.success(success);
      dispatch(clearSuccess());
    }
  }, [error, success, dispatch]);

  const handleSearch = (e) => {
    setSearchTerm(e.target.value);
    const params = {
      search: e.target.value,
      status: statusFilter,
      plan: planFilter,
    };
    dispatch(fetchSubscriptions(params));
  };

  const handleFilter = (type, value) => {
    if (type === "status") {
      setStatusFilter(value);
    } else if (type === "plan") {
      setPlanFilter(value);
    }

    const params = {
      search: searchTerm,
      status: type === "status" ? value : statusFilter,
      plan: type === "plan" ? value : planFilter,
    };
    dispatch(fetchSubscriptions(params));
  };

  const handleEditSubscription = (subscription) => {
    setSelectedSubscription(subscription);
    setShowEditModal(true);
  };

  const handleCancelSubscription = (subscription) => {
    setSelectedSubscription(subscription);
    setShowCancelModal(true);
  };

  const handleViewDetails = (subscription) => {
    navigate(`/admin/subscriptions/${subscription._id}`);
  };

  const handleUpdateSubscription = async (updateData) => {
    try {
      await dispatch(
        updateSubscription({
          id: selectedSubscription._id,
          updateData,
        }),
      ).unwrap();
      await Promise.all([
        dispatch(fetchSubscriptions()),
        dispatch(fetchSubscriptionAnalytics(analyticsPeriod)),
        loadPlans(),
      ]);
      setShowEditModal(false);
      setSelectedSubscription(null);
    } catch {
      // Errors are surfaced through the shared subscription slice toast handling.
    }
  };

  const handleConfirmCancel = async () => {
    try {
      await dispatch(cancelSubscription(selectedSubscription._id)).unwrap();
      await Promise.all([
        dispatch(fetchSubscriptions()),
        dispatch(fetchSubscriptionAnalytics(analyticsPeriod)),
        loadPlans(),
      ]);
      setShowCancelModal(false);
      setSelectedSubscription(null);
    } catch {
      // Errors are surfaced through the shared subscription slice toast handling.
    }
  };

  const handleCreateSubscription = async () => {
    if (!createForm.schoolId) {
      toast.error("Please select a school");
      return;
    }
    if (activePlans.length === 0) {
      toast.error("No active plans available. Activate a plan first.");
      return;
    }

    try {
      await dispatch(createSubscription(createForm)).unwrap();
      await Promise.all([
        dispatch(fetchSubscriptions()),
        dispatch(fetchSubscriptionAnalytics(analyticsPeriod)),
        loadPlans(),
      ]);
      setShowCreateModal(false);
      setCreateForm((prev) => ({
        schoolId: "",
        plan: activePlans[0]?.key || prev.plan || "starter",
        status: "trial",
        trialDays: 14,
        notes: "",
      }));
    } catch {
      // Errors are surfaced through the shared subscription slice toast handling.
    }
  };

  const openCreatePlanForm = () => {
    setEditingPlanId(null);
    setPlanForm(createEmptyPlanForm(featureDefinitions));
  };

  const openEditPlanForm = (plan) => {
    setEditingPlanId(plan._id);
    setPlanForm({
      key: plan.key || "",
      name: plan.name || "",
      description: plan.description || "",
      billing: {
        amount: plan.billing?.amount ?? 0,
        currency: plan.billing?.currency || "USD",
        interval: plan.billing?.interval || "month",
      },
      limits: {
        maxStudents: plan.limits?.maxStudents ?? 50,
        maxTeachers: plan.limits?.maxTeachers ?? 10,
        maxClasses: plan.limits?.maxClasses ?? 20,
        maxStorage: plan.limits?.maxStorage ?? 1000,
      },
      features: {
        ...createEmptyPlanForm(featureDefinitions).features,
        ...(plan.features || {}),
      },
      isActive: plan.isActive !== false,
      sortOrder: Number.isFinite(Number(plan.sortOrder))
        ? Number(plan.sortOrder)
        : 0,
    });
  };

  const handlePlanFormChange = (section, field, value) => {
    setPlanForm((prev) => {
      if (!section) {
        return { ...prev, [field]: value };
      }
      return {
        ...prev,
        [section]: {
          ...prev[section],
          [field]: value,
        },
      };
    });
  };

  const togglePlanFeature = (featureKey) => {
    setPlanForm((prev) => ({
      ...prev,
      features: {
        ...prev.features,
        [featureKey]: !prev.features?.[featureKey],
      },
    }));
  };

  const handleSavePlan = async () => {
    if (!planForm.key || !planForm.name) {
      toast.error("Plan key and name are required");
      return;
    }

    setSavingPlan(true);
    try {
      const payload = {
        key: planForm.key,
        name: planForm.name,
        description: planForm.description,
        limits: {
          maxStudents: Number(planForm.limits.maxStudents),
          maxTeachers: Number(planForm.limits.maxTeachers),
          maxClasses: Number(planForm.limits.maxClasses),
          maxStorage: Number(planForm.limits.maxStorage),
        },
        billing: {
          amount: Number(planForm.billing.amount),
          currency: planForm.billing.currency,
          interval: planForm.billing.interval,
        },
        features: planForm.features,
        isActive: planForm.isActive,
        sortOrder: Number(planForm.sortOrder),
      };

      if (editingPlanId) {
        await api.put(`/subscriptions/plans/${editingPlanId}`, payload);
        toast.success("Plan updated");
      } else {
        await api.post("/subscriptions/plans", payload);
        toast.success("Plan created");
      }

      await Promise.all([
        loadPlans(),
        dispatch(fetchSubscriptions()),
        dispatch(fetchSubscriptionAnalytics(analyticsPeriod)),
      ]);
      openCreatePlanForm();
    } catch (requestError) {
      toast.error(
        requestError.response?.data?.message || "Failed to save plan",
      );
    } finally {
      setSavingPlan(false);
    }
  };

  const handleTogglePlanStatus = async (plan) => {
    try {
      await api.patch(`/subscriptions/plans/${plan._id}/status`, {
        isActive: !(plan.isActive !== false),
      });
      toast.success(`Plan ${plan.isActive ? "deactivated" : "activated"}`);
      await Promise.all([loadPlans(), dispatch(fetchSubscriptions())]);
    } catch (requestError) {
      toast.error(
        requestError.response?.data?.message || "Failed to update plan status",
      );
    }
  };

  const getStatusColor = (status) => {
    switch (status) {
      case "active":
        return "status-active";
      case "trial":
        return "status-trial";
      case "suspended":
        return "status-suspended";
      case "cancelled":
        return "status-cancelled";
      case "inactive":
        return "status-inactive";
      default:
        return "status-default";
    }
  };

  const getStatusIcon = (status) => {
    switch (status) {
      case "active":
        return <HiOutlineCheckCircle size={16} />;
      case "trial":
        return <HiOutlineClock size={16} />;
      case "suspended":
        return <HiOutlineXCircle size={16} />;
      case "cancelled":
        return <HiOutlineX size={16} />;
      default:
        return <HiOutlineClock size={16} />;
    }
  };

  const getPlanBadgeColor = (plan) => {
    switch (plan) {
      case "starter":
        return "plan-starter";
      case "professional":
        return "plan-professional";
      case "enterprise":
        return "plan-enterprise";
      default:
        return "plan-default";
    }
  };

  const formatCurrency = (amount, currency = "USD") => {
    return new Intl.NumberFormat("en-US", {
      style: "currency",
      currency: currency,
    }).format(amount);
  };

  const formatDate = (date) => {
    return new Date(date).toLocaleDateString();
  };

  const displayedPlanDistribution =
    (planDistribution || []).length > 0
      ? planDistribution.map((entry) => {
          return {
            key: entry.key,
            name: getPlanDisplayName(entry.key),
            count: entry.count,
          };
        })
      : [
          {
            key: "starter",
            name: "Starter",
            count: statistics.starterCount || 0,
          },
          {
            key: "professional",
            name: "Professional",
            count: statistics.professionalCount || 0,
          },
          {
            key: "enterprise",
            name: "Enterprise",
            count: statistics.enterpriseCount || 0,
          },
        ];

  if (loading && subscriptions.length === 0) {
    return (
      <div className="admin-subscriptions-loading">
        <div className="spinner"></div>
        <p>Loading subscriptions...</p>
      </div>
    );
  }

  return (
    <div className="admin-subscriptions-page">
      {/* Header */}
      <div className="page-header">
        <div className="header-content">
          <div className="header-title">
            <h1>Subscription Management</h1>
            <p>Manage all school subscriptions and billing</p>
          </div>
          <div className="header-actions">
            <button
              className="btn btn-secondary"
              onClick={() => setShowAnalyticsModal(true)}
            >
              <HiOutlineChartBar size={20} />
              Analytics
            </button>
            <button
              className="btn btn-secondary"
              onClick={() => {
                setShowPlansModal(true);
                openCreatePlanForm();
              }}
            >
              <HiOutlineCog size={20} />
              Manage Plans
            </button>
            <button
              className="btn btn-primary"
              onClick={() => setShowCreateModal(true)}
            >
              <HiOutlinePlus size={20} />
              Create Subscription
            </button>
          </div>
        </div>
      </div>

      {/* Statistics Cards */}
      <div className="stats-grid">
        <div className="stat-card">
          <div className="stat-icon">
            <HiOutlineUsers size={24} />
          </div>
          <div className="stat-content">
            <h3>{statistics.totalSubscriptions}</h3>
            <p>Total Subscriptions</p>
          </div>
        </div>
        <div className="stat-card">
          <div className="stat-icon active">
            <HiOutlineCheckCircle size={24} />
          </div>
          <div className="stat-content">
            <h3>{statistics.activeSubscriptions}</h3>
            <p>Active Subscriptions</p>
          </div>
        </div>
        <div className="stat-card">
          <div className="stat-icon trial">
            <HiOutlineClock size={24} />
          </div>
          <div className="stat-content">
            <h3>{statistics.trialSubscriptions}</h3>
            <p>Trial Subscriptions</p>
          </div>
        </div>
        <div className="stat-card">
          <div className="stat-icon revenue">
            <HiOutlineCurrencyDollar size={24} />
          </div>
          <div className="stat-content">
            <h3>{formatCurrency(statistics.totalRevenue)}</h3>
            <p>Total Revenue</p>
          </div>
        </div>
      </div>

      {/* Plan Distribution */}
      <div className="plan-distribution">
        <h3>Plan Distribution</h3>
        <div className="plan-stats">
          {displayedPlanDistribution.map((entry) => (
            <div className="plan-stat" key={entry.key}>
              <span className={`plan-badge ${getPlanBadgeColor(entry.key)}`}>
                {entry.name}
              </span>
              <span className="plan-count">{entry.count}</span>
            </div>
          ))}
        </div>
      </div>

      {/* Search and Filters */}
      <div className="search-filters">
        <div className="search-bar">
          <div className="search-input-wrapper">
            <HiOutlineSearch size={20} className="search-icon" />
            <input
              type="text"
              placeholder="Search subscriptions..."
              value={searchTerm}
              onChange={handleSearch}
            />
          </div>
          <button
            className="filter-toggle"
            onClick={() => setShowFilters(!showFilters)}
          >
            <HiOutlineFilter size={20} />
            Filters
          </button>
        </div>

        {showFilters && (
          <div className="filters-panel">
            <div className="filter-group">
              <label>Status</label>
              <select
                value={statusFilter}
                onChange={(e) => handleFilter("status", e.target.value)}
              >
                <option value="">All Statuses</option>
                <option value="active">Active</option>
                <option value="trial">Trial</option>
                <option value="suspended">Suspended</option>
                <option value="cancelled">Cancelled</option>
                <option value="inactive">Inactive</option>
              </select>
            </div>
            <div className="filter-group">
              <label>Plan</label>
              <select
                value={planFilter}
                onChange={(e) => handleFilter("plan", e.target.value)}
              >
                <option value="">All Plans</option>
                {plans.map((plan) => (
                  <option key={plan._id || plan.key} value={plan.key}>
                    {plan.name}
                  </option>
                ))}
              </select>
            </div>
          </div>
        )}
      </div>

      {/* Subscriptions Table */}
      <div className="subscriptions-table-container">
        <table className="subscriptions-table">
          <thead>
            <tr>
              <th>School</th>
              <th>Plan</th>
              <th>Status</th>
              <th>Amount</th>
              <th>Billing Cycle</th>
              <th>Next Billing</th>
              <th>Usage</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            {subscriptions.map((subscription) => (
              <tr key={subscription._id}>
                <td>
                  <div className="school-info">
                    <div
                      className="school-name"
                      title={subscription.school?.name || "Unknown School"}
                    >
                      {subscription.school?.name || "Unknown School"}
                    </div>
                    <div
                      className="school-email"
                      title={subscription.school?.contact?.adminEmail || ""}
                    >
                      {subscription.school?.contact?.adminEmail}
                    </div>
                  </div>
                </td>
                <td>
                  <span
                    className={`plan-badge ${getPlanBadgeColor(subscription.plan)}`}
                    title={getPlanDisplayName(subscription.plan)}
                  >
                    {getPlanDisplayName(subscription.plan)}
                  </span>
                </td>
                <td>
                  <span
                    className={`status-badge ${getStatusColor(subscription.status)}`}
                  >
                    {getStatusIcon(subscription.status)}
                    {subscription.status.charAt(0).toUpperCase() +
                      subscription.status.slice(1)}
                  </span>
                </td>
                <td>{formatCurrency(subscription.billing.amount)}</td>
                <td>
                  <span className="billing-cycle">
                    {subscription.billing.interval}
                  </span>
                </td>
                <td>
                  {subscription.billing.nextBillingAt
                    ? formatDate(subscription.billing.nextBillingAt)
                    : "N/A"}
                </td>
                <td>
                  <div className="usage-info">
                    <div className="usage-bar">
                      <div
                        className="usage-fill"
                        style={{
                          width: `${Math.min(
                            (subscription.usage.currentStudents /
                              subscription.limits.maxStudents) *
                              100,
                            100,
                          )}%`,
                        }}
                      ></div>
                    </div>
                    <span className="usage-text">
                      {subscription.usage.currentStudents}/
                      {subscription.limits.maxStudents}
                    </span>
                  </div>
                </td>
                <td>
                  <div className="actions">
                    <button
                      className="view-action-btn view"
                      onClick={() => handleViewDetails(subscription)}
                    >
                      View Details
                    </button>
                    <button
                      className="edit-action-btn edit"
                      onClick={() => handleEditSubscription(subscription)}
                    >
                      Edit
                    </button>
                    {subscription.status !== "cancelled" && (
                      <button
                        className="cancel-action-btn cancel"
                        onClick={() => handleCancelSubscription(subscription)}
                      >
                        Cancel Subscription
                      </button>
                    )}
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>

        {subscriptions.length === 0 && !loading && (
          <div className="empty-state">
            <div className="empty-icon">
              <HiOutlineCreditCard size={48} />
            </div>
            <h3>No subscriptions found</h3>
            <p>
              Try adjusting your search criteria or create a new subscription.
            </p>
          </div>
        )}
      </div>

      {/* Edit Subscription Modal */}
      {showEditModal && selectedSubscription && (
        <div className="modal-overlay">
          <div className="modal">
            <div className="modal-header">
              <h2>Edit Subscription</h2>
              <button
                className="modal-close"
                onClick={() => setShowEditModal(false)}
              >
                <HiOutlineX size={20} />
              </button>
            </div>
            <div className="modal-body">
              <div className="form-group">
                <label>Plan</label>
                <select
                  id="editSubscriptionPlan"
                  defaultValue={selectedSubscription.plan}
                >
                  {(activePlans.length > 0 ? activePlans : plans).map(
                    (plan) => (
                      <option key={plan._id || plan.key} value={plan.key}>
                        {plan.name}
                      </option>
                    ),
                  )}
                </select>
              </div>
              <div className="form-group">
                <label>Status</label>
                <select
                  id="editSubscriptionStatus"
                  defaultValue={selectedSubscription.status}
                >
                  <option value="trial">Trial</option>
                  <option value="active">Active</option>
                  <option value="suspended">Suspended</option>
                  <option value="inactive">Inactive</option>
                </select>
              </div>
              <div className="form-group">
                <label>Notes</label>
                <textarea
                  id="editSubscriptionNotes"
                  placeholder="Add notes about this subscription change..."
                  defaultValue={selectedSubscription.metadata?.notes || ""}
                  rows="3"
                ></textarea>
              </div>
            </div>
            <div className="modal-footer">
              <button
                className="btn btn-secondary"
                onClick={() => setShowEditModal(false)}
              >
                Cancel
              </button>
              <button
                className="btn btn-primary"
                onClick={() => {
                  const planEl = document.getElementById(
                    "editSubscriptionPlan",
                  );
                  const statusEl = document.getElementById(
                    "editSubscriptionStatus",
                  );
                  const notesEl = document.getElementById(
                    "editSubscriptionNotes",
                  );

                  handleUpdateSubscription({
                    plan: planEl?.value || selectedSubscription.plan,
                    status: statusEl?.value || selectedSubscription.status,
                    notes: notesEl?.value || "",
                  });
                }}
              >
                Update Subscription
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Cancel Confirmation Modal */}
      {showCancelModal && selectedSubscription && (
        <div className="modal-overlay">
          <div className="modal">
            <div className="modal-header">
              <h2>Cancel Subscription</h2>
              <button
                className="modal-close"
                onClick={() => setShowCancelModal(false)}
              >
                <HiOutlineX size={20} />
              </button>
            </div>
            <div className="modal-body">
              <div className="warning-message">
                <HiOutlineXCircle size={48} />
                <h3>Are you sure you want to cancel this subscription?</h3>
                <p>
                  This action will cancel the subscription for{" "}
                  <strong>{selectedSubscription.school?.name}</strong>. The
                  school will lose access to premium features at the end of the
                  billing period.
                </p>
              </div>
            </div>
            <div className="modal-footer">
              <button
                className="btn btn-secondary"
                onClick={() => setShowCancelModal(false)}
              >
                Keep Subscription
              </button>
              <button className="btn btn-danger" onClick={handleConfirmCancel}>
                Cancel Subscription
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Create Subscription Modal */}
      {showCreateModal && (
        <div className="modal-overlay">
          <div className="modal">
            <div className="modal-header">
              <h2>Create Subscription</h2>
              <button
                className="modal-close"
                onClick={() => setShowCreateModal(false)}
              >
                <HiOutlineX size={20} />
              </button>
            </div>
            <div className="modal-body">
              <div className="form-group">
                <label>School *</label>
                <select
                  value={createForm.schoolId}
                  onChange={(e) =>
                    setCreateForm({ ...createForm, schoolId: e.target.value })
                  }
                >
                  <option value="">Select a school...</option>
                  {(schools || []).map((school) => (
                    <option key={school._id} value={school._id}>
                      {school.name}
                    </option>
                  ))}
                </select>
              </div>
              <div className="form-group">
                <label>Plan</label>
                <select
                  value={activePlans.length === 0 ? "" : createForm.plan}
                  onChange={(e) =>
                    setCreateForm({ ...createForm, plan: e.target.value })
                  }
                  disabled={activePlans.length === 0}
                >
                  {activePlans.length === 0 ? (
                    <option value="">No active plans available</option>
                  ) : (
                    activePlans.map((plan) => (
                      <option key={plan._id || plan.key} value={plan.key}>
                        {plan.name} (
                        {formatCurrency(
                          plan.billing?.amount || 0,
                          plan.billing?.currency || "USD",
                        )}
                        /{plan.billing?.interval || "month"})
                      </option>
                    ))
                  )}
                </select>
              </div>
              <div className="form-group">
                <label>Initial Status</label>
                <select
                  value={createForm.status}
                  onChange={(e) =>
                    setCreateForm({ ...createForm, status: e.target.value })
                  }
                >
                  <option value="trial">Trial</option>
                  <option value="active">Active</option>
                </select>
              </div>
              {createForm.status === "trial" && (
                <div className="form-group">
                  <label>Trial Days</label>
                  <input
                    type="number"
                    value={createForm.trialDays}
                    onChange={(e) =>
                      setCreateForm({
                        ...createForm,
                        trialDays: parseInt(e.target.value) || 14,
                      })
                    }
                    min="1"
                    max="90"
                  />
                </div>
              )}
              <div className="form-group">
                <label>Notes</label>
                <textarea
                  value={createForm.notes}
                  onChange={(e) =>
                    setCreateForm({ ...createForm, notes: e.target.value })
                  }
                  placeholder="Optional notes about this subscription..."
                  rows="3"
                ></textarea>
              </div>
            </div>
            <div className="modal-footer">
              <button
                className="btn btn-secondary"
                onClick={() => setShowCreateModal(false)}
              >
                Cancel
              </button>
              <button
                className="btn btn-primary"
                onClick={handleCreateSubscription}
                disabled={activePlans.length === 0}
              >
                <HiOutlinePlus size={20} />
                Create Subscription
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Plan Management Modal */}
      {showPlansModal && (
        <div className="modal-overlay plans-modal">
          <div className="modal plan-manager-modal">
            <div className="modal-header">
              <h2>Manage Plans</h2>
              <button
                className="modal-close"
                onClick={() => setShowPlansModal(false)}
              >
                <HiOutlineX size={20} />
              </button>
            </div>
            <div className="modal-body">
              <div className="plan-manager-grid">
                <div className="plan-manager-list">
                  <div className="plan-manager-list-header">
                    <h3>Existing Plans</h3>
                    <button
                      className="btn btn-secondary"
                      onClick={openCreatePlanForm}
                    >
                      <HiOutlinePlus size={16} />
                      New Plan
                    </button>
                  </div>
                  <div className="plan-manager-items">
                    {plans.map((plan) => (
                      <div
                        className="plan-manager-item"
                        key={plan._id || plan.key}
                      >
                        <div className="plan-manager-item-main">
                          <span
                            className={`plan-badge ${getPlanBadgeColor(plan.key)}`}
                          >
                            {plan.name}
                          </span>
                          <span
                            className={`plan-status-chip ${plan.isActive ? "active" : "inactive"}`}
                          >
                            {plan.isActive ? "Active" : "Inactive"}
                          </span>
                          <span className="plan-manager-item-meta">
                            {plan.key} ·{" "}
                            {formatCurrency(
                              plan.billing?.amount || 0,
                              plan.billing?.currency || "USD",
                            )}
                            /{plan.billing?.interval || "month"} ·{" "}
                            {plan.subscriptionCount || 0} subscriptions
                          </span>
                        </div>
                        <div className="plan-manager-item-actions">
                          <button
                            className="action-btn edit"
                            onClick={() => openEditPlanForm(plan)}
                            title="Edit plan"
                          >
                            <HiOutlinePencil size={14} />
                          </button>
                          <button
                            className={`action-btn ${plan.isActive ? "cancel" : "view"}`}
                            onClick={() => handleTogglePlanStatus(plan)}
                            title={
                              plan.isActive
                                ? "Deactivate plan"
                                : "Activate plan"
                            }
                          >
                            {plan.isActive ? (
                              <HiOutlineX size={14} />
                            ) : (
                              <HiOutlineCheckCircle size={14} />
                            )}
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
                <div className="plan-manager-editor">
                  <h3>{editingPlanId ? "Edit Plan" : "Create Plan"}</h3>
                  <div className="form-group">
                    <label>Plan Key</label>
                    <input
                      type="text"
                      value={planForm.key}
                      onChange={(e) =>
                        handlePlanFormChange(null, "key", e.target.value)
                      }
                      placeholder="e.g. growth_plus"
                      disabled={Boolean(editingPlanId)}
                    />
                    {editingPlanId && (
                      <span className="form-help-text">
                        Plan key is locked after creation to keep existing
                        subscriptions stable.
                      </span>
                    )}
                  </div>
                  <div className="form-group">
                    <label>Plan Name</label>
                    <input
                      type="text"
                      value={planForm.name}
                      onChange={(e) =>
                        handlePlanFormChange(null, "name", e.target.value)
                      }
                      placeholder="Plan display name"
                    />
                  </div>
                  <div className="form-group">
                    <label>Description</label>
                    <textarea
                      rows="2"
                      value={planForm.description}
                      onChange={(e) =>
                        handlePlanFormChange(
                          null,
                          "description",
                          e.target.value,
                        )
                      }
                    />
                  </div>
                  <div className="plan-settings-row">
                    <div className="form-group">
                      <label>Sort Order</label>
                      <input
                        type="number"
                        value={planForm.sortOrder}
                        onChange={(e) =>
                          handlePlanFormChange(
                            null,
                            "sortOrder",
                            e.target.value,
                          )
                        }
                      />
                    </div>
                    <label className="plan-active-toggle">
                      <input
                        type="checkbox"
                        checked={Boolean(planForm.isActive)}
                        onChange={(e) =>
                          handlePlanFormChange(
                            null,
                            "isActive",
                            e.target.checked,
                          )
                        }
                      />
                      <span>Plan is active</span>
                    </label>
                  </div>
                  <div className="plan-form-row">
                    <div className="form-group">
                      <label>Monthly Price</label>
                      <input
                        type="number"
                        min="0"
                        step="0.01"
                        value={planForm.billing.amount}
                        onChange={(e) =>
                          handlePlanFormChange(
                            "billing",
                            "amount",
                            e.target.value,
                          )
                        }
                      />
                    </div>
                    <div className="form-group">
                      <label>Currency</label>
                      <input
                        type="text"
                        value={planForm.billing.currency}
                        onChange={(e) =>
                          handlePlanFormChange(
                            "billing",
                            "currency",
                            e.target.value.toUpperCase(),
                          )
                        }
                      />
                    </div>
                    <div className="form-group">
                      <label>Interval</label>
                      <select
                        value={planForm.billing.interval}
                        onChange={(e) =>
                          handlePlanFormChange(
                            "billing",
                            "interval",
                            e.target.value,
                          )
                        }
                      >
                        <option value="month">month</option>
                        <option value="year">year</option>
                      </select>
                    </div>
                  </div>
                  <div className="plan-form-row">
                    <div className="form-group">
                      <label>Max Students</label>
                      <input
                        type="number"
                        value={planForm.limits.maxStudents}
                        onChange={(e) =>
                          handlePlanFormChange(
                            "limits",
                            "maxStudents",
                            e.target.value,
                          )
                        }
                      />
                    </div>
                    <div className="form-group">
                      <label>Max Teachers</label>
                      <input
                        type="number"
                        value={planForm.limits.maxTeachers}
                        onChange={(e) =>
                          handlePlanFormChange(
                            "limits",
                            "maxTeachers",
                            e.target.value,
                          )
                        }
                      />
                    </div>
                    <div className="form-group">
                      <label>Max Classes</label>
                      <input
                        type="number"
                        value={planForm.limits.maxClasses}
                        onChange={(e) =>
                          handlePlanFormChange(
                            "limits",
                            "maxClasses",
                            e.target.value,
                          )
                        }
                      />
                    </div>
                    <div className="form-group">
                      <label>Max Storage (MB)</label>
                      <input
                        type="number"
                        value={planForm.limits.maxStorage}
                        onChange={(e) =>
                          handlePlanFormChange(
                            "limits",
                            "maxStorage",
                            e.target.value,
                          )
                        }
                      />
                    </div>
                  </div>
                  <div className="plan-features-grid">
                    {Object.entries(featureDefinitions).map(
                      ([featureKey, definition]) => (
                        <label key={featureKey} className="plan-feature-toggle">
                          <input
                            type="checkbox"
                            checked={Boolean(planForm.features?.[featureKey])}
                            onChange={() => togglePlanFeature(featureKey)}
                          />
                          <span>{definition.label}</span>
                        </label>
                      ),
                    )}
                  </div>
                  <div className="plan-editor-actions">
                    <button
                      className="btn btn-secondary"
                      onClick={openCreatePlanForm}
                      disabled={savingPlan}
                    >
                      Clear
                    </button>
                    <button
                      className="btn btn-primary"
                      onClick={handleSavePlan}
                      disabled={savingPlan}
                    >
                      {savingPlan
                        ? "Saving..."
                        : editingPlanId
                          ? "Update Plan"
                          : "Create Plan"}
                    </button>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Analytics Modal */}
      {showAnalyticsModal && (
        <div className="modal-overlay analytics-modal">
          <div className="modal">
            <div className="modal-header">
              <h2>Subscription Analytics</h2>
              <button
                className="modal-close"
                onClick={() => setShowAnalyticsModal(false)}
              >
                <HiOutlineX size={20} />
              </button>
            </div>
            <div className="modal-body">
              <div className="analytics-controls">
                <select
                  value={analyticsPeriod}
                  onChange={(e) => setAnalyticsPeriod(e.target.value)}
                >
                  <option value="week">Last Week</option>
                  <option value="month">Last Month</option>
                  <option value="year">Last Year</option>
                </select>
              </div>

              {analytics ? (
                <div className="analytics-content">
                  {/* Key Metrics */}
                  <div className="analytics-summary">
                    <div className="summary-card">
                      <h4>New Subscriptions</h4>
                      <p>
                        {analytics.analytics.reduce(
                          (sum, item) => sum + item.newSubscriptions,
                          0,
                        )}
                      </p>
                      <span className="summary-period">{analytics.period}</span>
                    </div>
                    <div className="summary-card">
                      <h4>Revenue</h4>
                      <p>
                        {formatCurrency(
                          analytics.analytics.reduce(
                            (sum, item) => sum + item.revenue,
                            0,
                          ),
                        )}
                      </p>
                      <span className="summary-period">{analytics.period}</span>
                    </div>
                    <div className="summary-card">
                      <h4>MRR</h4>
                      <p>{formatCurrency(analytics.mrr)}</p>
                      <span className="summary-period">Monthly</span>
                    </div>
                    <div className="summary-card">
                      <h4>Total Collected</h4>
                      <p>{formatCurrency(analytics.totalCollected)}</p>
                      <span className="summary-period">All time</span>
                    </div>
                  </div>

                  {/* Subscription Trends Chart */}
                  <div className="analytics-chart">
                    <h4>Subscription Trends</h4>
                    <div className="trends-chart">
                      {analytics.analytics.length > 0 ? (
                        <div className="chart-bars">
                          {analytics.analytics.map((item, index) => {
                            const maxValue = Math.max(
                              ...analytics.analytics.map((d) =>
                                Math.max(d.newSubscriptions, d.revenue / 100),
                              ),
                            );
                            const heightPercent =
                              (item.newSubscriptions / maxValue) * 100;
                            return (
                              <div key={index} className="chart-bar-container">
                                <div
                                  className="chart-bar"
                                  style={{ height: `${heightPercent}%` }}
                                >
                                  <span className="chart-value">
                                    {item.newSubscriptions}
                                  </span>
                                </div>
                                <span className="chart-label">
                                  {new Date(
                                    item._id.year,
                                    item._id.month - 1,
                                  ).toLocaleDateString("en-US", {
                                    month: "short",
                                  })}
                                </span>
                              </div>
                            );
                          })}
                        </div>
                      ) : (
                        <div className="chart-placeholder">
                          <HiOutlineChartBar size={48} />
                          <p>No data available for selected period</p>
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Status Breakdown */}
                  <div className="analytics-breakdown">
                    <h4>Status Breakdown</h4>
                    <div className="breakdown-grid">
                      {analytics.statusBreakdown.map((status) => {
                        const total = analytics.statusBreakdown.reduce(
                          (sum, s) => sum + s.count,
                          0,
                        );
                        const percentage = (
                          (status.count / total) *
                          100
                        ).toFixed(1);
                        return (
                          <div key={status._id} className="breakdown-item">
                            <div className="breakdown-header">
                              <span className="breakdown-label">
                                {status._id}
                              </span>
                              <span className="breakdown-count">
                                {status.count}
                              </span>
                            </div>
                            <div className="breakdown-bar">
                              <div
                                className="breakdown-fill"
                                style={{ width: `${percentage}%` }}
                              ></div>
                            </div>
                            <span className="breakdown-percentage">
                              {percentage}%
                            </span>
                          </div>
                        );
                      })}
                    </div>
                  </div>

                  {/* Plan Distribution */}
                  <div className="analytics-breakdown">
                    <h4>Plan Distribution</h4>
                    <div className="plan-grid">
                      {analytics.planDistribution.map((plan) => {
                        const total = analytics.planDistribution.reduce(
                          (sum, p) => sum + p.count,
                          0,
                        );
                        const percentage = ((plan.count / total) * 100).toFixed(
                          1,
                        );
                        return (
                          <div key={plan._id} className="plan-item">
                            <div className="plan-header">
                              <span className="plan-name">
                                {getPlanDisplayName(plan._id)}
                              </span>
                              <span className="plan-count">{plan.count}</span>
                            </div>
                            <div className="plan-revenue">
                              {formatCurrency(plan.revenue)}
                            </div>
                            <div className="plan-bar">
                              <div
                                className="plan-fill"
                                style={{ width: `${percentage}%` }}
                              ></div>
                            </div>
                            <span className="plan-percentage">
                              {percentage}%
                            </span>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                </div>
              ) : (
                <div className="loading-analytics">
                  <div className="spinner"></div>
                  <p>Loading analytics...</p>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default SuperAdminSubscriptionsPage;
